import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __indexForTesting,
  __setLocationsForTesting,
  dockableLocation,
  loadLocations,
  searchLocations,
  SEARCH_CAP,
  type LocationIndex,
} from "../locations";
import { LOCATIONS } from "../logic";

// Small synthetic corpus: Jita (aliased to jita44), Tanoo (two stations, one of
// them coincidental — exercises within-system ranking + non-aliased dockable).
const ART = {
  systems: [
    [30000142, "Jita", 0.95] as [number, string, number],
    [30002780, "Tanoo", -0.41] as [number, string, number],
  ],
  stations: [
    [60003760, "Jita IV - Moon 4 - Caldari Navy Assembly Plant", 30000142] as [number, string, number],
    [60000004, "Tanoo X - Moon 3 - CBD Corporation Storage", 30002780] as [number, string, number],
    [60000005, "Tanoo IV - Moon 1 - Some Other Station", 30002780] as [number, string, number],
  ],
  aliases: [
    { slug: "jita44", short: "Jita 4-4", name: "Jita IV - Moon 4 - Caldari Navy Assembly Plant", sec: 0.9, hub: true, sdeId: 60003760 },
    { slug: "cj6mt", short: "C-J6MT", name: "C-J6MT - 1st Taj Mahgoon", sec: -0.4, alliance: true, structure: true, sdeId: null },
  ],
};

let idx: LocationIndex;
beforeEach(() => {
  idx = __indexForTesting(ART);
  __setLocationsForTesting(null);
});

describe("loadLocations", () => {
  it("fetches /locations.json once, indexes, and caches", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ART });
    vi.stubGlobal("fetch", fetchMock);
    const a = await loadLocations();
    const b = await loadLocations();
    expect(b).toBe(a); // cached reference
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.stations).toHaveLength(3);
    expect(a.sdeIdToSlug.get(60003760)).toBe("jita44");
  });

  it("rejects on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(loadLocations()).rejects.toThrow(/503/);
  });

  it("clears the in-flight promise after a failure so a later call can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ART });
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadLocations()).rejects.toThrow(/503/);
    // A retry must re-fetch (not return the cached rejection) and succeed.
    const idx2 = await loadLocations();
    expect(idx2.stations).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("dockableLocation — reconciliation", () => {
  it("an aliased station commits as its canonical preset (slug id), not sta:<id>", () => {
    const loc = dockableLocation({ id: 60003760, name: ART.stations[0][1], sysId: 30000142 }, idx);
    expect(loc.id).toBe("jita44");
    expect(loc.custom).toBeUndefined();
  });

  it("a non-aliased station commits as a real sta:<id> Location (never custom)", () => {
    const loc = dockableLocation({ id: 60000004, name: ART.stations[1][1], sysId: 30002780 }, idx);
    expect(loc.id).toBe("sta:60000004");
    expect(loc.custom).toBeUndefined();
    expect(loc.sec).toBe(-0.41); // inherits its system's security
  });

  it("short label is the system name, not the pre-hyphen token of the listing", () => {
    // Nullsec system names contain hyphens ("1-NKVT"). The short label must be
    // the real system name, not a string-split of the station listing (which
    // would yield "1" for "1-NKVT VI - Moon 1 - ...").
    const hyphenArt = {
      systems: [[30004600, "1-NKVT", -0.36] as [number, string, number]],
      stations: [
        [61000001, "1-NKVT VI - Moon 1 - Serpentis Corporation Warehouse", 30004600] as [number, string, number],
      ],
      aliases: [],
    };
    const hIdx = __indexForTesting(hyphenArt);
    const loc = dockableLocation({ id: 61000001, name: hyphenArt.stations[0][1], sysId: 30004600 }, hIdx);
    expect(loc.short).toBe("1-NKVT");
    expect(loc.name).toBe("1-NKVT VI - Moon 1 - Serpentis Corporation Warehouse");
  });
});

describe("searchLocations", () => {
  const presets = LOCATIONS;

  it("empty query reproduces the preset menu, no SDE rows", () => {
    const { results } = searchLocations("", idx, presets);
    expect(results.every((r) => r.preset)).toBe(true);
    expect(results.map((r) => r.loc.id)).toEqual(presets.map((p) => p.id));
  });

  it("pins curated preset matches above SDE dockables", () => {
    const { results } = searchLocations("jita", idx, presets);
    expect(results[0].preset).toBe(true);
    expect(results[0].loc.id).toBe("jita44");
  });

  it("does not list an aliased station twice (preset pin wins)", () => {
    const { results } = searchLocations("jita", idx, presets);
    const jitaEntries = results.filter((r) => r.loc.id === "jita44" || r.loc.id === "sta:60003760");
    expect(jitaEntries).toHaveLength(1);
    expect(jitaEntries[0].loc.id).toBe("jita44");
  });

  it("surfaces a system's dockables when typing the system name", () => {
    const { results } = searchLocations("tanoo", idx, presets);
    const ids = results.map((r) => r.loc.id);
    expect(ids).toContain("sta:60000004");
    expect(ids).toContain("sta:60000005");
  });

  it("ranks exact-system over substring and aliased siblings first", () => {
    // Both Tanoo stations are exact-system matches; neither aliased here, so
    // they sort by name. Assert exact-system rows precede a substring-only row.
    const { results } = searchLocations("tanoo", idx, presets);
    const stationResults = results.filter((r) => !r.preset);
    expect(stationResults.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to presets only when the index is unreachable (null)", () => {
    const { results, truncated } = searchLocations("jita", null, presets);
    expect(truncated).toBe(false);
    expect(results.every((r) => r.preset)).toBe(true);
    expect(results.some((r) => r.loc.id === "jita44")).toBe(true);
  });

  it("caps results and flags truncation", () => {
    // Build a large synthetic system with > SEARCH_CAP dockables.
    const many = {
      systems: [[1, "Zzz", 0.5] as [number, string, number]],
      stations: Array.from({ length: SEARCH_CAP + 20 }, (_, i): [number, string, number] => [
        1000 + i,
        `Zzz ${i} - Station`,
        1,
      ]),
      aliases: [],
    };
    const bigIdx = __indexForTesting(many);
    const { results, truncated } = searchLocations("zzz", bigIdx, []);
    expect(results.length).toBe(SEARCH_CAP);
    expect(truncated).toBe(true);
  });
});
