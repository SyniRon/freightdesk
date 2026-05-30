// FreightDesk — service config schema.
//
// Per-route formulas because shippers commonly price differently in each
// direction (e.g. C-J → Jita uses max(rate, %coll); Jita → C-J uses rate only).

export type RouteFormula =
  | { kind: "sum"; ratePerM3: number; collateralPct: number }
  | { kind: "max"; ratePerM3: number; collateralPct: number }
  | { kind: "rate-only"; ratePerM3: number }
  | { kind: "flat"; reward: number }
  // Volume reward clamped between a `floor` and a per-route `fullLoad` ceiling,
  // then (when collateralPct is present) max()'d against a collateral-percent
  // component. fullLoad is the reward at a full load (rate × maxVol).
  | {
      kind: "clamped-rate";
      ratePerM3: number;
      floor: number;
      fullLoad: number;
      collateralPct?: number;
    };

export interface ServiceRoute {
  origin: string;
  destination: string;
  formula: RouteFormula;
  rushFee?: number;
  minReward?: number;
  maxVol?: number;
  maxCollateral?: number;
}

export interface Service {
  id: string;
  name: string;
  tagline: string;
  minReward?: number;
  maxVol?: number;
  maxCollateral?: number;
  routes: ServiceRoute[];
  updated: string;
  contract?: ServiceContractMeta;
}

export interface ServiceContractMeta {
  expiration: string;       // free-form display, e.g. "1 week"
  daysToComplete: string;   // free-form display, e.g. "7 days"
  descriptionHint?: string; // optional, e.g. "optional"
  source?: string;          // optional — published rate-card URL this config mirrors
}
