import { describe, expect, it } from "vitest";
import {
  parseHangarPaste,
  evaluateServices,
  applyFormula,
  fmtISK,
  fmtVol,
  fmtSec,
  secTier,
  resolveLocation,
  makeCustomLocation,
  recomputeWithPrices,
  canonicalEndpoint,
  LOCATIONS,
  SERVICES,
  type Location,
} from "../logic";
import type { ParseResult } from "../logic";

// Test fixture — injects a minimal DB so tests don't depend on items.json.
const TEST_DB: Record<string, { id: number; vol: number }> = {
  "drake": { id: 24698, vol: 15000 },
  "plex": { id: 44992, vol: 0.0002 },
  "hobgoblin ii": { id: 2456, vol: 5 },
  "damage control ii": { id: 2048, vol: 5 },
};

describe("parseHangarPaste", () => {
  it("parses tab-separated hangar lines", () => {
    const r = parseHangarPaste("Drake\t2\nPLEX\t500", TEST_DB);
    expect(r.matched).toHaveLength(2);
    expect(r.matched.find((m) => m.name === "Drake")?.qty).toBe(2);
    expect(r.matched.find((m) => m.name === "PLEX")?.qty).toBe(500);
  });

  it("parses 'x N' chat-style lines", () => {
    const r = parseHangarPaste("Hobgoblin II x 10", TEST_DB);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].qty).toBe(10);
  });

  it("treats lone item names as qty 1", () => {
    const r = parseHangarPaste("Damage Control II", TEST_DB);
    expect(r.matched[0].qty).toBe(1);
  });

  it("sums duplicates by key", () => {
    const r = parseHangarPaste("Drake\t2\nDrake\t3", TEST_DB);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].qty).toBe(5);
  });

  it("flags unknown item names as unmatched", () => {
    const r = parseHangarPaste("Nyx Supercarrier\t1", TEST_DB);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched).toHaveLength(1);
    expect(r.unmatched[0].name).toBe("Nyx Supercarrier");
  });

  it("computes totalVol from vol × qty", () => {
    // Drake = 15000 m³ in TEST_DB
    const r = parseHangarPaste("Drake\t2", TEST_DB);
    expect(r.totalVol).toBe(30000);
  });

  it("ignores blank lines and whitespace", () => {
    const r = parseHangarPaste("\n  \nDrake\t1\n\n", TEST_DB);
    expect(r.matched).toHaveLength(1);
  });
});

describe("evaluateServices", () => {
  // Use SERVICES[0] / `slc` (placeholder) at Task 3 time. Task 5e renamed the
  // dest id to `cj6mt`. Task 5d adds the post-rename coverage; these tests
  // stay valid by avoiding any specific service-id lookup.
  const origin = LOCATIONS.find((l) => l.id === "jita44")!;
  const dest = LOCATIONS.find((l) => l.id === "slc") ?? LOCATIONS.find((l) => l.id === "cj6mt")!;
  // NOTE: minReward assertion below uses SERVICES[0].minReward — service-level
  // value. If Task 5c moves minReward onto routes only, switch to a route lookup.

  it("returns one quote per service", () => {
    const parse = { matched: [], unmatched: [], totalVol: 1000, totalValue: 100_000_000 };
    expect(evaluateServices(parse, origin, dest)).toHaveLength(SERVICES.length);
  });

  it("marks ineligible when route doesn't match", () => {
    const amarr = LOCATIONS.find((l) => l.id === "amarr")!;
    const parse = { matched: [], unmatched: [], totalVol: 1000, totalValue: 100_000_000 };
    const quotes = evaluateServices(parse, amarr, dest);
    expect(quotes[0].status).toBe("ineligible");
    expect(quotes[0].reasons[0]).toMatch(/route/i);
  });

  it("marks splittable when volume exceeds cap (route matches, units fit)", () => {
    const parse = { matched: [], unmatched: [], totalVol: 999_999_999, totalValue: 0 };
    const quotes = evaluateServices(parse, origin, dest);
    expect(quotes[0].status).toBe("splittable");
    expect(quotes[0].split).toBeDefined();
  });

  it("applies minReward floor", () => {
    const parse = { matched: [], unmatched: [], totalVol: 1, totalValue: 0 };
    const quotes = evaluateServices(parse, origin, dest);
    expect(quotes[0].reward).toBe(quotes[0].service.minReward);
  });

  it("custom destinations are ineligible everywhere", () => {
    const custom = makeCustomLocation("XX-XYZ");
    const parse = { matched: [], unmatched: [], totalVol: 100, totalValue: 100_000_000 };
    const quotes = evaluateServices(parse, origin, custom);
    expect(quotes.every((q) => q.status === "ineligible")).toBe(true);
  });
});

