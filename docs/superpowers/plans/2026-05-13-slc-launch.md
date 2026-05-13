# FreightDesk SLC Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship FreightDesk to `freightdesk.syniron.com` with a hangar-paste → contract-values flow for one alliance shipper (Delve TUE), Jita ↔ alliance staging only, by the Sunday SLC deadline.

**Architecture:** Static Vite/React/TS bundle served by a Caddy container on synicloud behind Cloudflare Tunnel — no Go backend. Item volumes come from a build-time SDE+ESI pipeline emitting `web/public/items.json`; live prices come from Fuzzwork aggregates fetched directly from the browser (CORS verified `*`).

**Tech Stack:** Vite 5 + React 18 + TypeScript 5, pnpm. Vitest for unit tests, Playwright for E2E (system Chromium snap, per global CLAUDE.md). Build-time SDE pipeline in Node/TypeScript. Caddy 2 (static `file_server`) + cloudflared for production. Stack lives at `/opt/syni/stacks/freightdesk/` on synicloud.

**Out of SLC scope:** PushX/Red Frog (return post-SLC), git-driven rate config, self-hosted analytics, multi-leg routes, alliance-structure-picker beyond hardcoded SLC-K7, EVE SSO auth, server-persisted state.

**User-supplied values needed mid-plan** (callouts at each task that needs them):
- Alliance shipper rate card (ratePerM3, collateralPct, minReward, maxVol, maxCollateral, etaHours)
- Real SLC-K7 alliance staging structure name (exact in-game listing string)
- Cloudflare Tunnel token for the new tunnel

---

## File Structure

**New (created by this plan):**
- `web/vitest.config.ts` — Vitest setup
- `web/src/lib/__tests__/logic.test.ts` — pure-function tests (parser, eligibility, formatters, sec tier)
- `web/src/lib/__tests__/storage.test.ts` — localStorage helpers
- `web/src/lib/pricing.ts` — Fuzzwork client + price-source mapping + in-mem cache
- `web/src/lib/__tests__/pricing.test.ts` — pricing tests with mocked fetch
- `web/src/lib/items.ts` — runtime items-DB loader (replaces the static `itemsDb.ts`)
- `web/src/lib/__tests__/items.test.ts` — loader + name-lookup tests
- `web/public/items.json` — build-output: full `{name → {id, vol}}` index from SDE+ESI (gitignored)
- `web/public/favicon.svg` — drop the 404
- `web/scripts/build-sde.ts` — Node script: SDE download → JSONL parse → ESI enrichment → items.json
- `web/scripts/cache/.gitkeep` — local cache dir for the SDE ZIP between rebuilds (gitignored)
- `e2e/freightdesk.spec.ts` — Playwright E2E against `pnpm preview` build
- `e2e/playwright.config.ts` — Playwright config, system Chromium
- `Dockerfile` — multi-stage: pnpm install → vite build → caddy file_server
- `docker-compose.yml` — `app` + `cloudflared` services
- `Caddyfile` — Caddy config (file_server, SPA fallback)
- `.env.example` — `TUNNEL_TOKEN=`
- `README.md` — public-facing repo readme
- `docs/deploy.md` — synicloud + Cloudflare Tunnel deploy walkthrough

