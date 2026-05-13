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
