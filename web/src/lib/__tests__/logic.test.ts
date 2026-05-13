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
  LOCATIONS,
  SERVICES,
} from "../logic";
import type { ParseResult } from "../logic";

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

describe("evaluateServices", () => {
  // Use SERVICES[0] / `slc` (placeholder) at Task 3 time. After Task 5e, the
  // dest id becomes `cjm6t`. Task 5d adds the post-rename coverage; these
  // tests stay valid by avoiding any specific service-id lookup.
  const origin = LOCATIONS.find((l) => l.id === "jita44")!;
  const dest = LOCATIONS.find((l) => l.id === "slc") ?? LOCATIONS.find((l) => l.id === "cjm6t")!;
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
    expect(quotes[0].eligible).toBe(false);
    expect(quotes[0].reasons[0]).toMatch(/route/i);
  });

  it("marks ineligible when volume exceeds cap", () => {
    const parse = { matched: [], unmatched: [], totalVol: 999_999_999, totalValue: 0 };
    const quotes = evaluateServices(parse, origin, dest);
    expect(quotes[0].eligible).toBe(false);
    expect(quotes[0].reasons.some((r) => r.includes("Volume"))).toBe(true);
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
});

describe("evaluateServices with per-route formulas", () => {
  const adfu = () => SERVICES.find((s) => s.id === "adfu-kum-n-go")!;
  const jita = LOCATIONS.find((l) => l.id === "jita44")!;
  const cjm6t = LOCATIONS.find((l) => l.id === "cjm6t")!;

  it("applies max formula on C-JM6T → Jita", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 10_000, totalValue: 500_000_000 };
    const [q] = evaluateServices(parse, cjm6t, jita);
    expect(q.eligible).toBe(true);
    expect(q.reward).toBe(Math.max(10_000 * 900, 500_000_000 * 0.005));
  });

  it("applies rate-only on Jita → C-JM6T", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 10_000, totalValue: 500_000_000 };
    const [q] = evaluateServices(parse, jita, cjm6t);
    expect(q.reward).toBe(10_000 * 700);
  });

  it("enforces minReward floor", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 1, totalValue: 0 };
    const [q] = evaluateServices(parse, jita, cjm6t);
    expect(q.reward).toBe(adfu().minReward);  // 5_000_000
  });

  it("adds rushFee only when rushEnabled", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 10_000, totalValue: 500_000_000 };
    const [off] = evaluateServices(parse, jita, cjm6t, false);
    const [on]  = evaluateServices(parse, jita, cjm6t, true);
    expect(on.reward - off.reward).toBe(250_000_000);
    expect(on.rushApplied).toBe(true);
    expect(off.rushApplied).toBe(false);
  });

  it("flags cap exceeded with split-contracts copy", () => {
    const parse: ParseResult = { matched: [], unmatched: [], totalVol: 999_999, totalValue: 0 };
    const [q] = evaluateServices(parse, cjm6t, jita);
    expect(q.eligible).toBe(false);
    expect(q.reasons[0]).toMatch(/split into multiple contracts/i);
  });
});