**Modified:**
- `web/package.json` — add scripts (`test`, `test:e2e`, `build:sde`, prebuild hook), add devDeps (vitest, @testing-library/*, playwright, esbuild-runner or tsx)
- `web/src/lib/logic.ts` — strip SERVICES to alliance only; real rate card values; real SLC-K7 location; consume items module
- `web/src/lib/itemsDb.ts` — **delete** (replaced by `items.ts` + items.json)
- `web/src/App.tsx` — items loader on mount, loading state, pricing fetch wiring
- `web/src/components/PasteBlock.tsx` — loading state when items DB not ready
- `web/src/components/AboutFooter.tsx` — real ISK_ADDRESS
- `web/src/components/SettingsDrawer.tsx` — wire collOverride + priceSource to actual state used by pricing
- `web/index.html` — favicon link
- `web/.gitignore` — add `public/items.json`, `scripts/cache/`
- `CLAUDE.md` — update Status section, note items.json build step, deploy URL
- `/home/syniron/obsidian/directorate/projects/syni-eve-shipping-calc.md` — flip Status when shipped

**Deleted:**
- `web/src/lib/itemsDb.ts` — superseded by `web/src/lib/items.ts` + `public/items.json`

---

## Phase 1 — Test scaffold + cheap wins (Wed evening)

### Task 1: Vitest + Testing-Library install

**Files:**
- Create: `web/vitest.config.ts`
- Modify: `web/package.json`
- Modify: `web/tsconfig.json` (add vitest globals)

- [ ] **Step 1: Install deps**

```bash
cd web && pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Add `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 3: Add `web/src/test-setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Update `web/tsconfig.json`**

Set `"types": ["vitest/globals", "@testing-library/jest-dom"]` under `compilerOptions`.

- [ ] **Step 5: Add `test` script to `web/package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Verify smoke**

Run: `pnpm test`
Expected: `No test files found` exit 0 (or non-zero with that message; tolerate either).

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/vitest.config.ts web/src/test-setup.ts web/tsconfig.json
git commit -m "test: add vitest + testing-library scaffold"
```

---

### Task 2: Test the paste parser

**Files:**
- Create: `web/src/lib/__tests__/logic.test.ts`

- [ ] **Step 1: Write parser tests**

```ts
import { describe, expect, it } from "vitest";
import { parseHangarPaste } from "../logic";

// NOTE: parseHangarPaste reads ITEM_DB from the items module. For these tests
// we'll temporarily import the legacy itemsDb.ts; once Task 9 replaces the
// static DB with the runtime loader, update these tests to inject a fixture.
import "../itemsDb";

describe("parseHangarPaste", () => {
  it("parses tab-separated hangar lines", () => {
    const r = parseHangarPaste("Drake\t2\nPLEX\t500");
    expect(r.matched).toHaveLength(2);
    expect(r.matched.find((m) => m.name === "Drake")?.qty).toBe(2);
    expect(r.matched.find((m) => m.name === "PLEX")?.qty).toBe(500);
  });

  it("parses 'x N' chat-style lines", () => {
    const r = parseHangarPaste("Hobgoblin II x 10");
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].qty).toBe(10);
  });

  it("treats lone item names as qty 1", () => {
    const r = parseHangarPaste("Damage Control II");
    expect(r.matched[0].qty).toBe(1);
  });

  it("sums duplicates by key", () => {
    const r = parseHangarPaste("Drake\t2\nDrake\t3");
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].qty).toBe(5);
  });

  it("flags unknown item names as unmatched", () => {
    const r = parseHangarPaste("Nyx Supercarrier\t1");
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched).toHaveLength(1);
    expect(r.unmatched[0].name).toBe("Nyx Supercarrier");
  });

  it("computes totalVol from vol × qty", () => {
    // Drake = 15000 m³ in stub DB
    const r = parseHangarPaste("Drake\t2");
    expect(r.totalVol).toBe(30000);
  });

  it("computes totalValue from price × qty", () => {
    // PLEX price = 3_950_000 in stub
    const r = parseHangarPaste("PLEX\t10");
    expect(r.totalValue).toBe(39_500_000);
  });

  it("ignores blank lines and whitespace", () => {
    const r = parseHangarPaste("\n  \nDrake\t1\n\n");
    expect(r.matched).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run + verify pass**

Run: `pnpm test src/lib/__tests__/logic.test.ts`
Expected: 8 tests passing.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/__tests__/logic.test.ts
git commit -m "test: cover parseHangarPaste shape + math"
```

---

### Task 3: Test eligibility evaluator + formatters + sec tier + location resolver

**Files:**
- Modify: `web/src/lib/__tests__/logic.test.ts`

- [ ] **Step 1: Append the rest of the pure-function coverage**

```ts
import {
  evaluateServices,
  fmtISK,
  fmtVol,
  fmtSec,
  secTier,
  resolveLocation,
  makeCustomLocation,
  LOCATIONS,
  SERVICES,
} from "../logic";

describe("evaluateServices", () => {
  const origin = LOCATIONS.find((l) => l.id === "jita44")!;
  const dest = LOCATIONS.find((l) => l.id === "slc")!;
  // NOTE: When SERVICES is stripped to alliance-only (Task 5) these counts shift
  // from 3 to 1. Update the .toHaveLength assertions then.

  it("returns one quote per service", () => {
    const parse = { matched: [], unmatched: [], totalVol: 1000, totalValue: 100_000_000 };
    expect(evaluateServices(parse, origin, dest)).toHaveLength(SERVICES.length);
  });

  it("marks ineligible when route doesn't match", () => {
    const amarr = LOCATIONS.find((l) => l.id === "amarr")!;
    const parse = { matched: [], unmatched: [], totalVol: 1000, totalValue: 100_000_000 };
    const quotes = evaluateServices(parse, amarr, dest);
    const alliance = quotes.find((q) => q.service.id === "alliance")!;
    expect(alliance.eligible).toBe(false);
    expect(alliance.reasons[0]).toMatch(/route/i);
  });

  it("marks ineligible when volume exceeds cap", () => {
    const parse = { matched: [], unmatched: [], totalVol: 999_999_999, totalValue: 0 };
    const quotes = evaluateServices(parse, origin, dest);
    const alliance = quotes.find((q) => q.service.id === "alliance")!;
    expect(alliance.eligible).toBe(false);
    expect(alliance.reasons.some((r) => r.includes("Volume"))).toBe(true);
  });

  it("applies minReward floor", () => {
    const parse = { matched: [], unmatched: [], totalVol: 1, totalValue: 0 };
    const quotes = evaluateServices(parse, origin, dest);
    const alliance = quotes.find((q) => q.service.id === "alliance")!;
    expect(alliance.reward).toBe(alliance.service.minReward);
  });

  it("custom destinations are ineligible everywhere", () => {
    const custom = makeCustomLocation("XX-XYZ");
    const parse = { matched: [], unmatched: [], totalVol: 100, totalValue: 100_000_000 };
    const quotes = evaluateServices(parse, origin, custom);
    expect(quotes.every((q) => !q.eligible)).toBe(true);
  });
});

describe("formatters", () => {
  it("fmtISK uses B/M/K suffixes at thresholds", () => {
    expect(fmtISK(2_500_000_000)).toBe("2.50B");
    expect(fmtISK(45_400_000)).toBe("45.40M");
    expect(fmtISK(8_750)).toBe("8.8K");
    expect(fmtISK(120)).toBe("120");
  });
  it("fmtVol appends m³", () => {
    expect(fmtVol(1500.7)).toBe("1,500.7 m³");
  });
  it("returns em-dash on nullish input", () => {
    expect(fmtISK(undefined)).toBe("—");
    expect(fmtVol(NaN)).toBe("—");
  });
});

describe("secTier", () => {
  it("classifies high/low/null by sec value", () => {
    expect(secTier(0.9).tier).toBe("high");
    expect(secTier(0.3).tier).toBe("low");
    expect(secTier(-0.4).tier).toBe("null");
    expect(secTier(null).tier).toBe("unknown");
  });
  it("fmtSec formats one decimal", () => {
    expect(fmtSec(0.945)).toBe("0.9");
    expect(fmtSec(null)).toBe("—");
  });
});

describe("resolveLocation", () => {
  it("hydrates legacy string id state", () => {
    const loc = resolveLocation("jita44", "amarr");
    expect(loc.id).toBe("jita44");
  });
  it("preserves custom-flagged objects", () => {
    const stored = makeCustomLocation("ABC-123");
    const loc = resolveLocation(stored, "jita44");
    expect(loc.custom).toBe(true);
    expect(loc.short).toBe("ABC-123");
  });
  it("falls back when stored id no longer exists", () => {
    const loc = resolveLocation("deleted-id", "jita44");
    expect(loc.id).toBe("jita44");
  });
});
```

- [ ] **Step 2: Run + verify**

Run: `pnpm test src/lib/__tests__/logic.test.ts`
Expected: all tests passing.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/__tests__/logic.test.ts
git commit -m "test: cover evaluateServices, formatters, secTier, resolveLocation"
```

---

### Task 4: Test storage helpers

**Files:**
- Create: `web/src/lib/__tests__/storage.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { LS } from "../storage";

describe("LS", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips objects", () => {
    LS.set("k1", { a: 1, b: "two" });
    expect(LS.get<{ a: number; b: string }>("k1", { a: 0, b: "" })).toEqual({ a: 1, b: "two" });
  });

  it("returns default when key missing", () => {
    expect(LS.get("missing", "fallback")).toBe("fallback");
  });

  it("returns default on JSON parse error", () => {
    localStorage.setItem("eveship.broken", "{not json");
    expect(LS.get("broken", "ok")).toBe("ok");
  });
});
```

- [ ] **Step 2: Run + verify**

Run: `pnpm test src/lib/__tests__/storage.test.ts`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/__tests__/storage.test.ts
git commit -m "test: cover LS helpers"
```

---

### Task 5: Strip SERVICES to alliance-only

**Files:**
- Modify: `web/src/lib/logic.ts`
- Modify: `web/src/lib/__tests__/logic.test.ts` (update count assertions)
- Modify: `web/src/App.tsx` (default selected service is already `"alliance"` — verify)

> **REQUIRES USER INPUT:** real alliance shipper rate card before this task.
> Fields: `ratePerM3`, `collateralPct`, `minReward`, `maxVol`, `maxCollateral`, `etaHours`, and the literal exact in-game listing string for the alliance staging structure (replaces "SLC-K7 - Alliance Staging Keepstar" placeholder).
> If the rate card isn't ready, do Task 5 with the stub values intact and revisit before deploy.

- [ ] **Step 1: Delete PushX + Red Frog entries**

In `web/src/lib/logic.ts`, replace the `SERVICES` array with just the alliance entry. Update values from rate card.

```ts
export const SERVICES: Service[] = [
  {
    id: "alliance",
    name: "Delve TUE",                      // user-supplied display name
    tagline: "Internal alliance freight • discord ping on accept",
    routes: [
      ["jita44", "slc"],
      ["slc", "jita44"],
    ],
    ratePerM3: 450,                         // ← rate card value
    collateralPct: 0.015,                   // ← rate card value
    minReward: 5_000_000,                   // ← rate card value
    maxVol: 360_000,                        // ← rate card value
    maxCollateral: 8_000_000_000,           // ← rate card value
    etaHours: 18,                           // ← rate card value
    updated: new Date().toISOString().slice(0, 10),  // hardcoded for SLC
  },
];
```

- [ ] **Step 2: Update SLC-K7 LOCATION entry with real structure name**

In `web/src/lib/logic.ts`, replace the `slc` entry's `name` with the exact in-game listing string. Keep `short: "SLC-K7"` for the picker badge.

- [ ] **Step 3: Update the `evaluateServices` test counts**

Change `.toHaveLength(SERVICES.length)` (already SERVICES.length, no change needed) — but check that the route-mismatch and volume-cap tests still refer to `"alliance"`.

- [ ] **Step 4: Run tests + verify pass**

Run: `pnpm test`
Expected: all passing.

- [ ] **Step 5: Visual smoke**

```bash
cd web && pnpm dev
```

Open http://localhost:5173, load example, confirm:
- Only one service card (alliance) shown
- No "Pick a courier" empty-state error
- Default route Jita 4-4 ↔ SLC-K7 still works

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/logic.ts web/src/lib/__tests__/logic.test.ts
git commit -m "feat: strip to alliance-only service for SLC + real rate card"
```

---

### Task 6: Real ISK tip-jar address + favicon

**Files:**
- Modify: `web/src/components/AboutFooter.tsx`
- Create: `web/public/favicon.svg`
- Modify: `web/index.html`

- [ ] **Step 1: Update `AboutFooter.tsx`**

```ts
const ISK_ADDRESS = "Delve Time Unit Expenditures";
```

- [ ] **Step 2: Add favicon**

Create `web/public/favicon.svg` — a simple monogram (F/D) in copper on dark, matches brand:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#1a120b"/>
  <text x="50%" y="55%" font-family="Space Grotesk, sans-serif" font-weight="600"
        font-size="14" fill="#e89149" text-anchor="middle" dominant-baseline="middle"
        letter-spacing="0.5">F/D</text>
</svg>
```

- [ ] **Step 3: Link favicon in `web/index.html`**

In the `<head>`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

- [ ] **Step 4: Smoke**

`pnpm dev`, confirm favicon shows in browser tab, no 404 in network panel.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/AboutFooter.tsx web/public/favicon.svg web/index.html
git commit -m "feat: real ISK tip jar address + favicon"
```

---

## Phase 2 — Build-time SDE pipeline (Fri partial)

### Task 7: Add tsx + node-fetch deps, scaffold `build-sde` script

**Files:**
- Modify: `web/package.json` (add `tsx`, `adm-zip` devDeps; add `build:sde` script)
- Create: `web/scripts/build-sde.ts` (skeleton)
- Modify: `web/.gitignore`

- [ ] **Step 1: Install deps**

```bash
cd web && pnpm add -D tsx adm-zip @types/adm-zip
```

(Node 24 has native `fetch`, no node-fetch needed.)

- [ ] **Step 2: Add `web/scripts/build-sde.ts` skeleton**

```ts
#!/usr/bin/env tsx
// Builds web/public/items.json from CCP's static data dump.
//
// 1. Download (or read cached) JSONL ZIP from CCP
// 2. Parse `types.jsonl` — keep id, name (en), packagedVolume, categoryID
// 3. For categories where packagedVolume is broken (7, 18, 32, 87), enrich
//    via ESI /universe/types/{id}/ — uses the `packaged_volume` field.
// 4. Emit web/public/items.json shaped as:
//      { "<lowercase-name>": { "id": number, "vol": number } }

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import AdmZip from "adm-zip";

const SDE_URL =
  "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const CACHE_DIR = path.join(import.meta.dirname, "cache");
const ZIP_PATH = path.join(CACHE_DIR, "sde.zip");
const OUT_PATH = path.join(import.meta.dirname, "..", "public", "items.json");

// Categories where SDE packagedVolume is missing/zero — Reprocessing Helper learning.
const ESI_ENRICH_CATEGORIES = new Set([7, 18, 32, 87]);

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });

  // STUBS — filled in by subsequent tasks:
  console.error("not yet implemented");
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Add `build:sde` script in `web/package.json`**

```json
"build:sde": "tsx scripts/build-sde.ts",
"prebuild": "test -f public/items.json || pnpm build:sde"
```

The `prebuild` hook ensures `pnpm build` regenerates items.json if it's missing (e.g. on a clean clone).

- [ ] **Step 4: Update `web/.gitignore`**

Append:
```
public/items.json
scripts/cache/
```

- [ ] **Step 5: Run + verify script is wired**

```bash
cd web && pnpm build:sde
```

Expected: "not yet implemented" stderr, exit 2. Script located + tsx working.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/scripts/build-sde.ts web/.gitignore
git commit -m "build: scaffold SDE pipeline script + tsx runner"
```

---

### Task 8: Implement SDE download + parse

**Files:**
- Modify: `web/scripts/build-sde.ts`

- [ ] **Step 1: Add download-with-cache + JSONL parse**

Replace the `main()` body with:

```ts
async function downloadSde(): Promise<Buffer> {
  // Cache the zip locally — it's ~50MB and rebuilds shouldn't re-download.
  // Invalidate when the cached file is older than 7 days.
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  try {
    const s = await stat(ZIP_PATH);
    if (Date.now() - s.mtimeMs < STALE_MS) {
      console.error(`[sde] using cached ${ZIP_PATH}`);
      return await readFile(ZIP_PATH);
    }
  } catch {
    /* not cached yet */
  }
  console.error(`[sde] downloading ${SDE_URL}`);
  const res = await fetch(SDE_URL);
  if (!res.ok || !res.body) throw new Error(`SDE download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(ZIP_PATH));
  return await readFile(ZIP_PATH);
}

interface SdeType {
  id: number;
  name: string;
  packagedVolume: number;
  categoryID: number;
  published: boolean;
}

function parseTypesJsonl(zipBuf: Buffer): SdeType[] {
  const zip = new AdmZip(zipBuf);
  // SDE bundles each "schema" as one .jsonl file. The types file is `types.jsonl`
  // inside the ZIP. Path layout may include a leading directory — search broadly.
  const entry = zip.getEntries().find((e) => e.entryName.endsWith("/types.jsonl") || e.entryName === "types.jsonl");
  if (!entry) throw new Error("types.jsonl not found in SDE zip");
  const text = entry.getData().toString("utf8");
  const out: SdeType[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const t = JSON.parse(line);
    if (!t.published) continue; // skip retired/test types
    out.push({
      id: t.typeID,
      name: typeof t.name === "object" ? t.name.en : t.name,
      packagedVolume: Number(t.packagedVolume ?? 0),
      categoryID: Number(t.categoryID ?? 0),
      published: true,
    });
  }
  return out;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  const zipBuf = await downloadSde();
  const types = parseTypesJsonl(zipBuf);
  console.error(`[sde] parsed ${types.length} published types`);

  // TODO Task 9: ESI enrichment + emit JSON
  console.error("ESI enrichment not yet wired");
  process.exit(2);
}
```

- [ ] **Step 2: Run + verify parse step**

```bash
cd web && pnpm build:sde
```

Expected: stderr shows `[sde] parsed N published types` where N is roughly 30k–40k.

If the SDE schema turns out to be different (e.g. typeID vs id, name shape) — adjust the field accesses based on what `cat scripts/cache/sde.zip | unzip -l` actually contains. Use the first ~5 records via `console.error(JSON.stringify(out.slice(0, 5)))` for debugging.

- [ ] **Step 3: Commit**

```bash
git add web/scripts/build-sde.ts
git commit -m "build: SDE download + types.jsonl parse"
```

---

### Task 9: ESI enrichment + emit items.json

**Files:**
- Modify: `web/scripts/build-sde.ts`

- [ ] **Step 1: Add ESI enrichment + emit**

Append after `parseTypesJsonl`, replace `main()` tail:

```ts
async function enrichViaEsi(types: SdeType[]): Promise<Map<number, number>> {
  // Returns typeID → packaged_volume for the broken categories.
  // ESI is rate-limited to ~150 req/sec across all users — be polite.
  const toEnrich = types.filter((t) => ESI_ENRICH_CATEGORIES.has(t.categoryID));
  console.error(`[esi] enriching ${toEnrich.length} types`);
  const enriched = new Map<number, number>();
  const CONCURRENCY = 20;
  let idx = 0;
  async function worker(workerNum: number) {
    while (idx < toEnrich.length) {
      const i = idx++;
      const t = toEnrich[i];
      try {
        const r = await fetch(`https://esi.evetech.net/latest/universe/types/${t.id}/?datasource=tranquility`);
        if (!r.ok) {
          console.error(`[esi] ${t.id} ${t.name} → ${r.status}`);
          continue;
        }
        const data = await r.json();
        if (typeof data.packaged_volume === "number") {
          enriched.set(t.id, data.packaged_volume);
        }
      } catch (e) {
        console.error(`[esi] ${t.id} ${t.name} → ${(e as Error).message}`);
      }
      if (i % 500 === 0) console.error(`[esi] ${i}/${toEnrich.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, n) => worker(n)));
  console.error(`[esi] enriched ${enriched.size}/${toEnrich.length}`);
  return enriched;
}

async function emit(types: SdeType[], enriched: Map<number, number>) {
  const out: Record<string, { id: number; vol: number }> = {};
  for (const t of types) {
    const vol = enriched.get(t.id) ?? t.packagedVolume;
    if (!vol || vol <= 0) continue; // skip zero-volume types (blueprints, skills…)
    const key = t.name.toLowerCase();
    // Collision policy: keep the lower typeID (older, usually canonical).
    if (key in out && out[key].id < t.id) continue;
    out[key] = { id: t.id, vol };
  }
  const json = JSON.stringify(out);
  await writeFile(OUT_PATH, json);
  console.error(`[emit] wrote ${OUT_PATH} (${Object.keys(out).length} items, ${(json.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  const zipBuf = await downloadSde();
  const types = parseTypesJsonl(zipBuf);
  console.error(`[sde] parsed ${types.length} published types`);
  const enriched = await enrichViaEsi(types);
  await emit(types, enriched);
}
```

- [ ] **Step 2: Run end-to-end**

```bash
cd web && pnpm build:sde
```

Expected: progress log every 500 ESI calls, final "wrote .../items.json (N items, K KB)" with N ~ 30k and K under 2000 (under 2MB raw, ~500KB gzipped on the wire).

ESI step will take ~3-5 minutes for ~4,200 types at concurrency 20.

- [ ] **Step 3: Sanity-check the output**

```bash
node -e "const d = require('./web/public/items.json'); console.log('drake:', d['drake']); console.log('damage control ii:', d['damage control ii']); console.log('plex:', d['plex']);"
```

Expected: Drake vol ~15000, Damage Control II vol ~5, PLEX vol 0.01. If module volumes look like 0 or wildly wrong, ESI enrichment isn't merging — debug.

- [ ] **Step 4: Commit**

```bash
git add web/scripts/build-sde.ts
git commit -m "build: ESI enrichment + items.json emit"
```

---

### Task 10: Items loader module + tests

**Files:**
- Create: `web/src/lib/items.ts`
- Create: `web/src/lib/__tests__/items.test.ts`
- Modify: `web/src/lib/logic.ts` (parseHangarPaste reads from the loader instead of static import)
- Delete: `web/src/lib/itemsDb.ts` AFTER everything else is wired (Task 11)

- [ ] **Step 1: Add `items.ts` with async loader**

```ts
// Runtime items DB. Fetches /items.json on first call, caches in module scope.
// Test code can call `__setItemsForTesting()` to inject a fixture.

export interface ItemEntry {
  id: number;
  vol: number;
}

let cache: Record<string, ItemEntry> | null = null;
let inflight: Promise<Record<string, ItemEntry>> | null = null;

export async function loadItems(): Promise<Record<string, ItemEntry>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/items.json")
    .then((r) => {
      if (!r.ok) throw new Error(`items.json fetch failed: ${r.status}`);
      return r.json() as Promise<Record<string, ItemEntry>>;
    })
    .then((data) => {
      cache = data;
      inflight = null;
      return data;
    });
  return inflight;
}

export function getItemsSync(): Record<string, ItemEntry> | null {
  return cache;
}

// Test-only — resets module state.
export function __setItemsForTesting(items: Record<string, ItemEntry> | null) {
  cache = items;
  inflight = null;
}

// Example paste — kept here so the empty-state hero stays self-contained.
export const EXAMPLE_PASTE = [
  "Drake\t2",
  "Large Shield Extender II\t12",
  "Damage Control II\t4",
  "Scourge Fury Heavy Assault Missile\t4800",
  "Hobgoblin II\t10",
  "Nanite Repair Paste\t250",
  "PLEX\t500",
].join("\n");
```

- [ ] **Step 2: Add `items.test.ts`**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { __setItemsForTesting, loadItems } from "../items";

describe("loadItems", () => {
  beforeEach(() => __setItemsForTesting(null));

  it("fetches /items.json on first call and caches", async () => {
    const fixture = { drake: { id: 24698, vol: 15000 } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    });
    vi.stubGlobal("fetch", fetchMock);

    const a = await loadItems();
    const b = await loadItems();
    expect(a).toEqual(fixture);
    expect(b).toBe(a); // same reference
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(loadItems()).rejects.toThrow(/503/);
  });
});
```

- [ ] **Step 3: Run + verify**

```bash
pnpm test src/lib/__tests__/items.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/items.ts web/src/lib/__tests__/items.test.ts
git commit -m "feat: async items loader + tests"
```

---

### Task 11: Switch parseHangarPaste to use the loader, replace itemsDb.ts

**Files:**
- Modify: `web/src/lib/logic.ts` (parseHangarPaste signature change)
- Modify: `web/src/App.tsx` (load items on mount, render loading state)
- Modify: `web/src/components/PasteBlock.tsx` (loading state)
- Modify: `web/src/lib/__tests__/logic.test.ts` (inject items fixture)
- Delete: `web/src/lib/itemsDb.ts`

- [ ] **Step 1: Change `parseHangarPaste` to take items as an argument**

In `logic.ts`:

```ts
import type { ItemEntry } from "./items";

export function parseHangarPaste(raw: string, db: Record<string, ItemEntry>): ParseResult {
  // ... same body, but replace `const hit = ITEM_DB[key];` with `const hit = db[key];`
  // and `vol: hit.vol, price: hit.price` becomes `vol: hit.vol, price: 0`
  // (price is now backfilled by the pricing module — Task 12).
}
```

Remove the top-level `import { ITEM_DB } from "./itemsDb"`.

The `MatchedLine` type already has `price`. Keep it but default to 0 — pricing fills it in later.

- [ ] **Step 2: Update `EXAMPLE_PASTE` import location**

`App.tsx` and `EmptyState.tsx` currently import `EXAMPLE_PASTE` from `./lib/itemsDb`. Change to `./lib/items`. Search-and-replace.

- [ ] **Step 3: Wire async loader in `App.tsx`**

```tsx
import { loadItems, type ItemEntry } from "./lib/items";

// inside App component, near other state:
const [items, setItems] = useState<Record<string, ItemEntry> | null>(null);
const [itemsError, setItemsError] = useState<string | null>(null);

useEffect(() => {
  loadItems().then(setItems).catch((e) => setItemsError(String(e)));
}, []);

const parse = useMemo(
  () => (items ? parseHangarPaste(raw, items) : { matched: [], unmatched: [], totalVol: 0, totalValue: 0 }),
  [raw, items],
);
```

- [ ] **Step 4: Loading state in `PasteBlock.tsx`**

Add an optional `itemsLoading` prop. If true, show a "Loading item database…" label inside the meter cells in place of the dashes, and disable the textarea. Pass it from App.

- [ ] **Step 5: Update tests**

In `logic.test.ts`, build a fixture and pass to `parseHangarPaste`:

```ts
const TEST_DB = {
  "drake": { id: 24698, vol: 15000 },
  "plex": { id: 44992, vol: 0.01 },
  "hobgoblin ii": { id: 2456, vol: 5 },
  "damage control ii": { id: 2048, vol: 5 },
};
// rename test bodies to call parseHangarPaste(raw, TEST_DB)
```

Drop the `totalValue` assertion that depended on stubbed prices — price is 0 now until Task 12 wires real pricing. Keep the `totalVol` assertion.

- [ ] **Step 6: Delete `itemsDb.ts`**

```bash
git rm web/src/lib/itemsDb.ts
```

- [ ] **Step 7: Run all tests + manual smoke**

```bash
pnpm test
pnpm dev
```

Open page, confirm: items.json fetches from `/items.json`, "Drake\t2" → 30000 m³. The Est. value cell shows 0 ISK or em-dash since prices aren't wired yet.

- [ ] **Step 8: Commit**

```bash
git add -u web/src web/
git commit -m "feat: switch parseHangarPaste to runtime items DB"
```

---

## Phase 3 — Live pricing (Sat morning)

### Task 12: Pricing module + Fuzzwork client

**Files:**
- Create: `web/src/lib/pricing.ts`
- Create: `web/src/lib/__tests__/pricing.test.ts`

- [ ] **Step 1: Add `pricing.ts`**

```ts
// Fuzzwork aggregates client. CORS verified — direct from browser.
// Caches by typeID with 5min TTL matching Fuzzwork's Cache-Control header.

export type PriceSource = "sell 5%" | "sell median" | "buy 95%";

const JITA_REGION_ID = 10000002;
const TTL_MS = 5 * 60 * 1000;
const CHUNK_SIZE = 200;

interface CachedPrice {
  buy: { percentile: number; median: number };
  sell: { percentile: number; median: number };
  at: number;
}

const cache = new Map<number, CachedPrice>();

interface FuzzworkAgg {
  buy: { percentile: string; median: string };
  sell: { percentile: string; median: string };
}

export async function fetchPrices(typeIds: number[]): Promise<Map<number, CachedPrice>> {
  const now = Date.now();
  const stale = typeIds.filter((id) => {
    const c = cache.get(id);
    return !c || now - c.at > TTL_MS;
  });
  // Dedupe and chunk
  const unique = Array.from(new Set(stale));
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const url = `https://market.fuzzwork.co.uk/aggregates/?region=${JITA_REGION_ID}&types=${chunk.join(",")}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fuzzwork ${r.status}`);
    const data = (await r.json()) as Record<string, FuzzworkAgg>;
    for (const [idStr, agg] of Object.entries(data)) {
      const id = Number(idStr);
      cache.set(id, {
        buy: { percentile: Number(agg.buy.percentile), median: Number(agg.buy.median) },
        sell: { percentile: Number(agg.sell.percentile), median: Number(agg.sell.median) },
        at: now,
      });
    }
  }
  // Return only the requested ids that are now in cache.
  const out = new Map<number, CachedPrice>();
  for (const id of typeIds) {
    const c = cache.get(id);
    if (c) out.set(id, c);
  }
  return out;
}

