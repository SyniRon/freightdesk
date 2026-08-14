// The `paste-parsed` event, driven through the App boundary.
//
// The seam is deliberately the whole component: the property under test is
// produced by the interaction between the price fetch, the `pricedParse` memo
// and the emission effect. A test that hands a hook a synthetic price
// lifecycle can stay green while that wiring is broken — which is exactly how
// the bucket came to be wrong in production (issue #91).
import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "../App";
import * as analytics from "../lib/analytics";
import { valueBucket } from "../lib/analytics";
import * as pricing from "../lib/pricing";
import { PricingError } from "../lib/pricing";
import * as locations from "../lib/locations";
import { __setItemsForTesting } from "../lib/items";

// Two items, far enough apart in value to land in different ISK buckets.
const ITEMS = {
  drake: { id: 24698, vol: 15_000 },
  "large shield extender ii": { id: 3831, vol: 5 },
};

// 2 × Drake → 30 000 m³ ("10k-50k"), 200M ISK ("100M-1B").
const DRAKES = "Drake\t2";
// 3 × extender → 15 m³ ("<1k"), 15B ISK ("10B+").
const EXTENDERS = "Large Shield Extender II\t3";

function prices(entries: Array<[number, number]>) {
  return new Map(entries.map(([id, isk]) => [
    id,
    { buy: { percentile: isk, median: isk }, sell: { percentile: isk, median: isk }, at: 0 },
  ]));
}

const DRAKE_PRICES = prices([[24698, 100_000_000]]);
const EXTENDER_PRICES = prices([[3831, 5_000_000_000]]);

// Same item, valued two decades apart depending on which side of the book is
// read — so which price source a report used is visible in its bucket.
const DRAKE_SPLIT_PRICES = new Map([
  [24698, { buy: { percentile: 5_000_000_000, median: 0 }, sell: { percentile: 100_000_000, median: 0 }, at: 0 }],
]);

/**
 * Stands in for the Fuzzwork client, holding each call open so the test
 * decides when — and whether — that paste's prices settle. Aborts reject the
 * way the real client does, so a superseded fetch is distinguishable from a
 * failed one.
 */
