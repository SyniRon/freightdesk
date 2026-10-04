import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

// ADR 0007 privacy contract, checked against what the production bundle
// actually sends. The build under test has Sentry on with a placeholder DSN
// (see playwright.config.ts). The recorder below captures every request to
// that DSN's host and answers it locally, so the assertions read the real
// envelopes.

const SENTRY_HOST = "https://sentry.invalid";
const FUZZWORK_HOST = "https://market.fuzzwork.co.uk";

// A real hangar paste. Its item names must never reach Sentry.
const HANGAR_PASTE = readFileSync(
  new URL("../web/test/fixtures/hangar-pastes/hangar-detailed.txt", import.meta.url),
  "utf8",
);
const HANGAR_ITEM_NAMES = HANGAR_PASTE.split("\n")
  .filter(Boolean)
  .map((line) => line.split("\t")[0]);

// The test serves the hangar's items with 9-digit type IDs. Real IDs are
// 4-5 digits, short enough to turn up by chance inside hex trace IDs or byte
// counts. A 9-digit run won't, so a match in an envelope is a real leak.
const NINE_DIGIT_TYPE_ID_BASE = 987_600_000;

interface EnvelopeItem {
  type: string;
  raw: string;
  payload: unknown;
}

interface Envelope {
  raw: string;
  items: EnvelopeItem[];
}

interface Breadcrumb {
  category?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface SentryErrorEvent {
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: Breadcrumb[];
  request?: { url?: string };
  contexts?: { culture?: { locale?: string } };
  user?: unknown;
  sdk?: { settings?: { infer_ip?: string } };
}

const PROBE_MESSAGE = "probe";

function parseEnvelope(raw: string): Envelope {
  const lines = raw.split("\n");
  const items: EnvelopeItem[] = [];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    const header = JSON.parse(lines[i]) as { type: string };
    let payload: unknown;
    try {
      payload = JSON.parse(lines[i + 1]);
    } catch {
      payload = undefined;
    }
    items.push({ type: header.type, raw: lines[i + 1], payload });
  }
  return { raw, items };
}

class SentryRecorder {
  readonly envelopes: Envelope[] = [];
  // Type IDs the app asked Fuzzwork for: the cargo that must not leak.
  readonly requestedTypeIds = new Set<string>();
  // Whether the next page load continues a sampled trace. tracesSampleRate
  // stays at its production value. A sampled `sentry-trace` meta tag is the
  // SDK's own way to continue a trace, so the SDK records the page-load span.
  sampleNextPageLoad = false;

  spanItems(): EnvelopeItem[] {
    return this.envelopes.flatMap((e) => e.items).filter((i) => i.type === "transaction" || i.type === "span");
  }

  sawFuzzworkSpan(): boolean {
    return this.spanItems().some((i) => i.raw.includes(FUZZWORK_HOST));
  }

  sawPageLoadSpan(): boolean {
    return this.spanItems().some((i) => i.raw.includes('"pageload"'));
  }

  probeEvent(): SentryErrorEvent | undefined {
    return this.envelopes
      .flatMap((e) => e.items)
      .filter((i) => i.type === "event")
      .map((i) => i.payload as SentryErrorEvent)
      .find((event) => event.exception?.values?.some((v) => v.value === PROBE_MESSAGE));
  }