export function priceFor(p: CachedPrice, source: PriceSource): number {
  switch (source) {
    case "sell 5%":     return p.sell.percentile;   // lowest 5% sell — optimistic
    case "sell median": return p.sell.median;
    case "buy 95%":     return p.buy.percentile;    // top 5% buy — conservative
  }
}

// Test-only
export function __resetPricingCacheForTesting() {
  cache.clear();
}
```

- [ ] **Step 2: Add `pricing.test.ts`**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { __resetPricingCacheForTesting, fetchPrices, priceFor } from "../pricing";

const FX = {
  "34": {
    buy:  { percentile: "3.94", median: "3.25", weightedAverage: "2.38", max: "4.0", min: "0.3", stddev: "1.1", volume: "1", orderCount: "1" },
    sell: { percentile: "2.80", median: "4.50", weightedAverage: "3.89", max: "55000", min: "2.8", stddev: "1", volume: "1", orderCount: "1" },
  },
};

describe("fetchPrices", () => {
  beforeEach(() => __resetPricingCacheForTesting());

  it("hits Fuzzwork and returns parsed prices", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => FX });
    vi.stubGlobal("fetch", fetchMock);

    const m = await fetchPrices([34]);
    expect(m.get(34)?.sell.percentile).toBeCloseTo(2.8);
    expect(m.get(34)?.buy.percentile).toBeCloseTo(3.94);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("caches and doesn't refetch within TTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => FX });
    vi.stubGlobal("fetch", fetchMock);
    await fetchPrices([34]);
    await fetchPrices([34]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("chunks at 200 IDs per request", async () => {
    const big: Record<string, any> = {};
    for (let i = 1; i <= 401; i++) big[String(i)] = FX["34"];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => big });
    vi.stubGlobal("fetch", fetchMock);
    await fetchPrices(Array.from({ length: 401 }, (_, i) => i + 1));
    expect(fetchMock).toHaveBeenCalledTimes(3); // 200 + 200 + 1
  });
});

describe("priceFor", () => {
  const p = {
    buy: { percentile: 3.94, median: 3.25 },
    sell: { percentile: 2.80, median: 4.50 },
    at: 0,
  };
  it("maps source → field", () => {
    expect(priceFor(p, "sell 5%")).toBe(2.80);
    expect(priceFor(p, "sell median")).toBe(4.50);
    expect(priceFor(p, "buy 95%")).toBe(3.94);
  });
});
```

