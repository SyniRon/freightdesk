// FreightDesk — parser, services, locations.
// Parses EVE hangar paste, calculates volumes, evaluates per-service quotes.

import { ITEM_DB } from "./itemsDb";
import type { RouteFormula, Service, ServiceRoute } from "./types";
export type { RouteFormula, Service, ServiceRoute };

// ─── Types ─────────────────────────────────────────────────────────────────
export interface MatchedLine {
  key: string;
  name: string;
  qty: number;
  vol: number;
  price: number;
}

export interface UnmatchedLine {
  raw: string;
  name: string;
  qty: number;
}

export interface ParseResult {
  matched: MatchedLine[];
  unmatched: UnmatchedLine[];
  totalVol: number;
  totalValue: number;
}

export interface Location {
  id: string;
  name: string;
  short: string;
  sec: number | null;
  hub?: boolean;
  alliance?: boolean;
  custom?: boolean;
}

export interface Quote {
  service: Service;
  eligible: boolean;
  reasons: string[];
  reward: number;
  collateral: number;
  vol: number;
  breakdown: { volPart: number; collPart: number; min: number };
}

// ─── Formatting helpers ─────────────────────────────────────────────────────
export const fmtISK = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
};

export const fmtISKFull = (n: number | null | undefined): string =>
  n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString() + " ISK";

export const fmtVol = (n: number | null | undefined): string =>
  n == null || isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " m³";

export const fmtInt = (n: number | null | undefined): string =>
  n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString();

// ─── Paste parser ───────────────────────────────────────────────────────────
export function parseHangarPaste(raw: string): ParseResult {
  const matched: MatchedLine[] = [];
  const unmatched: UnmatchedLine[] = [];
  const lines = raw.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    // Try common EVE paste shapes:
    //   "Item Name\tQty\t..."  (hangar)
    //   "Item Name x Qty"      (chat)
    //   "Qty Item Name"        (fallback)
    let name: string | null = null;
    let qty = 1;
    if (line.includes("\t")) {
      const parts = line.split("\t");
      name = parts[0].trim();
      const q = parseInt(parts[1]?.replace(/[^\d]/g, "") ?? "", 10);
      if (!isNaN(q) && q > 0) qty = q;
    } else {
      const m = line.match(/^(.+?)\s+x\s*(\d+)$/i);
      if (m) {
        name = m[1].trim();
        qty = parseInt(m[2], 10);
      } else {
        name = line;
        qty = 1;
      }
    }
    if (!name) continue;
    const key = name.toLowerCase();
    const hit = ITEM_DB[key];
    if (hit) {
      const existing = matched.find((r) => r.key === key);
      if (existing) existing.qty += qty;
      else matched.push({ key, name, qty, vol: hit.vol, price: hit.price });
    } else {
      unmatched.push({ raw: line, name, qty });
    }
  }
  const totalVol = matched.reduce((a, r) => a + r.vol * r.qty, 0);
  const totalValue = matched.reduce((a, r) => a + r.price * r.qty, 0);
  return { matched, unmatched, totalVol, totalValue };
}

// ─── Routes & services (stubbed, layout supports N) ─────────────────────────
// sec: numeric security status (matches EVE's 1.0 → -1.0 scale).
// Anything ≥ 0.5 is high-sec, 0.1–0.4 is low-sec, ≤ 0.0 is null-sec / wormhole.
export const LOCATIONS: Location[] = [
  { id: "jita44", name: "Jita IV - Moon 4 - Caldari Navy Assembly Plant", short: "Jita 4-4", hub: true, sec: 0.9 },
  { id: "amarr", name: "Amarr VIII (Oris) - Emperor Family Academy", short: "Amarr", hub: true, sec: 1.0 },
  { id: "rens", name: "Rens VI - Moon 8 - Brutor Tribe Treasury", short: "Rens", hub: true, sec: 0.9 },
  { id: "dodixie", name: "Dodixie IX - Moon 20 - Federation Navy Assembly", short: "Dodixie", hub: true, sec: 0.9 },
  { id: "slc", name: "SLC-K7 - Alliance Staging Keepstar", short: "SLC-K7", hub: false, alliance: true, sec: -0.4 },
];

export interface SecTierInfo {
  tier: "high" | "low" | "null" | "unknown";
  label: string;
  color: string;
}

// Classify a sec status into a tier + display color.
export function secTier(sec: number | null | undefined): SecTierInfo {
  if (sec == null) return { tier: "unknown", label: "—", color: "var(--dim)" };
  if (sec >= 0.5) return { tier: "high", label: "high-sec", color: "var(--ok)" };
  if (sec >= 0.1) return { tier: "low", label: "low-sec", color: "var(--warn)" };
  return { tier: "null", label: "null-sec", color: "var(--bad)" };
}

export function fmtSec(sec: number | null | undefined): string {
  return sec == null ? "—" : sec.toFixed(1);
}

