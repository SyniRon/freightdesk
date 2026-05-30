// FreightDesk — parser, services, locations.
// Parses EVE hangar paste, calculates volumes, evaluates per-service quotes.

import type { ItemEntry } from "./items";
import type { RouteFormula, Service, ServiceRoute } from "./types";
export type { RouteFormula, Service, ServiceRoute };
import { SERVICES } from "./services.generated";
export { SERVICES };
import { ALIASES } from "./aliases";

// ─── Types ─────────────────────────────────────────────────────────────────
export interface MatchedLine {
  key: string;
  name: string;
  qty: number;
  vol: number;
  price: number;
  id: number;  // typeID for downstream pricing lookup
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
  totalValue: number;       // raw cargo value (sum of price × qty)
  collateral?: number;      // contract collateral = totalValue × (collateralPct / 100). Populated by recomputeWithPrices.
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

// Tri-state eligibility (ADR 0010):
//   eligible    — a route matches and the load fits within the caps.
//   splittable  — a route matches but the aggregate load exceeds maxVol and/or
//                 maxCollateral, yet every individual unit fits. The shipper
//                 will take it as N contracts; we surface an advisory.
//   ineligible  — no route matches, OR a single indivisible unit can never fit
//                 (its own volume exceeds maxVol, or its own collateral exceeds
//                 maxCollateral). reasons[] carries the human-readable cause.
export type QuoteStatus = "eligible" | "splittable" | "ineligible";

// Over-cap split advisory. Present only on a `splittable` quote. Even-split per
// ADR 0010: every sub-contract is identical, so allInCost = N × per-contract.
export interface SplitAdvisory {
  n: number;                    // contract count, ≥ 2
  allInCost: number;           // honest total to ship the whole load across N contracts (rush-aware, minReward-floored per contract)
  perContractVol: number;      // approximate per-contract volume target (vol / N)
  perContractCollateral: number; // approximate per-contract collateral target (collateral / N)
}

export interface Quote {
  service: Service;
  route: ServiceRoute | undefined;
  status: QuoteStatus;
  reasons: string[];
  reward: number;
  collateral: number;
  vol: number;
  rushFee: number;
  rushApplied: boolean;
  overridden: { collateral: boolean; vol: boolean; rate: boolean };
  // The market/Jita-derived figures *before* any direct override is applied, so
  // a card can render the struck-through original next to the override value
  // (issue #39). When the corresponding override is off, market.* equals the
  // live figure. `ratePerM3` is the active route formula's own per-m³ rate, or
  // undefined for a flat/rate-free formula (or no route).
  market: { collateral: number; vol: number; ratePerM3: number | undefined };
  // The per-m³ rate actually used to price this quote: the override when one is
  // consumed, otherwise the route formula's own rate (undefined for flat / no
  // route). The live counterpart to market.ratePerM3.
  ratePerM3: number | undefined;
  split?: SplitAdvisory;
  breakdown: {
    formula: RouteFormula | undefined;
    formulaResult: number;
    minReward: number;
    rushAdded: number;
  };
}

// Direct user overrides for the three market-derived inputs. Each is optional;
// a present, finite, positive value wins over the market-derived value. Set by
// the settings drawer, applied in evaluateServices. See issue #15.
export interface QuoteOverrides {
  collateral?: number;    // contract collateral, ISK
  vol?: number;           // packaged volume, m³
  ratePerM3?: number;     // per-m³ shipping rate, ISK
  maxCollateral?: number; // collateral cap override, ISK — lets the settings drawer
                          // (and tests) exercise a hard collateral cap on services
                          // that don't publish one. Falls through to route/service cap.
}

const isOverride = (n: number | undefined): n is number =>
  typeof n === "number" && isFinite(n) && n > 0;

// The per-m³ rate a formula prices against (undefined for the rate-free flat
// formula). Used to surface the market rate the override displaces on a card.
export function formulaRate(f: RouteFormula | undefined): number | undefined {
  if (!f) return undefined;
  return f.kind === "flat" ? undefined : f.ratePerM3;
}

// Apply a formula. An optional rate override substitutes for the formula's
// own ratePerM3 in any rate-bearing leg (sum / max / rate-only); flat is
// rate-free and so unaffected.
export function applyFormula(
  f: RouteFormula,
  vol: number,
  collateral: number,
  rateOverride?: number,
): number {
  const rate = (r: number) => (isOverride(rateOverride) ? rateOverride : r);
  switch (f.kind) {
    case "sum":       return vol * rate(f.ratePerM3) + collateral * f.collateralPct;
    case "max":       return Math.max(vol * rate(f.ratePerM3), collateral * f.collateralPct);
    case "rate-only": return vol * rate(f.ratePerM3);
    case "flat":      return f.reward;
    case "clamped-rate": {
      // Volume reward clamped to [floor, fullLoad], then (outbound) max()'d
      // against the collateral-percent component. See ADR 0008 — the ceil for
      // calculator parity is applied at display time on the final reward.
      const clamped = Math.min(Math.max(vol * rate(f.ratePerM3), f.floor), f.fullLoad);
      return f.collateralPct != null
        ? Math.max(clamped, collateral * f.collateralPct)
        : clamped;
    }
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
export function parseHangarPaste(raw: string, db: Record<string, ItemEntry>): ParseResult {
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
    const hit = db[key];
    if (hit) {
      const existing = matched.find((r) => r.key === key);
      if (existing) existing.qty += qty;
      else matched.push({ key, name, qty, vol: hit.vol, price: 0, id: hit.id });
    } else {
      unmatched.push({ raw: line, name, qty });
    }
  }
  const totalVol = matched.reduce((a, r) => a + r.vol * r.qty, 0);
  const totalValue = matched.reduce((a, r) => a + r.price * r.qty, 0);
  return { matched, unmatched, totalVol, totalValue };
}

/**
 * Given a parsed paste and a typeID→price map, fill in matched[i].price and
 * compute totalValue + collateral. Collateral is set to a percentage of
 * estimated value (default 120% = 20% buffer above market) so the contract
 * has headroom over volatility.
 */
export function recomputeWithPrices(
  parse: ParseResult,
  prices: Map<number, number>,
  collateralPct: number = 120,
): ParseResult {
  let totalValue = 0;
  const matched = parse.matched.map((m) => {
    const p = prices.get(m.id) ?? 0;
    totalValue += p * m.qty;
    return { ...m, price: p };
  });
  const pct = isFinite(collateralPct) && collateralPct > 0 ? collateralPct : 120;
  return {
    ...parse,
    matched,
    totalValue,
    collateral: Math.round(totalValue * (pct / 100)),
  };
}

// ─── Routes & services ───────────────────────────────────────────────────────
// sec: numeric security status (matches EVE's 1.0 → -1.0 scale).
// Anything ≥ 0.5 is high-sec, 0.1–0.4 is low-sec, ≤ 0.0 is null-sec / wormhole.
//
// `LOCATIONS` is no longer the picker's universe (ADR 0011) — full-universe
// search now spans the SDE-sourced corpus in locations.ts. It is the curated
// alias table: the handful of dockables services route to/from, keyed on the
// human-readable slugs (`jita44`, `cj6mt`) that ServiceRoute.origin/destination
// reference. Derived from the single alias source so a searched Jita and the
// pinned Jita are one identity. Hubs + structures keep their friendly labels.
export const LOCATIONS: Location[] = ALIASES.map((a) => ({
  id: a.slug,
  name: a.name,
  short: a.short,
  sec: a.sec,
  hub: a.hub,
  alliance: a.alliance,
}));

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

// Canonicalize a route endpoint key to the identity a picked Location carries
// (ADR 0011). Human slugs pass through. A `sta:<id>` escape-hatch endpoint —
// a station id — resolves to its alias slug when the station is aliased (so it
// unifies with a picked, preset-reconciled dockable); otherwise it stays the
// raw `sta:<id>` string, matching a picked non-aliased dockable verbatim.
// `sys:<id>` (a solar-system id) is a distinct keyspace; no alias pins a bare
// system, so it always passes through. `idToSlug` is sourced from the
// build-frozen alias pins in locations.json (station sdeId → slug).
export function canonicalEndpoint(key: string, idToSlug?: Map<number, string>): string {
  const m = /^sta:(\d+)$/.exec(key);
  if (m && idToSlug) {
    const slug = idToSlug.get(Number(m[1]));
    if (slug) return slug;
  }
  return key;
}

export function daysSince(iso: string): number {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return Math.floor(d);
}

// Compute the over-cap split advisory for a load that exceeds a cap but can be
// partitioned to fit. Even division (ADR 0010): N contracts each carrying
// vol/N and collateral/N. The all-in cost is the honest total — per-contract
// reward (formula, minReward-floored, plus rush when on) × N. For the `max`
// formula an even split is the cost-optimal balance, and total = N × per-leg.
function computeSplit(
  route: ServiceRoute,
  vol: number,
  collateral: number,
  maxVol: number | undefined,
  maxCollateral: number | undefined,
  minReward: number,
  rushAdded: number,
  rateOverride: number | undefined,
): SplitAdvisory {
  const volDiv = maxVol != null && maxVol > 0 ? Math.ceil(vol / maxVol) : 1;
  const collDiv = maxCollateral != null && maxCollateral > 0 ? Math.ceil(collateral / maxCollateral) : 1;
  const n = Math.max(2, volDiv, collDiv);
  const perVol = vol / n;
  const perColl = collateral / n;
  // Each sub-contract is priced independently: formula → minReward floor → rush.
  const perContractReward =
    Math.max(minReward, applyFormula(route.formula, perVol, perColl, rateOverride)) + rushAdded;
  return {
    n,
    allInCost: perContractReward * n,
    perContractVol: perVol,
    perContractCollateral: perColl,
  };
}

export function evaluateServices(
  parse: ParseResult,
  origin: Location,
  dest: Location,
  rushEnabled: boolean = false,
  overrides: QuoteOverrides = {},
  idToSlug?: Map<number, string>,
): Quote[] {
  // Reconcile picked endpoints and route endpoints to one canonical key so a
  // slug-keyed route matches an aliased dockable picked from search, and a
  // `sta:<id>` escape-hatch route matches that station's named slug (ADR 0011).
  const originKey = canonicalEndpoint(origin.id, idToSlug);
  const destKey = canonicalEndpoint(dest.id, idToSlug);
  // Direct overrides win over market-derived values. The collateral-ISK
  // override also takes priority over the collateralPct override (which has
  // already been folded into parse.collateral upstream) — issue #15.
  const collOver = isOverride(overrides.collateral);
  const volOver = isOverride(overrides.vol);
  const rateOver = isOverride(overrides.ratePerM3);
  return SERVICES.map((s): Quote => {
    const route = s.routes.find(
      (r) =>
        canonicalEndpoint(r.origin, idToSlug) === originKey &&
        canonicalEndpoint(r.destination, idToSlug) === destKey,
    );
    const marketVol = parse.totalVol;
    const marketCollateral = Math.max(parse.collateral ?? parse.totalValue, 0);
    const vol = volOver ? overrides.vol! : marketVol;
    const collateral = collOver ? overrides.collateral! : marketCollateral;
    const reasons: string[] = [];

    // Route-level overrides win, falling through to service-level. A
    // maxCollateral override (issue #15-adjacent) lets the settings drawer
    // impose a cap on services that publish none.
    const minReward     = route?.minReward    ?? s.minReward    ?? 0;
    const maxVol        = route?.maxVol       ?? s.maxVol;
    const maxCollateral = isOverride(overrides.maxCollateral)
      ? overrides.maxCollateral
      : (route?.maxCollateral ?? s.maxCollateral);

    const formulaResult = route ? applyFormula(route.formula, vol, collateral, overrides.ratePerM3) : 0;
    const rushFee = route?.rushFee ?? 0;
    const rushApplied = !!route && rushEnabled && rushFee > 0;
    const rushAdded = rushApplied ? rushFee : 0;
    const reward = Math.max(minReward, formulaResult) + rushAdded;

    // A rate override only actually moves the reward for rate-bearing formulas;
    // flag it overridden only when the active route can consume it.
    const rateConsumed = rateOver && !!route && route.formula.kind !== "flat";
    const overridden = { collateral: collOver, vol: volOver, rate: rateConsumed };
    const marketRate = formulaRate(route?.formula);
    const market = { collateral: marketCollateral, vol: marketVol, ratePerM3: marketRate };
    const ratePerM3 = rateConsumed ? overrides.ratePerM3! : marketRate;

    // ─── Tri-state classification (ADR 0010) ───────────────────────────────
    // No route → ineligible.
    if (!route) {
      reasons.push(
        origin?.custom || dest?.custom
          ? "Doesn't service custom destinations"
          : "Doesn't service this route",
      );
      return {
        service: s, route, status: "ineligible", reasons, reward, collateral, vol,
        rushFee, rushApplied, overridden, market, ratePerM3,
        breakdown: { formula: undefined, formulaResult, minReward, rushAdded },
      };
    }

    const overVol = maxVol != null && vol > maxVol;
    const overColl = maxCollateral != null && collateral > maxCollateral;

    if (overVol || overColl) {
      // Over a cap. Splittable iff every individual unit still fits — otherwise
      // there's an indivisible piece no partition can place, so ineligible.
      // Per-unit contract collateral scales the unit's market value by the same
      // collateral/value ratio the whole load uses.
      const collScale = parse.totalValue > 0 ? collateral / parse.totalValue : 0;
      const uncuttableVol =
        maxVol != null && parse.matched.some((m) => m.vol > maxVol);
      const uncuttableColl =
        maxCollateral != null &&
        parse.matched.some((m) => m.price * collScale > maxCollateral);

      if (uncuttableVol || uncuttableColl) {
        if (uncuttableVol) reasons.push(`A single item is too large to fit ${fmtVol(maxVol!)} cap`);
        if (uncuttableColl) reasons.push(`A single item is too valuable to fit ${fmtISK(maxCollateral!)} collateral cap`);
        return {
          service: s, route, status: "ineligible", reasons, reward, collateral, vol,
          rushFee, rushApplied, overridden, market, ratePerM3,
          breakdown: { formula: route.formula, formulaResult, minReward, rushAdded },
        };
      }

      const split = computeSplit(
        route, vol, collateral, maxVol, maxCollateral, minReward, rushAdded, overrides.ratePerM3,
      );
      return {
        service: s, route, status: "splittable", reasons, reward, collateral, vol,
        rushFee, rushApplied, overridden, market, ratePerM3, split,
        breakdown: { formula: route.formula, formulaResult, minReward, rushAdded },
      };
    }

    return {
      service: s, route, status: "eligible", reasons, reward, collateral, vol,
      rushFee, rushApplied, overridden, market, ratePerM3,
      breakdown: { formula: route.formula, formulaResult, minReward, rushAdded },
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