describe("endpoint reconciliation (ADR 0011)", () => {
  const jita = LOCATIONS.find((l) => l.id === "jita44")!;
  const cj6mt = LOCATIONS.find((l) => l.id === "cj6mt")!;
  const parse = { matched: [], unmatched: [], totalVol: 10, totalValue: 1_000_000 };

  it("canonicalEndpoint passes human slugs through unchanged", () => {
    expect(canonicalEndpoint("jita44")).toBe("jita44");
  });

  it("canonicalEndpoint maps an aliased sta:<id> to its slug", () => {
    const idToSlug = new Map([[60003760, "jita44"]]);
    expect(canonicalEndpoint("sta:60003760", idToSlug)).toBe("jita44");
  });

  it("canonicalEndpoint passes a bare sys:<id> through (distinct keyspace)", () => {
    const idToSlug = new Map([[60003760, "jita44"]]);
    expect(canonicalEndpoint("sys:30000142", idToSlug)).toBe("sys:30000142");
  });

  it("canonicalEndpoint leaves a non-aliased sta:<id> as the raw key", () => {
    expect(canonicalEndpoint("sta:60000004", new Map())).toBe("sta:60000004");
  });

  it("an aliased sta:<id> endpoint resolves to its slug route → eligible", () => {
    // A route picked endpoint stored as the raw station id still matches the
    // slug-keyed ADFU route once reconciled.
    const idToSlug = new Map([[60003760, "jita44"]]);
    const stationJita: Location = {
      id: "sta:60003760",
      name: jita.name,
      short: "Jita",
      sec: 0.9,
    };
    const eligible = evaluateServices(parse, stationJita, cj6mt, false, {}, idToSlug);
    expect(eligible.some((q) => q.status === "eligible")).toBe(true);
  });

  it("a non-aliased real dockable is ineligible but never marked custom", () => {
    const someStation: Location = {
      id: "sta:60000004",
      name: "Muvolailen X - Moon 3 - CBD Corporation Storage",
      short: "Muvolailen",
      sec: 0.6,
    };
    const quotes = evaluateServices(parse, someStation, cj6mt);
    expect(quotes.every((q) => q.status === "ineligible")).toBe(true);
    // It must use the neutral no-route message, not the custom one.
    expect(quotes[0].reasons[0]).toMatch(/Doesn't service this route/);
    expect(someStation.custom).toBeUndefined();
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

describe("applyFormula", () => {
  it("sum: vol*rate + coll*pct", () => {
    expect(applyFormula({ kind: "sum", ratePerM3: 900, collateralPct: 0.01 }, 100, 1_000_000)).toBe(100 * 900 + 1_000_000 * 0.01);
  });
  it("max: whichever leg is larger", () => {
    expect(applyFormula({ kind: "max", ratePerM3: 900, collateralPct: 0.005 }, 100, 1_000_000)).toBe(Math.max(100 * 900, 1_000_000 * 0.005));
  });
  it("rate-only: ignores collateral", () => {
    expect(applyFormula({ kind: "rate-only", ratePerM3: 700 }, 1000, 999_999_999)).toBe(700_000);
  });
  it("flat: constant", () => {
    expect(applyFormula({ kind: "flat", reward: 1_500_000 }, 100, 1_000_000_000)).toBe(1_500_000);
  });

  it("collateral × 0.5% rounds up to match shipper calculators (kumgo parity)", () => {
    // 49,920,689,422 × 0.005 = 249,603,447.11 → ceil → 249,603,448.
    // kumgo.space (the published ADFU calculator) shows 249,603,448;
    // Math.round would give 447 and put us a contract-ISK below the reference.
    const raw = applyFormula({ kind: "max", ratePerM3: 900, collateralPct: 0.005 }, 0, 49_920_689_422);
    expect(Math.ceil(raw)).toBe(249_603_448);
    expect(Math.round(raw)).toBe(249_603_447); // sanity: confirms our parity decision matters
  });
});

describe("evaluateServices with per-route formulas", () => {
  const adfu = () => SERVICES.find((s) => s.id === "adfu-kum-n-go")!;
  const jita = LOCATIONS.find((l) => l.id === "jita44")!;
  const cj6mt = LOCATIONS.find((l) => l.id === "cj6mt")!;

  it("applies max formula on C-J6MT → Jita", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 10_000, totalValue: 500_000_000 };
    const [q] = evaluateServices(parse, cj6mt, jita);
    expect(q.status).toBe("eligible");
    expect(q.reward).toBe(Math.max(10_000 * 900, 500_000_000 * 0.005));
  });

  it("applies rate-only on Jita → C-J6MT", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 10_000, totalValue: 500_000_000 };
    const [q] = evaluateServices(parse, jita, cj6mt);
    expect(q.reward).toBe(10_000 * 700);
  });

  it("enforces minReward floor", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 1, totalValue: 0 };
    const [q] = evaluateServices(parse, jita, cj6mt);
    expect(q.reward).toBe(adfu().minReward);  // 5_000_000
  });

  it("adds rushFee only when rushEnabled", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 10_000, totalValue: 500_000_000 };
    const [off] = evaluateServices(parse, jita, cj6mt, false);
    const [on]  = evaluateServices(parse, jita, cj6mt, true);
    expect(on.reward - off.reward).toBe(250_000_000);
    expect(on.rushApplied).toBe(true);
    expect(off.rushApplied).toBe(false);
  });

  it("classifies an over-volume-cap load as splittable, not ineligible", () => {
    // ADFU maxVol = 350_000. 999_999 m³ → ceil(999999/350000) = 3 contracts.
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 999_999, totalValue: 0 };
    const [q] = evaluateServices(parse, cj6mt, jita);
    expect(q.status).toBe("splittable");
    expect(q.split!.n).toBe(3);
  });
});