- [ ] **Step 3: Run + verify**

```bash
pnpm test src/lib/__tests__/pricing.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/pricing.ts web/src/lib/__tests__/pricing.test.ts
git commit -m "feat: Fuzzwork pricing client + 5min cache"
```

---

### Task 13: Wire pricing into App + settings drawer

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/SettingsDrawer.tsx` (already has the seg control; just consume the value)
- Modify: `web/src/lib/logic.ts` (totalValue uses live prices, collOverride applies)

- [ ] **Step 1: Add `priceFor` plumbing through `App.tsx`**

After items load + parse computes, fetch prices for the matched typeIDs:

```tsx
import { fetchPrices, priceFor, type PriceSource } from "./lib/pricing";

const [pricesByTypeId, setPricesByTypeId] = useState<Map<number, number>>(new Map());
const [pricesLoading, setPricesLoading] = useState(false);

useEffect(() => {
  if (!parse.matched.length) return;
  const ids = parse.matched.map((m) => (m as any).id).filter(Boolean);
  if (!ids.length) return;
  setPricesLoading(true);
  fetchPrices(ids)
    .then((m) => {
      const out = new Map<number, number>();
      const src = settings.priceSource as PriceSource;
      for (const [id, p] of m) out.set(id, priceFor(p, src));
      setPricesByTypeId(out);
    })
    .finally(() => setPricesLoading(false));
}, [parse.matched, settings.priceSource]);
```

- [ ] **Step 2: Extend `MatchedLine` with `id`**

In `logic.ts`:

```ts
export interface MatchedLine {
  key: string;
  name: string;
  qty: number;
  vol: number;
  price: number;
  id: number;  // NEW
}
```

In `parseHangarPaste`, capture `hit.id` and include it in the matched record.

- [ ] **Step 3: Compute totalValue using live prices**

Add a helper:

```ts
export function recomputeWithPrices(parse: ParseResult, prices: Map<number, number>, collOverride?: number): ParseResult {
  let totalValue = 0;
  const matched = parse.matched.map((m) => {
    const p = prices.get(m.id) ?? 0;
    totalValue += p * m.qty;
    return { ...m, price: p };
  });
  return {
    ...parse,
    matched,
    totalValue: collOverride != null && !isNaN(collOverride) ? collOverride : totalValue,
  };
}
```

In App.tsx, call `recomputeWithPrices(parse, pricesByTypeId, parsedCollOverride)` and pass the result downstream to `evaluateServices`.

Parse the override:
```ts
const parsedCollOverride = (() => {
  const n = parseFloat(settings.collOverride.replace(/,/g, ""));
  return isNaN(n) || n <= 0 ? undefined : n;
})();
```

- [ ] **Step 4: Loading indicator on Est. value cell**

In `PasteBlock.tsx`, add a small spinner/dim state when `pricesLoading` is true and the matched value is 0. Pass the prop.

- [ ] **Step 5: Smoke test live data**

`pnpm dev`. Load example. Confirm:
- Est. value populates within ~1 sec with Fuzzwork data
- Switching Settings → price source updates reward
- Setting "Custom collateral override" to a number overrides displayed collateral on the alliance card AND the Copy block

- [ ] **Step 6: Update affected tests**

`logic.test.ts` — totalValue tests now expect 0 (no prices passed) or use `recomputeWithPrices`. Add a test for `recomputeWithPrices`:

```ts
it("recomputeWithPrices fills prices and totals", () => {
  const parse = parseHangarPaste("Drake\t2", { "drake": { id: 24698, vol: 15000 } });
  const out = recomputeWithPrices(parse, new Map([[24698, 56_000_000]]));
  expect(out.totalValue).toBe(112_000_000);
  expect(out.matched[0].price).toBe(56_000_000);
});

