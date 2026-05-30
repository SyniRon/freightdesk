# ADR 0011: Location search is build-time SDE extraction, not runtime ESI

**Status:** Accepted (2026-05-29)

## Context

The location combobox filters a hand-curated `LOCATIONS` array; anything not in it
flows through as a `{custom: true}` entry that every service marks ineligible. The
obvious next step is full-universe search — let a capsuleer type any system or
station name and pick it. The reflexive mechanism is a debounced **ESI `/search`**
at runtime.

Examined against the data already on hand, runtime search is the wrong mechanism for
the part of the universe that matters here:

1. **The SDE already carries the universe data, and it is static.** The SDE ZIP
   (~80 MB, already downloaded and cached by `scripts/build-sde.ts`) contains
   `mapSolarSystems.jsonl` — every solar system, self-describing: name +
   `securityStatus` (the raw float `SecBadge` renders), ~8.5k rows — and
   `npcStations.jsonl` — every NPC station, ~5.2k rows. This data is immutable
   between SDE releases. Paying a per-keystroke network round-trip to fetch
   reference data that never changes is a poor trade.

2. **NPC station names are the one thing the SDE omits.** `npcStations.jsonl` has
   `solarSystemID` / `operationID` / `ownerID` / `celestialIndex` but no name field.
   The contract-grade listing string ("Jita IV - Moon 4 - Caldari Navy Assembly
   Plant") is rendered from a heavy celestial join (`mapPlanets` 50 MB, `mapMoons`
   223 MB, `stationOperations`, `npcCorporations`) **or** resolved from ESI's
   `/universe/names` (POST, ≤1000 ids/call → ~6 calls for every station). This is
   the only piece that genuinely needs ESI — and it is a bounded, one-time lookup,
   not a per-keystroke one.

3. **Runtime search adds cost for no benefit on static data.** It introduces a
   second runtime external dependency (after Fuzzwork), an unreachable-fallback UX,
   per-keystroke debounce, in-flight abort + a result cache, an *extra* call per
   result for security status (`/search` does not return it), and a new privacy
   surface — location queries leaving the browser, another scrub to verify.

3a. **Player-built Upwell structures are out of reach regardless.** They are not in
   the SDE, and querying one needs a docking-scoped token per structure — so they
   cannot be enumerated from public data by any mechanism. Full structure search is
   a separate, unsolved problem; this decision covers only systems and NPC stations.

## Decision

Build location search from **static data extracted at image-build time. No runtime
ESI.**

- Extend `scripts/build-sde.ts` to emit a `locations.json` beside `items.json`:
  systems read directly from `mapSolarSystems.jsonl` (offline); NPC station names
  resolved once at build via ESI `/universe/names` and frozen, each carrying its
  system's `securityStatus`. ~180 KB gzip, loaded once at runtime the way
  `items.json` already is.
- `LocationCombo` keeps its shape — a synchronous client-side filter over an array,
  the array growing from 5 entries to the full corpus. There is no debounce (local
  filter is instant), no runtime cache (the static asset is the cache), no
  unreachable fallback (no network call); ranking is pure string match
  (exact > prefix > substring).

### Keyspace and reconciliation

- **Routes key on human-readable slugs** (`jita`, `cj6mt`), with a `sta:<id>` /
  `sys:<id>` escape hatch the resolver also accepts for one-off endpoints not worth
  naming. Raw SDE ids never need to appear in a service definition for the common
  case.
- A build-validated **alias table** — the repurposed `LOCATIONS`, now "the handful
  of locations services route to/from" rather than "the picker's universe" — pins
  each slug to a canonical SDE location **by name**. The build resolves the name
  against the static data and **fails loudly** on no match; a station rename or typo
  breaks the build, never ships silently. Its size is bounded by the number of
  service endpoints, not by the size of the universe.
- **Upwell structures are hand-pinned** in the alias table (currently only
  `C-J6MT - 1st Taj Mahgoon`) because the SDE cannot supply them.
- **Reconciliation is then automatic:** a location picked from search carries its
  SDE id; if an alias pins that id it *is* the slug (routes match → eligible),
  otherwise no service routes there (→ ineligible). One canonical identity per
  location; no dual-identity regression where a searched Jita and a preset Jita
  differ.

## Consequences

- `LOCATIONS` changes role from picker-universe to alias table. Existing routes
  re-point from preset ids to aliased SDE locations; hand-pinned structures are
  unchanged.
- The alias table is coupled to SDE releases: a CCP station rename breaks the build
  until the alias name is updated. This is the intended failure mode — loud over
  silent.
- This decision covers **single-endpoint** routes only. Set-based endpoints (a
  service that serves *every system in a region*) are deliberately not addressed:
  expressing them belongs to the service-eligibility model (route schema,
  `evaluateServices`, `Quote`), as a predicate over the SDE's `regionID` /
  `securityStatus` — not to location search. Treating them by enumerating ids in a
  service definition is explicitly rejected.
- Runtime ESI `/search` is justified only for player-built Upwell structures, which
  this decision does not attempt. Privacy surface stays at zero — no location query
  leaves the browser.
