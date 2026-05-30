// Runtime locations dataset (ADR 0011). Loads /locations.json once on app mount,
// caches in module scope (mirrors items.ts: in-flight dedupe + loading/error
// state). The static asset IS the cache — no debounce, no runtime cache layer,
// no network call at search time. Search is a synchronous client-side filter.

import { ALIASES, type Alias } from "./aliases";
import type { Location } from "./logic";

// Compact wire rows (see scripts/lib/extract-locations.ts).
type SystemRow = [id: number, name: string, sec: number];
type StationRow = [id: number, name: string, sysId: number];

interface AliasPin {
  slug: string;
  short: string;
  name: string;
  sec: number | null;
  hub?: boolean;
  alliance?: boolean;
  structure?: boolean;
  sdeId: number | null;
}

interface LocationsArtifact {
  systems: SystemRow[];
  stations: StationRow[];
  aliases: AliasPin[];
}

// Decoded, indexed corpus held in module scope.
export interface LocationIndex {
  /** sysId → [name, sec] for the security badge + search scaffolding. */
  systems: Map<number, { name: string; sec: number }>;
  /** Every selectable NPC station (dockable). */
  stations: { id: number; name: string; sysId: number }[];
  /** sdeId → slug, for reconciling a searched dockable to a routed preset. */
  sdeIdToSlug: Map<number, string>;
}

let cache: LocationIndex | null = null;
let inflight: Promise<LocationIndex> | null = null;

function index(art: LocationsArtifact): LocationIndex {
  const systems = new Map<number, { name: string; sec: number }>();
  for (const [id, name, sec] of art.systems) systems.set(id, { name, sec });
  const sdeIdToSlug = new Map<number, string>();
  for (const a of art.aliases) {
    if (a.sdeId != null) sdeIdToSlug.set(a.sdeId, a.slug);
  }
  return {
    systems,
    stations: art.stations.map(([id, name, sysId]) => ({ id, name, sysId })),
    sdeIdToSlug,
  };
}

export async function loadLocations(): Promise<LocationIndex> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/locations.json")
    .then((r) => {
      if (!r.ok) throw new Error(`locations.json fetch failed: ${r.status}`);
      return r.json() as Promise<LocationsArtifact>;
    })
    .then((data) => {
      cache = index(data);
      inflight = null;
      return cache;
    });
  return inflight;
}

export function getLocationsSync(): LocationIndex | null {
  return cache;
}

// Test-only — resets module state.
export function __setLocationsForTesting(idx: LocationIndex | null) {
  cache = idx;
  inflight = null;
}

export function __indexForTesting(art: LocationsArtifact): LocationIndex {
  return index(art);
}

// ─── Search & ranking ────────────────────────────────────────────────────────
// Curated alias entries (hubs + structures) pin to the top with friendly labels;
// SDE dockables rank below by system-name relevance: exact system match, then
// system-name prefix, then full-name substring. Within a system, aliased
// stations rank above non-aliased siblings. Capped — "keep typing to narrow".

export const SEARCH_CAP = 50;

export interface SearchResult {
  /** The Location that gets committed on selection. For an aliased dockable this
   *  is the *preset* (slug id) so routes match; otherwise a real `sta:` Location. */
  loc: Location;
  /** Curated alias entry (pinned at top, friendly label). */
  preset: boolean;
}

export interface SearchOutput {
  results: SearchResult[];
  /** True when the corpus had more matches than the cap. */
  truncated: boolean;
}

// Build the runtime Location a dockable commits as. If the dockable's SDE id is
// aliased, return the canonical preset Location so it reconciles to the slug;
// otherwise a real (non-custom, ineligible-until-routed) `sta:` Location.
export function dockableLocation(
  station: { id: number; name: string; sysId: number },
  idx: LocationIndex,
): Location {
  const slug = idx.sdeIdToSlug.get(station.id);
  if (slug) {
    const preset = presetLocations().find((l) => l.id === slug);
    if (preset) return preset;
  }
  const sys = idx.systems.get(station.sysId);
  return {
    id: `sta:${station.id}`,
    name: station.name,
    short: shortLabel(station.name),
    sec: sys ? sys.sec : null,
  };
}

// A station's display short label — the system name is the leading token of the
// listing string ("Jita IV - Moon 4 - ..." → "Jita").
function shortLabel(stationName: string): string {
  const head = stationName.split(/\s|-/)[0];
  return head || stationName;
}

// The curated presets as Locations (slug id), derived from the alias table so
// there is exactly one source of truth. Mirrors LOCATIONS in logic.ts.
function presetLocations(): Location[] {
  return ALIASES.map(aliasToLocation);
}

export function aliasToLocation(a: Alias): Location {
  return {
    id: a.slug,
    name: a.name,
    short: a.short,
    sec: a.sec,
    hub: a.hub,
    alliance: a.alliance,
  };
}

const rank = (stationName: string, sysName: string, lower: string): number => {
  const sys = sysName.toLowerCase();
  if (sys === lower) return 0; // exact system match
  if (sys.startsWith(lower)) return 1; // system-name prefix
  if (stationName.toLowerCase().includes(lower)) return 2; // full-name substring
  return -1; // no match
};

export function searchLocations(
  query: string,
  idx: LocationIndex | null,
  presets: Location[],
): SearchOutput {
  const lower = query.trim().toLowerCase();

  // Curated presets matching the query (or all, on empty query) — pinned first.
  const presetMatches = (lower
    ? presets.filter(
        (l) =>
          l.short.toLowerCase().includes(lower) ||
          l.name.toLowerCase().includes(lower) ||
          l.id.toLowerCase().includes(lower),
      )
    : presets
  ).map((l): SearchResult => ({ loc: l, preset: true }));

  if (!lower || !idx) {
    return { results: presetMatches.slice(0, SEARCH_CAP), truncated: false };
  }

  // Slugs already covered by a preset match — don't list an aliased station twice.
  const coveredSlugs = new Set(
    presetMatches.map((r) => r.loc.id),
  );

  type Scored = { station: { id: number; name: string; sysId: number }; r: number; aliased: boolean };
  const scored: Scored[] = [];
  for (const st of idx.stations) {
    const sys = idx.systems.get(st.sysId);
    if (!sys) continue;
    const r = rank(st.name, sys.name, lower);
    if (r < 0) continue;
    const slug = idx.sdeIdToSlug.get(st.id);
    if (slug && coveredSlugs.has(slug)) continue; // already pinned as a preset
    scored.push({ station: st, r, aliased: !!slug });
  }

  // exact > prefix > substring; within a tier aliased siblings first, then name.
  scored.sort(
    (a, b) =>
      a.r - b.r ||
      Number(b.aliased) - Number(a.aliased) ||
      a.station.name.localeCompare(b.station.name),
  );

  const budget = Math.max(0, SEARCH_CAP - presetMatches.length);
  const stationResults = scored.slice(0, budget).map((s): SearchResult => ({
    loc: dockableLocation(s.station, idx),
    preset: false,
  }));

  return {
    results: [...presetMatches, ...stationResults],
    truncated: scored.length > budget,
  };
}