function priceFetchController() {
  const pending: Array<{
    ids: number[];
    resolve: (m: Map<number, unknown>) => void;
    reject: (e: unknown) => void;
  }> = [];
  const impl = (ids: number[], signal?: AbortSignal) =>
    new Promise<Map<number, unknown>>((resolve, reject) => {
      pending.push({ ids, resolve, reject });
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  vi.spyOn(pricing, "fetchPrices").mockImplementation(impl as never);
  return pending;
}

let track: MockInstance<typeof analytics.track>;

/** Every `paste-parsed` payload so far, ignoring the other instrumented events. */
function emitted() {
  return track.mock.calls.filter((c) => c[0] === "paste-parsed").map((c) => c[1] ?? {});
}

/**
 * Runs every timer the app is waiting on. Deliberately not stepping the
 * individual debounce delays: once emission is gated on the price state
 * settling, those delays are free to be retuned without changing behaviour.
 */
async function runTimers() {
  await act(async () => {
    vi.advanceTimersByTime(10_000);
    await Promise.resolve();
  });
}

async function mount() {
  render(<App />);
  await act(async () => { await Promise.resolve(); });
  return document.querySelector("textarea.paste-area") as HTMLTextAreaElement;
}

async function paste(textarea: HTMLTextAreaElement, text: string) {
  await act(async () => { fireEvent.change(textarea, { target: { value: text } }); });
}

beforeEach(() => {
  localStorage.clear();
  __setItemsForTesting(ITEMS);
  vi.spyOn(locations, "loadLocations").mockResolvedValue(null as never);
  track = vi.spyOn(analytics, "track").mockImplementation(() => {});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  __setItemsForTesting(null);
});

describe("paste-parsed", () => {
  it("reports the priced value of a paste whose prices arrive late", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, DRAKES);
    await runTimers(); // the analytics debounce would have long elapsed by now
    await act(async () => { fetches[0].resolve(DRAKE_PRICES); });
    await runTimers();

    expect(emitted()).toEqual([expect.objectContaining({ volume: "10k-50k", value: "100M-1B" })]);
  });

  it("does not report a paste whose price fetch failed as a zero-value paste", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, DRAKES);
    await runTimers();
    await act(async () => { fetches[0].reject(new PricingError("server-error", 500)); });
    await runTimers();

    expect(emitted()).toEqual([expect.objectContaining({ volume: "10k-50k", value: "unpriced" })]);
    expect(emitted()[0].value).not.toBe(valueBucket(0));
  });

  // Guards the shape of the failure handling rather than the fix itself: it is
  // tempting to record the settle next to the typed-error handling, which
  // would leave every unrecognised failure waiting forever and stop reporting
  // those pastes at all — a gap in the data that looks like quiet traffic.
  it("still reports a paste when the price fetch fails in an unrecognised way", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, DRAKES);
    await runTimers();
    await act(async () => { fetches[0].reject(new Error("not a PricingError")); });
    await runTimers();

    expect(emitted()).toHaveLength(1);
    expect(emitted()[0].value).not.toBe(valueBucket(0));
  });

  it("reports a paste with nothing priceable in it as a genuinely zero-value paste", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, "Nonexistent Widget\t4");
    await runTimers();

    expect(emitted()).toEqual([expect.objectContaining({ volume: "empty", value: valueBucket(0) })]);
  });

  it("reports the paste the user ended up with, not the one they replaced mid-fetch", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, DRAKES);
    await runTimers(); // the drakes are in flight
    await paste(textarea, EXTENDERS); // …and superseded before they land
    await runTimers();
    await act(async () => { fetches[1].resolve(EXTENDER_PRICES); });
    await runTimers();

    expect(emitted()).toEqual([expect.objectContaining({ volume: "<1k", value: "10B+" })]);
  });

  it("prices each paste against its own fetch, not whichever one settled last", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, DRAKES);
    await runTimers();
    await act(async () => { fetches[0].resolve(DRAKE_PRICES); });
    await runTimers();

    await paste(textarea, EXTENDERS);
    await runTimers();
    await act(async () => { fetches[1].resolve(EXTENDER_PRICES); });
    await runTimers();

    expect(emitted()).toEqual([
      expect.objectContaining({ volume: "10k-50k", value: "100M-1B" }),
      expect.objectContaining({ volume: "<1k", value: "10B+" }),
    ]);
  });

  it("reports a paste again when the box is cleared and the same cargo re-pasted", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, DRAKES);
    await runTimers();
    await act(async () => { fetches[0].resolve(DRAKE_PRICES); });
    await runTimers();

    await paste(textarea, "");
    await runTimers();
    await paste(textarea, DRAKES);
    await runTimers();
    await act(async () => { fetches[1].resolve(DRAKE_PRICES); });
    await runTimers();

    expect(emitted()).toEqual([
      expect.objectContaining({ volume: "10k-50k", value: "100M-1B" }),
      expect.objectContaining({ volume: "10k-50k", value: "100M-1B" }),
    ]);
  });

  it("waits for the price lookup in flight rather than the one it replaced", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, DRAKES);
    await runTimers();
    await act(async () => { fetches[0].resolve(DRAKE_SPLIT_PRICES); });
    await runTimers();

    // Switching the price source re-asks Fuzzwork for the same type ids, so
    // the settle that already happened describes a lookup that no longer
    // applies.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Buy" })); });
    await runTimers();

    await paste(textarea, "Drake\t3");
    await runTimers();
    await act(async () => { fetches[1].resolve(DRAKE_SPLIT_PRICES); });
    await runTimers();

    expect(emitted()[1]).toMatchObject({ volume: "10k-50k", value: "10B+" });
  });

  it("does not report the same paste twice when a setting changes underneath it", async () => {
    const fetches = priceFetchController();
    const textarea = await mount();

    await paste(textarea, DRAKES);
    await runTimers();
    await act(async () => { fetches[0].resolve(DRAKE_PRICES); });
    await runTimers();
    expect(emitted()).toHaveLength(1);

    const pct = screen.getByLabelText("Collateral as % of value");
    await act(async () => {
      fireEvent.change(pct, { target: { value: "150" } });
      fireEvent.blur(pct);
    });
    await runTimers();

    expect(emitted()).toHaveLength(1);
  });
});
