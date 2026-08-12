// Pure service-config validation. Kept free of filesystem and process side
// effects so the schema gate is unit-testable; the readdir/parse/emit half
// lives in build-services.ts.

import type { Service, ServiceRoute, RouteFormula, ServiceContractMeta } from "../../src/lib/types";

function validateFormula(f: any, where: string): RouteFormula {
  if (!f || typeof f !== "object" || typeof f.kind !== "string") {
    throw new Error(`${where}: formula must be an object with .kind`);
  }
  switch (f.kind) {
    case "sum":
    case "max":
      if (typeof f.ratePerM3 !== "number" || typeof f.collateralPct !== "number")
        throw new Error(`${where}: ${f.kind} formula needs ratePerM3 + collateralPct numbers`);
      return { kind: f.kind, ratePerM3: f.ratePerM3, collateralPct: f.collateralPct };
    case "rate-only":
      if (typeof f.ratePerM3 !== "number")
        throw new Error(`${where}: rate-only formula needs ratePerM3 number`);
      return { kind: "rate-only", ratePerM3: f.ratePerM3 };
    case "flat":
      if (typeof f.reward !== "number")
        throw new Error(`${where}: flat formula needs reward number`);
      return { kind: "flat", reward: f.reward };
    case "clamped-rate":
      if (typeof f.ratePerM3 !== "number" || typeof f.floor !== "number" || typeof f.fullLoad !== "number")
        throw new Error(`${where}: clamped-rate formula needs ratePerM3 + floor + fullLoad numbers`);
      if (f.collateralPct != null && typeof f.collateralPct !== "number")
        throw new Error(`${where}: clamped-rate collateralPct must be a number when present`);
      return {
        kind: "clamped-rate",
        ratePerM3: f.ratePerM3,
        floor: f.floor,
        fullLoad: f.fullLoad,
        ...(f.collateralPct != null ? { collateralPct: f.collateralPct } : {}),
      };
    default:
      throw new Error(`${where}: unknown formula kind "${f.kind}"`);
  }
}

function validateRoute(r: any, where: string): ServiceRoute {
  if (!r || typeof r !== "object")        throw new Error(`${where}: route must be an object`);
  if (typeof r.origin !== "string")        throw new Error(`${where}: origin must be string`);
  if (typeof r.destination !== "string")   throw new Error(`${where}: destination must be string`);
  const formula = validateFormula(r.formula, `${where}.formula`);
  const optNum = (k: string) => {
    if (r[k] == null) return undefined;
    if (typeof r[k] !== "number") throw new Error(`${where}: ${k} must be number`);
    return r[k];
  };
  return { origin: r.origin, destination: r.destination, formula,
           rushFee: optNum("rushFee"), minReward: optNum("minReward"),
           maxVol: optNum("maxVol"), maxCollateral: optNum("maxCollateral") };
}

function validateContractMeta(c: any, where: string): ServiceContractMeta | undefined {
  if (c == null) return undefined;
  if (typeof c !== "object")                throw new Error(`${where}: contract must be an object`);
  if (typeof c.expiration !== "string")     throw new Error(`${where}: contract.expiration must be string`);
  if (typeof c.daysToComplete !== "string") throw new Error(`${where}: contract.daysToComplete must be string`);
  if (c.descriptionHint != null && typeof c.descriptionHint !== "string")
    throw new Error(`${where}: contract.descriptionHint must be string when present`);
  if (c.source != null && typeof c.source !== "string")
    throw new Error(`${where}: contract.source must be string when present`);
  return {
    expiration: c.expiration,
    daysToComplete: c.daysToComplete,
    ...(c.descriptionHint != null ? { descriptionHint: c.descriptionHint } : {}),
    ...(c.source != null ? { source: c.source } : {}),
  };
}

// A real YYYY-MM-DD calendar date. The round-trip is load-bearing: V8's ISO
// parser range-checks the month but rolls the day over, so "2026-02-30" parses
// happily as 2026-03-02 and only comparing the formatted result back against
// the input rejects it.
function isCalendarDate(v: unknown): v is string {
  const d = typeof v === "string" ? new Date(`${v}T00:00:00Z`) : new Date(NaN);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function validateService(s: any, where: string): Service {
  if (typeof s.id !== "string")    throw new Error(`${where}: id must be string`);
  if (typeof s.name !== "string")  throw new Error(`${where}: name must be string`);
  if (!Array.isArray(s.routes))    throw new Error(`${where}: routes must be array`);
  if (s.ratesVerified == null)
    throw new Error(`${where}: ratesVerified is required (YYYY-MM-DD, the date these rates were last checked against the shipper's published rate card)`);
  if (!isCalendarDate(s.ratesVerified))
    throw new Error(`${where}: ratesVerified must be a real calendar date as YYYY-MM-DD, got "${s.ratesVerified}"`);
  // ISO dates sort lexicographically, so this compares dates, not instants.
  // UTC on both sides: the build runs in UTC in CI, and a build that resolves
  // the date differently per machine is the bug this issue exists to fix.
  const today = new Date().toISOString().slice(0, 10);
  if (s.ratesVerified > today)
    throw new Error(`${where}: ratesVerified must not be in the future (UTC), got "${s.ratesVerified}"`);
  const optNum = (k: string) => {
    if (s[k] == null) return undefined;
    if (typeof s[k] !== "number") throw new Error(`${where}: ${k} must be number`);
    return s[k];
  };
  return {
    id: s.id, name: s.name, tagline: s.tagline ?? "",
    minReward: optNum("minReward"), maxVol: optNum("maxVol"), maxCollateral: optNum("maxCollateral"),
    routes: s.routes.map((r: any, i: number) => validateRoute(r, `${where}.routes[${i}]`)),
    updated: s.ratesVerified,
    contract: validateContractMeta(s.contract, where),
  };
}