describe("evaluateServices over-cap splitting (ADR 0010)", () => {
  const jita = LOCATIONS.find((l) => l.id === "jita44")!;
  const cj6mt = LOCATIONS.find((l) => l.id === "cj6mt")!;
  const adfu = () => SERVICES.find((s) => s.id === "adfu-kum-n-go")!;

  it("N is ceil(vol/maxVol) when only the volume cap binds", () => {
    // maxVol 350_000; 700_001 → ceil = 3.
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 700_001, totalValue: 0 };
    const [q] = evaluateServices(parse, cj6mt, jita);
    expect(q.status).toBe("splittable");
    expect(q.split!.n).toBe(3);
    expect(q.split!.perContractVol).toBeCloseTo(700_001 / 3, 4);
  });

  it("N is the larger of the volume- and collateral-cap divisions when both bind", () => {
    // Force a collateral cap via override so both caps are exercised together.
    // maxVol 350_000 → vol leg needs ceil(800_000/350_000)=3.
    // collateral cap 1_000_000_000 (override-injected) → ceil(5B/1B)=5. N=5.
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 800_000, totalValue: 0 };
    const [q] = evaluateServices(parse, cj6mt, jita, false, {
      collateral: 5_000_000_000,
      maxCollateral: 1_000_000_000,
    });
    expect(q.status).toBe("splittable");
    expect(q.split!.n).toBe(5);
  });

  it("all-in cost = N × per-contract reward (rush off): even-split max formula equals single-contract reward", () => {
    // C-J6MT→Jita max(vol×900, coll×0.5%). vol 700_000 (N=2), coll small so vol leg wins.
    // Per contract: max(350_000×900, .) = 315_000_000, ×2 = 630_000_000.
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 700_000, totalValue: 0 };
    const [q] = evaluateServices(parse, cj6mt, jita, false);
    expect(q.split!.n).toBe(2);
    expect(q.split!.allInCost).toBe(2 * Math.max(350_000 * 900, 0));
  });

  it("all-in cost is rush-aware: adds rushFee ×N when rush toggle on", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 700_000, totalValue: 0 };
    const [off] = evaluateServices(parse, cj6mt, jita, false);
    const [on] = evaluateServices(parse, cj6mt, jita, true);
    // rushFee 250M per contract, N=2 → +500M.
    expect(on.split!.allInCost - off.split!.allInCost).toBe(2 * 250_000_000);
  });

  it("all-in cost floors each sub-contract at minReward independently before ×N", () => {
    // Force the floor to bind on every sub-contract via a tiny rate override:
    // Jita→C-J6MT rate-only. With ratePerM3 = 0.000001, per-contract reward ≈ 0,
    // so each of the N contracts floors to minReward (5M). N from volume cap.
    // vol 400_000 → N=2 (ceil(400000/350000)). allIn = 2 × 5M = 10M.
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 400_000, totalValue: 0 };
    const [q] = evaluateServices(parse, jita, cj6mt, false, { ratePerM3: 0.000001 });
    expect(q.split!.n).toBe(2);
    expect(q.split!.allInCost).toBe(2 * adfu().minReward!);
  });

  it("ineligible (not splittable) when a single indivisible unit exceeds the volume cap", () => {
    // One Drake at 400_000 m³ — its own volume exceeds maxVol 350_000. Uncuttable.
    const parse: ParseResult = {
      matched: [{ key: "x", name: "X", qty: 1, vol: 400_000, price: 0, id: 1 }],
      unmatched: [],
      totalVol: 400_000,
      totalValue: 0,
    };
    const [q] = evaluateServices(parse, cj6mt, jita);
    expect(q.status).toBe("ineligible");
    expect(q.reasons.some((r) => /too large to fit/i.test(r))).toBe(true);
  });

  it("splittable when many small units aggregate over the cap (each unit fits)", () => {
    // 100 units × 5000 m³ = 500_000 m³ over 350_000 cap, but each unit is 5000 m³.
    const parse: ParseResult = {
      matched: [{ key: "x", name: "X", qty: 100, vol: 5000, price: 0, id: 1 }],
      unmatched: [],
      totalVol: 500_000,
      totalValue: 0,
    };
    const [q] = evaluateServices(parse, cj6mt, jita);
    expect(q.status).toBe("splittable");
    expect(q.split!.n).toBe(2);
  });

  it("ineligible when a single indivisible unit exceeds the collateral cap", () => {
    // One unit whose own contract-collateral exceeds maxCollateral (override cap).
    const parse: ParseResult = {
      matched: [{ key: "x", name: "X", qty: 1, vol: 10, price: 2_000_000_000, id: 1 }],
      unmatched: [],
      totalVol: 10,
      totalValue: 2_000_000_000,
      collateral: 2_000_000_000,
    };
    const [q] = evaluateServices(parse, cj6mt, jita, false, { maxCollateral: 1_000_000_000 });
    expect(q.status).toBe("ineligible");
    expect(q.reasons.some((r) => /too valuable to fit/i.test(r))).toBe(true);
  });

  it("split composes with a volume override (override drives N, not raw paste)", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 10, totalValue: 0 };
    const [q] = evaluateServices(parse, cj6mt, jita, false, { vol: 1_050_000 });
    // 1_050_000 / 350_000 = exactly 3.
    expect(q.status).toBe("splittable");
    expect(q.split!.n).toBe(3);
    expect(q.split!.perContractVol).toBeCloseTo(350_000, 4);
  });
});