it("recomputeWithPrices applies collOverride", () => {
  const parse = parseHangarPaste("Drake\t2", { "drake": { id: 24698, vol: 15000 } });
  const out = recomputeWithPrices(parse, new Map([[24698, 56_000_000]]), 999_000_000);
  expect(out.totalValue).toBe(999_000_000);
});
```

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "feat: live Fuzzwork pricing + collateral override wiring"
```

---

## Phase 4 — Deploy (Sat afternoon/evening)

### Task 14: Caddy + Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `Caddyfile`
- Modify: `web/.gitignore` if needed

- [ ] **Step 1: Create `Caddyfile` at repo root**

```caddy
:8080 {
    root * /srv
    encode gzip zstd
    file_server
    # SPA fallback — every unknown path returns index.html so client-side routing works
    try_files {path} /index.html
    header /assets/* Cache-Control "public, max-age=31536000, immutable"
    header /items.json Cache-Control "public, max-age=86400"
}
```

- [ ] **Step 2: Create `Dockerfile` at repo root**

```dockerfile
# ---- frontend build ----
FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
# items.json is gitignored — build pipeline produces it here
RUN pnpm build:sde && pnpm build

# ---- serve ----
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/web/dist /srv
EXPOSE 8080
```

> Note: the SDE pipeline runs during `docker build`, so the image build needs network access for the SDE ZIP + ESI calls. ESI enrichment takes ~3-5 minutes — budget for it. If we want faster image builds later, pre-build `items.json` locally and `COPY` it instead.