  // Every way the cargo could appear anywhere in an envelope, headers
  // included: the Fuzzwork query string, a requested type ID, or a pasted
  // item name. The meta tag freezes the trace context in envelope headers,
  // but its only URL-derived field is the segment name, which the span
  // payloads carry too.
  cargoLeaks(): string[] {
    const leaks: string[] = [];
    const tokens = [
      { label: "query string", pattern: /types=/ },
      ...[...this.requestedTypeIds].map((id) => ({ label: `type ID ${id}`, pattern: new RegExp(`(?<!\\d)${id}(?!\\d)`) })),
      ...HANGAR_ITEM_NAMES.map((name) => ({ label: `item name "${name}"`, pattern: new RegExp(escapeRegExp(name)) })),
    ];
    for (const envelope of this.envelopes) {
      const types = envelope.items.map((i) => i.type).join("+");
      for (const { label, pattern } of tokens) {
        const match = pattern.exec(envelope.raw);
        if (match) {
          const start = Math.max(0, match.index - 60);
          leaks.push(`${label} in ${types} envelope: …${envelope.raw.slice(start, match.index + 80)}…`);
        }
      }
    }
    return leaks;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function randomHex(length: number): string {
  return randomUUID().replace(/-/g, "").slice(0, length);
}

const test = base.extend<{ sentry: SentryRecorder }>({
  sentry: async ({ page, baseURL }, use) => {
    const recorder = new SentryRecorder();

    await page.route(`${SENTRY_HOST}/**`, async (route) => {
      const body = route.request().postData();
      if (body) recorder.envelopes.push(parseEnvelope(body));
      await route.fulfill({ status: 200, body: "{}", headers: { "access-control-allow-origin": "*" } });
    });

    await page.route(`${FUZZWORK_HOST}/**`, async (route) => {
      const ids = new URL(route.request().url()).searchParams.get("types")?.split(",") ?? [];
      const prices: Record<string, unknown> = {};
      for (const id of ids) {
        recorder.requestedTypeIds.add(id);
        prices[id] = { buy: { percentile: "100", median: "100" }, sell: { percentile: "120", median: "120" } };
      }
      await route.fulfill({ json: prices, headers: { "access-control-allow-origin": "*" } });
    });

    await page.route("**/items.json", async (route) => {
      const items = (await (await route.fetch()).json()) as Record<string, { id: number; vol: number }>;
      HANGAR_ITEM_NAMES.forEach((name, i) => {
        const key = name.toLowerCase();
        items[key] = { ...items[key], id: NINE_DIGIT_TYPE_ID_BASE + i };
      });
      await route.fulfill({ json: items });
    });

    await page.route(
      (url) => url.origin === new URL(baseURL!).origin && url.pathname === "/",
      async (route) => {
        const response = await route.fetch();
        let html = await response.text();
        if (recorder.sampleNextPageLoad) {
          const traceId = randomHex(32);
          const meta =
            `<meta name="sentry-trace" content="${traceId}-${randomHex(16)}-1">` +
            `<meta name="baggage" content="sentry-trace_id=${traceId},sentry-sampled=true,sentry-sample_rand=0.000001,sentry-sample_rate=1">`;
          html = html.replace("<head>", `<head>${meta}`);
        }
        await route.fulfill({ response, body: html });
      },
    );

    await use(recorder);
    // A test can end while a handler is still reading items.json. Let it
    // finish, or closing the page disposes the response mid-read.
    await page.unrouteAll({ behavior: "wait" });
  },
});

async function pasteHangar(page: Page) {
  await page.locator("textarea.paste-area").fill(HANGAR_PASTE);
}

// Thrown from a timer so it reaches Sentry's global handler (ADR 0007).
async function throwProbe(page: Page) {
  await page.evaluate((message) => {
    setTimeout(() => {
      throw new Error(message);
    }, 0);
  }, PROBE_MESSAGE);
}

test.beforeEach(async ({ page, sentry }) => {
  await page.goto("/");
  // The paste box unlocks once the item DB has loaded. Tests that navigate
  // straight away would otherwise cancel that request mid-handler.
  await expect(page.locator("textarea.paste-area")).toBeEnabled();
  await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("eveship.")).forEach((k) => localStorage.removeItem(k)),
  );
  sentry.envelopes.length = 0;
});

test("a return visit's page-load trace carries no cargo", async ({ page, sentry }) => {
  // First visit, unsampled: the app saves the paste for next time.
  await pasteHangar(page);
  await expect.poll(() => sentry.requestedTypeIds.size).toBe(HANGAR_ITEM_NAMES.length);

  // Return visit: the saved paste fires the price fetch inside the page-load span.
  sentry.sampleNextPageLoad = true;
  const fuzzworkRequest = page.waitForRequest((r) => r.url().startsWith(FUZZWORK_HOST));
  await page.reload();
  await fuzzworkRequest;

  // Channel guard: the price fetch reached Sentry as a span, so the check below is not vacuous.
  await expect.poll(() => sentry.sawFuzzworkSpan(), { timeout: 20_000 }).toBe(true);

  expect(sentry.cargoLeaks()).toEqual([]);
});

test("a fresh paste with no active span carries no cargo", async ({ page, sentry }) => {
  sentry.sampleNextPageLoad = true;
  await page.reload();
  // The page-load span has ended and been sent, so nothing is active when the paste lands.
  await expect.poll(() => sentry.sawPageLoadSpan(), { timeout: 20_000 }).toBe(true);

  await pasteHangar(page);
  await expect.poll(() => sentry.requestedTypeIds.size).toBe(HANGAR_ITEM_NAMES.length);
  await throwProbe(page);

  // Channel guards: the price fetch reached Sentry both as a span and as a
  // breadcrumb on the error event, so the check below is not vacuous.
  await expect.poll(() => sentry.sawFuzzworkSpan(), { timeout: 20_000 }).toBe(true);
  await expect
    .poll(() => {
      const event = sentry.probeEvent();
      return !!event && (event.breadcrumbs ?? []).some((b) => String(b.data?.url ?? "").startsWith(FUZZWORK_HOST));
    })
    .toBe(true);

  expect(sentry.cargoLeaks()).toEqual([]);
});

