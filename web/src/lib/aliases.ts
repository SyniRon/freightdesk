// Alias table — the handful of dockables that services route to/from (ADR 0011).
//
// Repurposed from the old "picker universe" `LOCATIONS` array. Each alias pins a
// human-readable slug (the keyspace service routes use — `jita44`, `cj6mt`) to a
// canonical dockable.
//
//   - NPC stations pin to the SDE by EXACT name (`sdeName`). The build resolves
//     the name against the extracted locations dataset and FREEZES the SDE id
//     into the emitted `locations.json` alias block. A rename/typo that matches
//     no SDE location FAILS THE BUILD — loud over silent (ADR 0011).
//   - Upwell structures are hand-pinned (`structure: true`): the SDE cannot
//     supply them, so they carry no `sdeName` and never resolve to an SDE id.
//
// This file is intentionally dependency-free so the build script (`build-sde.ts`)
// can import it without pulling the React/runtime graph.

export interface Alias {
  /** Slug — the keyspace service routes use (route.origin / route.destination). */
  slug: string;
  /** Friendly short label rendered in the picker. */
  short: string;
  /** Fallback display name. For NPC stations this is overwritten at build time
   *  with the exact resolved SDE listing string; structures use it verbatim. */
  name: string;
  /** Security status. For NPC stations the build overwrites this with the
   *  station's system security; structures carry the hand-pinned value. */
  sec: number | null;
  /** Exact SDE NPC-station listing string to pin this slug to. Omitted for
   *  hand-pinned Upwell structures (not in the SDE). */
  sdeName?: string;
  hub?: boolean;
  alliance?: boolean;
  /** Hand-pinned Upwell structure — no SDE counterpart. */
  structure?: boolean;
}

export const ALIASES: Alias[] = [
  {
    slug: "jita44",
    short: "Jita 4-4",
    name: "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
    sdeName: "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
    hub: true,
    sec: 0.9,
  },
  {
    slug: "amarr",
    short: "Amarr",
    name: "Amarr VIII (Oris) - Emperor Family Academy",
    sdeName: "Amarr VIII (Oris) - Emperor Family Academy",
    hub: true,
    sec: 1.0,
  },
  {
    slug: "rens",
    short: "Rens",
    name: "Rens VI - Moon 8 - Brutor Tribe Treasury",
    sdeName: "Rens VI - Moon 8 - Brutor Tribe Treasury",
    hub: true,
    sec: 0.9,
  },
  {
    slug: "dodixie",
    short: "Dodixie",
    name: "Dodixie IX - Moon 20 - Federation Navy Assembly Plant",
    sdeName: "Dodixie IX - Moon 20 - Federation Navy Assembly Plant",
    hub: true,
    sec: 0.9,
  },
  {
    // Hand-pinned Upwell structure — not in the SDE. The full listing string is
    // what the contract Destination field expects verbatim.
    slug: "cj6mt",
    short: "C-J6MT",
    name: "C-J6MT - 1st Taj Mahgoon",
    alliance: true,
    structure: true,
    sec: -0.4,
  },
];