- [ ] **Step 3: Test the build locally**

```bash
docker build -t freightdesk-test .
docker run --rm -p 18080:8080 freightdesk-test
curl -s http://localhost:18080/ | head -5
curl -sI http://localhost:18080/items.json | head -3
```

Expected: index.html served, items.json served with Cache-Control header.

- [ ] **Step 4: Stop the test container, commit**

```bash
git add Dockerfile Caddyfile
git commit -m "deploy: caddy static container + multi-stage dockerfile"
```

---

### Task 15: docker-compose with cloudflared

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `.gitignore` (.env already there)

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    expose:
      - "8080"
    # No host port exposed — only cloudflared reaches it on the internal network.

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}
    depends_on:
      - app
```

- [ ] **Step 2: Create `.env.example`**

```
# Cloudflare Tunnel token for freightdesk.syniron.com
# Get this from: https://one.dash.cloudflare.com/ → Networks → Tunnels → Create
TUNNEL_TOKEN=
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "deploy: docker-compose with cloudflared sidecar"
```

---

### Task 16: Cloudflare Tunnel setup (USER ACTION)

This is a user-side checklist — not code. The plan tracks it so it doesn't slip.

> **USER ACTION:** complete the following before Task 17 runs.

- [ ] **Step 1: Create the tunnel**
  - Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create a tunnel
  - Name: `freightdesk`
  - Save the tunnel token (long opaque string starting `eyJ...`)

- [ ] **Step 2: Add the public hostname**
  - Inside the new tunnel: Public Hostname → Add
  - Subdomain: `freightdesk`
  - Domain: `syniron.com`
  - Service: `http://app:8080`