test("an error event does not identify the visitor", async ({ page, sentry, baseURL }) => {
  const cookieValue = "fd-probe-cookie-73914";
  await page.context().addCookies([{ name: "fd_probe", value: cookieValue, url: baseURL! }]);
  await page.goto("/?probe=query-secret");
  await throwProbe(page);

  await expect.poll(() => sentry.probeEvent()).toBeDefined();
  const event = sentry.probeEvent()!;

  expect(event.sdk?.settings?.infer_ip).toBe("never");
  expect(event.user).toBeUndefined();
  expect(event.request?.url ?? "").not.toContain("?");
  // Sentry 11's browser SDK reads no cookies on its default path, so removing
  // `cookies: false` alone doesn't redden this. It catches an SDK release
  // that starts sending cookies anyway.
  expect(sentry.envelopes.filter((e) => e.raw.includes(cookieValue))).toEqual([]);
});

// Visitor location (ADR 0007): a time zone places the visitor below country
// level wherever a country has more than one, as Brazil does. Only the
// browser could have supplied this zone.
const VISITOR_TIME_ZONE = "America/Noronha";
const VISITOR_LOCALE = "pt-BR";

test.describe("visitor location", () => {
  test.use({ timezoneId: VISITOR_TIME_ZONE, locale: VISITOR_LOCALE });

  test("neither an error event nor a sampled trace carries the visitor's time zone", async ({ page, sentry }) => {
    sentry.sampleNextPageLoad = true;
    await page.reload();
    await throwProbe(page);

    // Channel guards: a trace and an error event both reached Sentry, so the check below is not vacuous.
    await expect.poll(() => sentry.sawPageLoadSpan(), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => sentry.probeEvent()).toBeDefined();

    const carriers = sentry.envelopes
      .filter((e) => e.raw.includes(VISITOR_TIME_ZONE))
      .map((e) => e.items.map((i) => i.type).join("+"));
    expect(carriers).toEqual([]);
  });

  test("an error event still carries the visitor's locale", async ({ page, sentry }) => {
    await throwProbe(page);

    await expect.poll(() => sentry.probeEvent()).toBeDefined();
    expect(sentry.probeEvent()!.contexts?.culture?.locale).toBe(VISITOR_LOCALE);
  });
});

test("clicks and typing inside data-sensitive regions leave no breadcrumbs", async ({ page, sentry }) => {
  // Each interaction gets a window from its start to the next one's start,
  // read from the page clock that Sentry stamps breadcrumbs with. The pause
  // keeps each window clear of Sentry's 1s breadcrumb debounce.
  const starts: number[] = [];
  const interact = async (act: () => Promise<void>) => {
    starts.push(await page.evaluate(() => Date.now()));
    await act();
    await page.waitForTimeout(1_500);
  };

  // Controls: a non-sensitive click and non-sensitive typing.
  await interact(() => page.getByRole("button", { name: /Load example into paste box/i }).click());
  await expect(page.locator(".copy-row").first()).toBeVisible();
  await interact(async () => {
    await page.locator(".loc-btn").first().click();
    await page.locator(".loc-input").pressSequentially("Jita");
    await page.keyboard.press("Escape");
  });
  // Sensitive: a copy-value row, then the paste box.
  await interact(() => page.locator(".copy-row").first().click());
  await interact(async () => {
    await page.locator("textarea.paste-area").click();
    await page.keyboard.type("1");
  });
  starts.push(await page.evaluate(() => Date.now()));
  await throwProbe(page);

  await expect.poll(() => sentry.probeEvent()).toBeDefined();
  const uiCrumbs = (sentry.probeEvent()!.breadcrumbs ?? []).filter(
    (b) => b.category === "ui.click" || b.category === "ui.input",
  );
  const categoriesIn = (window: number) =>
    uiCrumbs
      .filter((b) => {
        const ms = Math.round(b.timestamp * 1000);
        return ms >= starts[window] && ms < starts[window + 1];
      })
      .map((b) => b.category);

  expect({
    exampleButtonClicked: categoriesIn(0).includes("ui.click"),
    locationSearchTyped: categoriesIn(1).includes("ui.input"),
    copyRow: categoriesIn(2),
    pasteBox: categoriesIn(3),
  }).toEqual({
    exampleButtonClicked: true,
    locationSearchTyped: true,
    copyRow: [],
    pasteBox: [],
  });
});
