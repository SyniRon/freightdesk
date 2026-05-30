import { describe, expect, it } from "vitest";
import type { Alias } from "../../../src/lib/aliases";
import {
  assembleArtifact,
  buildStationRows,
  buildSystemRows,
  parseStations,
  parseSystems,
  pinAliases,
} from "../extract-locations";

// Small synthetic SDE fixture — two systems, two stations. Mirrors the real
// jsonl shape (name as a localized object, securityStatus float on systems;
// id-only stations with solarSystemID).
const SYSTEM_LINES = [
  JSON.stringify({ _key: 30000001, name: { en: "Jita" }, securityStatus: 0.945913 }),
  JSON.stringify({ _key: 30002780, name: { en: "Tanoo" }, securityStatus: -0.412 }),
  "",
];
const STATION_LINES = [
  JSON.stringify({ _key: 60003760, solarSystemID: 30000001 }),
  JSON.stringify({ _key: 60000004, solarSystemID: 30002780 }),
];
const NAMES = new Map<number, string>([
  [60003760, "Jita IV - Moon 4 - Caldari Navy Assembly Plant"],
  [60000004, "Tanoo X - Moon 3 - CBD Corporation Storage"],
]);

describe("extract-locations", () => {
  it("parses systems and emits compact [id,name,sec] rows, sec rounded", () => {
    const rows = buildSystemRows(parseSystems(SYSTEM_LINES));
    expect(rows).toEqual([
      [30000001, "Jita", 0.95],
      [30002780, "Tanoo", -0.41],
    ]);
  });

  it("assembles station rows joining ESI names, dropping unresolved", () => {
    const rows = buildStationRows(parseStations(STATION_LINES), NAMES);
    expect(rows).toContainEqual([
      60003760,
      "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
      30000001,
    ]);
    expect(rows).toHaveLength(2);
  });

  it("drops a station whose name failed to resolve", () => {
    const partial = new Map([[60003760, "Jita IV - Moon 4 - Caldari Navy Assembly Plant"]]);
    const rows = buildStationRows(parseStations(STATION_LINES), partial);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe(60003760);
  });

  it("pins an NPC-station alias to its SDE id by exact name", () => {
    const stationRows = buildStationRows(parseStations(STATION_LINES), NAMES);
    const aliases: Alias[] = [
      {
        slug: "jita44",
        short: "Jita 4-4",
        name: "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
        sdeName: "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
        sec: 0.9,
        hub: true,
      },
    ];
    const pins = pinAliases(aliases, stationRows);
    expect(pins).toEqual([
      {
        slug: "jita44",
        short: "Jita 4-4",
        name: "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
        sec: 0.9,
        hub: true,
        alliance: undefined,
        structure: undefined,
        sdeId: 60003760,
      },
    ]);
  });

  it("pins a hand-pinned Upwell structure to a null sdeId (not in SDE)", () => {
    const stationRows = buildStationRows(parseStations(STATION_LINES), NAMES);
    const aliases: Alias[] = [
      {
        slug: "cj6mt",
        short: "C-J6MT",
        name: "C-J6MT - 1st Taj Mahgoon",
        sec: -0.4,
        alliance: true,
        structure: true,
      },
    ];
    const [pin] = pinAliases(aliases, stationRows);
    expect(pin.sdeId).toBeNull();
    expect(pin.structure).toBe(true);
  });

  it("fails loudly when a pinned NPC-station name resolves to no SDE location", () => {
    const stationRows = buildStationRows(parseStations(STATION_LINES), NAMES);
    const aliases: Alias[] = [
      {
        slug: "ghost",
        short: "Ghost",
        name: "Nonexistent Station - Renamed By CCP",
        sdeName: "Nonexistent Station - Renamed By CCP",
        sec: 0.5,
      },
    ];
    expect(() => pinAliases(aliases, stationRows)).toThrow(/failed to resolve/i);
  });

  it("assembles the full artifact", () => {
    const systems = buildSystemRows(parseSystems(SYSTEM_LINES));
    const stations = buildStationRows(parseStations(STATION_LINES), NAMES);
    const art = assembleArtifact(systems, stations, []);
    expect(art.systems).toHaveLength(2);
    expect(art.stations).toHaveLength(2);
    expect(art.aliases).toEqual([]);
  });
});
