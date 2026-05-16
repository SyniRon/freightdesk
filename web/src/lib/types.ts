// FreightDesk — service config schema.
//
// Per-route formulas because shippers commonly price differently in each
// direction (e.g. C-J → Jita uses max(rate, %coll); Jita → C-J uses rate only).

export type RouteFormula =
  | { kind: "sum"; ratePerM3: number; collateralPct: number }
  | { kind: "max"; ratePerM3: number; collateralPct: number }
  | { kind: "rate-only"; ratePerM3: number }
  | { kind: "flat"; reward: number };

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
}
