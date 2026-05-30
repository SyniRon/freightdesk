// Pure SDE → locations extraction (ADR 0011). Kept dependency-light and free of
// network/filesystem side effects so the extraction shape is unit-testable over a
// small fixture; the ESI name resolution + zip/file IO live in build-sde.ts.

import type { Alias } from "../../src/lib/aliases";

// Compact tuple rows keep locations.json small (~180 KB gzip over the full
// corpus). Decoded by the runtime loader (web/src/lib/locations.ts).
export type SystemRow = [id: number, name: string, sec: number];
export type StationRow = [id: number, name: string, sysId: number];

export interface AliasPin {
  slug: string;
  short: string;
  name: string;
  sec: number | null;
  hub?: boolean;
  alliance?: boolean;
  structure?: boolean;
  /** Frozen SDE station id, or null for hand-pinned Upwell structures. */
  sdeId: number | null;
}

export interface LocationsArtifact {
  systems: SystemRow[];
  stations: StationRow[];
  aliases: AliasPin[];
}

export interface RawSystem {
  _key: number;
  name: { en: string } | string;
  securityStatus: number;
}

export interface RawStation {
  _key: number;
  solarSystemID: number;
}

const enName = (n: { en: string } | string): string =>
  typeof n === "object" ? n.en : n;

// Round security to the SecBadge-relevant precision; trims a few bytes per row.
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function parseSystems(rawLines: string[]): RawSystem[] {
  const out: RawSystem[] = [];
  for (const line of rawLines) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line) as RawSystem);
  }
  return out;
}

export function parseStations(rawLines: string[]): RawStation[] {
  const out: RawStation[] = [];
  for (const line of rawLines) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line) as RawStation);
  }
  return out;
}

export function buildSystemRows(systems: RawSystem[]): SystemRow[] {
  return systems
    .map((s): SystemRow => [s._key, enName(s.name), round2(s.securityStatus)])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Assemble station rows from the SDE station list + the ESI-resolved name map.
 * Stations whose name failed to resolve are dropped (a station with no listing
 * string can't be a contract endpoint). Each row keeps its system id; security
 * is derived at runtime from the systems table.
 */
export function buildStationRows(
  stations: RawStation[],
  names: Map<number, string>,
): StationRow[] {
  const out: StationRow[] = [];
  for (const s of stations) {
    const name = names.get(s._key);
    if (!name) continue;
    out.push([s._key, name, s.solarSystemID]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Resolve each alias to a canonical SDE station id by EXACT name. Structures
 * (no `sdeName`) pin to null. Throws if a pinned name matches no station — the
 * intended loud failure (ADR 0011): a CCP rename/typo breaks the build.
 */
export function pinAliases(aliases: Alias[], stationRows: StationRow[]): AliasPin[] {
  const byName = new Map<string, number>();
  for (const [id, name] of stationRows) byName.set(name, id);

  const pins: AliasPin[] = [];
  const unresolved: string[] = [];
  for (const a of aliases) {
    let sdeId: number | null = null;
    if (a.sdeName) {
      const hit = byName.get(a.sdeName);
      if (hit == null) {
        unresolved.push(`${a.slug} → "${a.sdeName}"`);
        continue;
      }
      sdeId = hit;
    } else if (!a.structure) {
      // A non-structure alias with no sdeName can't reconcile to anything —
      // treat as a config error too.
      unresolved.push(`${a.slug} (no sdeName and not marked structure)`);
      continue;
    }
    pins.push({
      slug: a.slug,
      short: a.short,
      name: a.name,
      sec: a.sec,
      hub: a.hub,
      alliance: a.alliance,
      structure: a.structure,
      sdeId,
    });
  }

  if (unresolved.length) {
    throw new Error(
      `[locations] ${unresolved.length} alias(es) failed to resolve against the SDE:\n` +
        unresolved.map((u) => `  - ${u}`).join("\n") +
        `\nFix the alias name in web/src/lib/aliases.ts or update for the SDE release.`,
    );
  }
  return pins;
}

export function assembleArtifact(
  systems: SystemRow[],
  stations: StationRow[],
  aliases: AliasPin[],
): LocationsArtifact {
  return { systems, stations, aliases };
}
