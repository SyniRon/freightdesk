// FreightDesk — parser, services, locations.
// Parses EVE hangar paste, calculates volumes, evaluates per-service quotes.

import { ITEM_DB } from "./itemsDb";
import type { RouteFormula, Service, ServiceRoute } from "./types";
export type { RouteFormula, Service, ServiceRoute };
import { SERVICES } from "./services.generated";
export { SERVICES };

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
  route: ServiceRoute | undefined;
  eligible: boolean;
  reasons: string[];
  reward: number;
  collateral: number;
  vol: number;
  rushFee: number;
  rushApplied: boolean;
  breakdown: {
    formula: RouteFormula | undefined;
    formulaResult: number;
    minReward: number;
    rushAdded: number;
  };
}

export function applyFormula(f: RouteFormula, vol: number, collateral: number): number {
  switch (f.kind) {
    case "sum":       return vol * f.ratePerM3 + collateral * f.collateralPct;
    case "max":       return Math.max(vol * f.ratePerM3, collateral * f.collateralPct);
    case "rate-only": return vol * f.ratePerM3;
    case "flat":      return f.reward;
  }
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
  { id: "cjm6t", name: "C-JM6T - Alliance Staging Keepstar", short: "C-JM6T", hub: false, alliance: true, sec: -0.4 },
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

export function daysSince(iso: string): number {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return Math.floor(d);
}

export function evaluateServices(
  parse: ParseResult,
  origin: Location,
  dest: Location,
  rushEnabled: boolean = false,
): Quote[] {
  return SERVICES.map((s): Quote => {
    const route = s.routes.find((r) => r.origin === origin.id && r.destination === dest.id);
    const vol = parse.totalVol;
    const collateral = Math.max(parse.totalValue, 0);
    const reasons: string[] = [];

    if (!route) {
      reasons.push(
        origin?.custom || dest?.custom
          ? "Doesn't service custom destinations"
          : "Doesn't service this route",
      );
    }

    // Route-level overrides win, falling through to service-level.
    const minReward     = route?.minReward    ?? s.minReward    ?? 0;
    const maxVol        = route?.maxVol       ?? s.maxVol;
    const maxCollateral = route?.maxCollateral ?? s.maxCollateral;

    if (maxVol != null && vol > maxVol) {
      reasons.push(`Volume ${fmtVol(vol)} exceeds ${fmtVol(maxVol)} cap — split into multiple contracts`);
    }
    if (maxCollateral != null && collateral > maxCollateral) {
      reasons.push(`Collateral ${fmtISK(collateral)} exceeds ${fmtISK(maxCollateral)} cap — split into multiple contracts`);
    }

    const formulaResult = route ? applyFormula(route.formula, vol, collateral) : 0;
    const rushFee = route?.rushFee ?? 0;
    const rushApplied = !!route && rushEnabled && rushFee > 0;
    const rushAdded = rushApplied ? rushFee : 0;
    const reward = Math.max(minReward, formulaResult) + rushAdded;

    return {
      service: s,
      route,
      eligible: reasons.length === 0,
      reasons,
      reward,
      collateral,
      vol,
      rushFee,
      rushApplied,
      breakdown: { formula: route?.formula, formulaResult, minReward, rushAdded },
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