describe("evaluateServices with direct overrides", () => {
  const jita = LOCATIONS.find((l) => l.id === "jita44")!;
  const cj6mt = LOCATIONS.find((l) => l.id === "cj6mt")!;
  const base: ParseResult = { matched: [], unmatched: [], totalVol: 10_000, totalValue: 500_000_000, collateral: 600_000_000 };

  it("with no overrides, reports nothing overridden and uses market-derived values", () => {
    const [q] = evaluateServices(base, cj6mt, jita);
    expect(q.overridden).toEqual({ collateral: false, vol: false, rate: false });
    expect(q.collateral).toBe(600_000_000);
    expect(q.vol).toBe(10_000);
    expect(q.reward).toBe(Math.max(10_000 * 900, 600_000_000 * 0.005));
  });

  it("collateral-ISK override replaces the computed collateral and the reward leg that uses it", () => {
    const [q] = evaluateServices(base, cj6mt, jita, false, { collateral: 100_000_000_000 });
    expect(q.overridden.collateral).toBe(true);
    expect(q.collateral).toBe(100_000_000_000);
    // max(10_000*900, 100B*0.005) = max(9M, 500M) = 500M
    expect(q.reward).toBe(Math.max(10_000 * 900, 100_000_000_000 * 0.005));
  });

  it("volume override replaces the computed volume and the reward leg that uses it", () => {
    const [q] = evaluateServices(base, jita, cj6mt, false, { vol: 50_000 });
    expect(q.overridden.vol).toBe(true);
    expect(q.vol).toBe(50_000);
    // Jita → C-J6MT is rate-only @700
    expect(q.reward).toBe(50_000 * 700);
  });

  it("rate override replaces the per-m³ rate in a rate-only formula", () => {
    const [q] = evaluateServices(base, jita, cj6mt, false, { ratePerM3: 1_000 });
    expect(q.overridden.rate).toBe(true);
    expect(q.reward).toBe(10_000 * 1_000);
  });

  it("rate override replaces the per-m³ rate in a max formula's rate leg", () => {
    const [q] = evaluateServices(base, cj6mt, jita, false, { ratePerM3: 100_000 });
    expect(q.overridden.rate).toBe(true);
    // max(10_000*100_000, 600M*0.005) = max(1B, 3M) = 1B
    expect(q.reward).toBe(Math.max(10_000 * 100_000, 600_000_000 * 0.005));
  });

  it("all three overrides compose", () => {
    const [q] = evaluateServices(base, cj6mt, jita, false, { collateral: 2_000_000_000, vol: 5_000, ratePerM3: 800 });
    expect(q.overridden).toEqual({ collateral: true, vol: true, rate: true });
    expect(q.collateral).toBe(2_000_000_000);
    expect(q.vol).toBe(5_000);
    expect(q.reward).toBe(Math.max(5_000 * 800, 2_000_000_000 * 0.005));
  });

  it("volume override over the cap yields splittable, not ineligible", () => {
    const [q] = evaluateServices(base, cj6mt, jita, false, { vol: 999_999 });
    expect(q.status).toBe("splittable");
    expect(q.split!.n).toBe(3); // ceil(999999/350000)
  });

  it("ignores override values that are not finite positive numbers", () => {
    const [q] = evaluateServices(base, cj6mt, jita, false, { collateral: NaN, vol: -5, ratePerM3: 0 });
    expect(q.overridden).toEqual({ collateral: false, vol: false, rate: false });
    expect(q.collateral).toBe(600_000_000);
    expect(q.vol).toBe(10_000);
  });
});