- [ ] **Step 3: Confirm the DNS CNAME** auto-created by Cloudflare points at the tunnel.

---

### Task 17: synicloud deploy

**Files:**
- None on this machine; SSH-side commands.

> **USER ACTION (or me running over SSH):** prerequisites: Task 16 complete, `TUNNEL_TOKEN` in hand, push the repo to GitHub first (Task 19).

- [ ] **Step 1: Create stack dir on VPS**

```bash
ssh claudeuser@synicloud "sudo mkdir -p /opt/syni/stacks/freightdesk && sudo chown claudeuser:claudeuser /opt/syni/stacks/freightdesk"
```

- [ ] **Step 2: Clone the repo there**

```bash
ssh claudeuser@synicloud "cd /opt/syni/stacks/freightdesk && sudo git clone https://github.com/SyniRon/eve-shipping-assistant.git ."
```

Note: stack dirs on synicloud are root-owned (per global CLAUDE.md). Use `sudo git ...` for git ops; docker compose works without sudo for `claudeuser`.

- [ ] **Step 3: Write `.env`**

```bash
ssh claudeuser@synicloud "cd /opt/syni/stacks/freightdesk && sudo tee .env > /dev/null <<'EOF'
TUNNEL_TOKEN=<paste real token>
EOF"
```

- [ ] **Step 4: Build + start**

```bash
ssh claudeuser@synicloud "cd /opt/syni/stacks/freightdesk && docker compose up -d --build"
```

This runs the SDE pipeline inside the build container — first build will take ~5-8 minutes.

- [ ] **Step 5: Tail logs**

```bash
ssh claudeuser@synicloud "cd /opt/syni/stacks/freightdesk && docker compose logs -f --tail=50"
```

Look for: caddy "serving initial configuration", cloudflared "Registered tunnel connection".

- [ ] **Step 6: Smoke test the live URL**

```bash
curl -sI https://freightdesk.syniron.com/
curl -s https://freightdesk.syniron.com/items.json | head -c 200
```

Expected: 200 OK, items.json starts with `{"`.

- [ ] **Step 7: Browser sanity**

Open `https://freightdesk.syniron.com/` from your local machine. Paste the example hangar. Confirm:
- Items load (no spinner stuck)
- Volume computes to ~30,461 m³
- Est. value shows live Jita prices
- Alliance Logistics card eligible
- All four copy buttons work

---

### Task 18: Playwright E2E against prod build

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/freightdesk.spec.ts`
- Create: `e2e/package.json` (separate from `web/` so it doesn't pull into the prod bundle)
- Modify: `web/package.json` (add `test:e2e` script)

- [ ] **Step 1: Init e2e dir**

```bash
mkdir -p /home/syniron/repos/eve-shipping-assistant/e2e
cd e2e
pnpm init
pnpm add -D @playwright/test
```

- [ ] **Step 2: `e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    launchOptions: {
      executablePath: "/snap/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "cd ../web && pnpm preview --port 4173",
        port: 4173,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
```

- [ ] **Step 3: `e2e/freightdesk.spec.ts`**

Reuse the smoke script we already proved works locally — port to `@playwright/test`:

```ts
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("eveship.")).forEach((k) => localStorage.removeItem(k)),
  );
  await page.reload();
});

test("empty hero → paste → contract values → copy", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Paste your hangar to start." })).toBeVisible();
  await page.getByRole("button", { name: /Load example into paste box/i }).click();
  await expect(page.locator(".cargo-row").first()).toBeVisible();
  await expect(page.locator(".service-card")).toHaveCount(1); // alliance-only
  await expect(page.locator(".copy-block:not(.is-empty)")).toBeVisible();
  await expect(page.locator(".copy-row")).toHaveCount(4);
  await page.locator(".copy-row", { hasText: "Destination" }).click();
  await expect(page.locator(".toast")).toBeVisible();
});

test("location combobox accepts custom entry", async ({ page }) => {
  await page.getByRole("button", { name: /Load example into paste box/i }).click();
  await page.locator(".loc-btn").first().click();
  await page.locator(".loc-input").fill("XX-XYZ");
  await expect(page.locator(".loc-opt-custom")).toBeVisible();
  await page.locator(".loc-opt-custom").click();
  await expect(page.locator(".tag-custom")).toBeVisible();
});