// STUB: in a real build these come from per-service config files on disk; the
// "updated" date is read from the file's git commit metadata.
// See CLAUDE.md design pin "Rates and new services land via git."
export const SERVICES: Service[] = [
  {
    id: "alliance",
    name: "Alliance Logistics (SLC-K7)",
    tagline: "Internal alliance freight • discord ping on accept",
    minReward: 5_000_000,
    maxVol: 360_000,
    maxCollateral: 8_000_000_000,
    routes: [
      {
        origin: "jita44",
        destination: "slc",
        formula: { kind: "sum", ratePerM3: 450, collateralPct: 0.015 },
      },
      {
        origin: "slc",
        destination: "jita44",
        formula: { kind: "sum", ratePerM3: 450, collateralPct: 0.015 },
      },
    ],
    updated: "2026-05-09",
  },
  {
    id: "pushx",
    name: "PushX Public Freight",
    tagline: "Public hi-sec courier • automated quote",
    minReward: 1_000_000,
    maxVol: 360_000,
    maxCollateral: 20_000_000_000,
    routes: [
      { origin: "jita44", destination: "amarr", formula: { kind: "sum", ratePerM3: 850, collateralPct: 0.0075 } },
      { origin: "jita44", destination: "rens",  formula: { kind: "sum", ratePerM3: 850, collateralPct: 0.0075 } },
      { origin: "jita44", destination: "dodixie", formula: { kind: "sum", ratePerM3: 850, collateralPct: 0.0075 } },
      { origin: "amarr",  destination: "jita44", formula: { kind: "sum", ratePerM3: 850, collateralPct: 0.0075 } },
      { origin: "rens",   destination: "jita44", formula: { kind: "sum", ratePerM3: 850, collateralPct: 0.0075 } },
      { origin: "dodixie", destination: "jita44", formula: { kind: "sum", ratePerM3: 850, collateralPct: 0.0075 } },
    ],
    updated: "2026-04-22",
  },
  {
    id: "redfrog",
    name: "Red Frog Freight",
    tagline: "Hi-sec courier specialist • 1B collateral cap",
    minReward: 800_000,
    maxVol: 60_000,
    maxCollateral: 1_000_000_000,
    routes: [
      { origin: "jita44", destination: "amarr", formula: { kind: "sum", ratePerM3: 600, collateralPct: 0.01 } },
      { origin: "jita44", destination: "rens",  formula: { kind: "sum", ratePerM3: 600, collateralPct: 0.01 } },
      { origin: "jita44", destination: "dodixie", formula: { kind: "sum", ratePerM3: 600, collateralPct: 0.01 } },
      { origin: "amarr",  destination: "jita44", formula: { kind: "sum", ratePerM3: 600, collateralPct: 0.01 } },
      { origin: "rens",   destination: "jita44", formula: { kind: "sum", ratePerM3: 600, collateralPct: 0.01 } },
      { origin: "dodixie", destination: "jita44", formula: { kind: "sum", ratePerM3: 600, collateralPct: 0.01 } },
    ],
    updated: "2026-03-15",
  },
];

export function daysSince(iso: string): number {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return Math.floor(d);
}

export function evaluateServices(parse: ParseResult, origin: Location, dest: Location): Quote[] {
  const originId = origin?.id;
  const destId = dest?.id;
  return SERVICES.map((s) => {
    const reasons: string[] = [];
    const route = s.routes.find((r) => r.origin === originId && r.destination === destId);
    const routeOk = route != null;
    const vol = parse.totalVol;
    const collateral = Math.max(parse.totalValue, 0);

    let reward = s.minReward ?? 0;
    let volPart = 0;
    let collPart = 0;
    if (route && route.formula.kind === "sum") {
      volPart = vol * route.formula.ratePerM3;
      collPart = collateral * route.formula.collateralPct;
      reward = Math.max(s.minReward ?? 0, volPart + collPart);
    }

    if (!routeOk) {
      reasons.push(
        origin?.custom || dest?.custom
          ? "Doesn't service custom destinations"
          : "Doesn't service this route",
      );
    }
    if (s.maxVol != null && vol > s.maxVol)
      reasons.push(`Volume ${fmtVol(vol)} exceeds ${fmtVol(s.maxVol)} cap`);
    if (s.maxCollateral != null && collateral > s.maxCollateral)
      reasons.push(`Collateral ${fmtISK(collateral)} exceeds ${fmtISK(s.maxCollateral)} cap`);
    const eligible = reasons.length === 0;
    return {
      service: s,
      eligible,
      reasons,
      reward,
      collateral,
      vol,
      breakdown: {
        volPart,
        collPart,
        min: s.minReward ?? 0,
      },
    };
  });
}

// Construct a custom (user-typed) location object. Has no id collision with
// the preset table — services won't match it, which is the correct behavior
// until backend search is wired up.
export function makeCustomLocation(text: string): Location {
  const t = text.trim();
  return {
    id: "custom:" + t.toLowerCase(),
    short: t,
    name: t,
    sec: null,
    custom: true,
  };
}

// Resolve a stored location value back into an object. Handles legacy id-string
// state from before the combobox migration.
export function resolveLocation(stored: unknown, fallbackId: string): Location {
  if (stored && typeof stored === "object" && stored !== null && "id" in stored) {
    const obj = stored as Location;
    if (obj.custom) return obj;
    return LOCATIONS.find((l) => l.id === obj.id) || obj;
  }
  if (typeof stored === "string") {
    return (
      LOCATIONS.find((l) => l.id === stored) ||
      LOCATIONS.find((l) => l.id === fallbackId) ||
      LOCATIONS[0]
    );
  }
  return LOCATIONS.find((l) => l.id === fallbackId) || LOCATIONS[0];
}