describe("service contract metadata", () => {
  it("ADFU service exposes contract expiration / days-to-complete / description hint", () => {
    const adfu = SERVICES.find((s) => s.id === "adfu-kum-n-go")!;
    expect(adfu.contract).toBeDefined();
    expect(adfu.contract?.expiration).toBe("1 week");
    expect(adfu.contract?.daysToComplete).toBe("7 days");
    expect(adfu.contract?.descriptionHint).toBe("optional");
  });
});

describe("recomputeWithPrices", () => {
  it("fills prices, totals, and 120% collateral by default", () => {
    const parse = parseHangarPaste("Drake\t2", TEST_DB);
    const out = recomputeWithPrices(parse, new Map([[24698, 56_000_000]]));
    expect(out.totalValue).toBe(112_000_000);
    expect(out.collateral).toBe(Math.round(112_000_000 * 1.2));
    expect(out.matched[0].price).toBe(56_000_000);
  });
  it("applies custom collateralPct", () => {
    const parse = parseHangarPaste("Drake\t2", TEST_DB);
    const out = recomputeWithPrices(parse, new Map([[24698, 56_000_000]]), 150);
    expect(out.collateral).toBe(Math.round(112_000_000 * 1.5));
  });
  it("falls back to 120% when collateralPct is invalid", () => {
    const parse = parseHangarPaste("Drake\t2", TEST_DB);
    const out = recomputeWithPrices(parse, new Map([[24698, 56_000_000]]), -5);
    expect(out.collateral).toBe(Math.round(112_000_000 * 1.2));
  });
});