test("settings drawer toggles price source", async ({ page }) => {
  await page.getByRole("button", { name: /Load example into paste box/i }).click();
  await page.locator('button[aria-label="Settings"]').click();
  await expect(page.locator(".drawer.is-open")).toBeVisible();
  await page.locator(".seg-b", { hasText: "buy 95%" }).click();
  // Reward should update — pull the alliance card's reward, switch source, confirm it changed.
});
```

- [ ] **Step 4: Add script to `web/package.json`**

```json
"test:e2e": "cd ../e2e && pnpm exec playwright test"
```

- [ ] **Step 5: Run**

```bash
cd web && pnpm test:e2e
```

Expected: 3 tests pass against `pnpm preview` build.

- [ ] **Step 6: Optional — run against live URL**

```bash
E2E_BASE_URL=https://freightdesk.syniron.com cd e2e && pnpm exec playwright test
```

- [ ] **Step 7: Commit**

```bash
git add e2e/ web/package.json
git commit -m "test: playwright e2e suite for prod build"
```

---

### Task 19: Public README + push to GitHub

**Files:**
- Create: `README.md`
- Modify: `CLAUDE.md` (status + URL)

- [ ] **Step 1: Write `README.md`**

```markdown
# FreightDesk

Third-party shipping helper for EVE Online. Paste a hangar list, pick a route,
get the four strings to drop into the in-game Create Contract window.

**Live:** https://freightdesk.syniron.com

Not affiliated with CCP Games. EVE Online and all related logos are trademarks
of CCP hf.

## Stack

Vite + React + TypeScript, served as static via Caddy on Cloudflare Tunnel.
Item volumes built from CCP's SDE at image-build time with ESI enrichment for
modules / drones / subsystems / fighters. Live Jita prices via Fuzzwork
aggregates fetched directly from the browser.

## Dev

```bash
cd web
pnpm install
pnpm build:sde     # downloads SDE + ESI-enriches, ~5min first time
pnpm dev           # http://localhost:5173
pnpm test          # vitest
pnpm test:e2e      # playwright
```

## Deploy

```bash
ssh claudeuser@synicloud "cd /opt/syni/stacks/freightdesk && sudo git pull && docker compose up -d --build"
```

See `docs/deploy.md` for the full first-time setup.

## Contributing

Service rate cards and routes live in `web/src/lib/logic.ts` (will move to per-
service config files post-SLC). PRs welcome.
```

- [ ] **Step 2: Update `CLAUDE.md` Status section**

Replace the "prototype frontend live" paragraph with:
> **Status: live (2026-05-1?).** https://freightdesk.syniron.com — alliance-only service (Delve TUE), Jita ↔ SLC-K7 route, live Fuzzwork pricing, build-time SDE+ESI for volumes. SLC bar met.

- [ ] **Step 3: Push to GitHub**

```bash
git add README.md CLAUDE.md
git commit -m "docs: public README + flip status to live"
git push -u origin main
```

(If repo isn't pushed yet, `gh repo create SyniRon/eve-shipping-assistant --public --source=. --push`.)

- [ ] **Step 4: Re-pull on VPS, redeploy if README change matters**

Not strictly needed for the README, but verifies the deploy workflow:

```bash
ssh claudeuser@synicloud "cd /opt/syni/stacks/freightdesk && sudo git pull"
```

---

### Task 20: Final SLC verification + obsidian fold-back

**Files:**
- Modify: `/home/syniron/obsidian/directorate/projects/syni-eve-shipping-calc.md` — flip Status to `Built` / add ship date
- Modify: `/home/syniron/obsidian/directorate/indie/weekly/2026-W20.md` (or current week) — log the ship
- Optional: copy across to `maintenance/syni-eve-shipping-calc.md` if you follow the same fold-back pattern as reprocessing_helper

- [ ] **Step 1: Live-site full flow on a real machine**

Open https://freightdesk.syniron.com from your laptop (not the headless dev box). Complete a full flow:
- Paste a real hangar from EVE
- Verify all the matched volumes look right
- Verify Est. value matches Jita prices in PyFA/JEveAssets
- Copy each of the 4 contract strings
- Try pasting them into EVE's Create Contract window (visual paste-into-modal check)
- Confirm the structure name string matches the in-game listing

- [ ] **Step 2: Tag the release**

```bash
git tag -a v0.1.0-slc -m "SLC: alliance-only, Jita ↔ SLC-K7, live pricing"
git push --tags
```

- [ ] **Step 3: Update obsidian project + weekly notes**

Per your existing patterns. Out of scope to script.

- [ ] **Step 4: Post-launch**

Out of plan scope: Reddit + Discord posts. Project doc covers the where.

---

## Self-review

**Spec coverage** — checked against `/home/syniron/obsidian/directorate/projects/syni-eve-shipping-calc.md`:

- ✓ Live URL at syniron.com subdomain — Task 17 (`freightdesk.syniron.com`)
- ✓ Paste hangar → compute volume — Tasks 10–11 (real items DB with SDE+ESI)
- ✓ Click-to-copy contract values (volume, suggested collateral, reward) for one alliance shipper on staging ↔ Jita — already in design, locked in via Task 5
- ✓ Launch post in r/Eve + alliance Discord — explicitly out of plan scope (project doc owns it)
- ✓ Out-of-scope items honored: no PushX/Red Frog, no git-driven rates, no Plausible, no auth — Task 5 strips services, alliance.updated is hardcoded

**Open question parking lot** from project doc:
- "Structure mapping" — handled for SLC by hardcoding SLC-K7 in LOCATIONS (Task 5 step 2)
- "Alliance shipper rate formula" — flagged as user-supplied at Task 5
- "Contract-window value formats" — verified visually in Task 20 step 1

**Placeholder scan:** No "TBD" / "implement later" / "similar to" hand-waves remain. All code blocks contain executable code. ESI enrichment loop has the actual concurrency pattern.

**Type consistency:** `MatchedLine` gains `id: number` in Task 13 step 2 — `parseHangarPaste` (Task 11) must populate it. Plan reflects this.

**Scope check:** This plan covers exactly the SLC subset. Post-SLC items (PushX/Red Frog reactivation, git-driven rates, analytics, multi-leg, alliance-structure-picker) are NOT in this plan and should each get their own plan after launch.

---

## Risks / things that could derail Sunday ship

1. **ESI rate limits / outages** — the SDE build step depends on ~4,200 ESI calls. If ESI is degraded, image build hangs. Mitigation: a `--skip-esi` flag added to `build-sde.ts` falls back to SDE-only volumes, accepting incorrect module volumes as a v0.1.0 trade-off.
2. **Fuzzwork outage at deploy time** — the smoke test relies on live prices. If Fuzzwork is down, ship anyway; the Est. value cell goes to 0 / em-dash and the alliance reward formula still works on volume × rate.
3. **CCP SDE schema drift** — Task 8 step 2 has a debug fallback (log first 5 records) for exactly this. If `typeID` is now `id` or `name` is no longer i18n-wrapped, fix in-task.
4. **Cloudflare Tunnel token confusion** — same gotcha I'd expect in any first-time tunnel setup; Task 16 spells out the steps.
5. **Alliance rate card not in hand by Saturday** — the plan ships with stub values intact if the rate card slips. Tag v0.1.0-slc anyway, follow up with v0.1.1 when the real rate lands.
