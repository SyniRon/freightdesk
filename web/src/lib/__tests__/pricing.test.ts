import { describe, expect, it, vi, beforeEach } from "vitest";
import { __resetPricingCacheForTesting, fetchPrices, priceFor, PricingError } from "../pricing";
import { applyFormula } from "../logic";

// ITL's full-load formula (issue #13): a per-m³ volume reward clamped between a
// floor and a per-route `fullLoad` ceiling, optionally max()'d against a
// collateral-percent component on the outbound leg.
describe("applyFormula: clamped-rate (full-load ceiling)", () => {
  // ITL outbound: max(collateral×0.5%, clamp(vol×900, 5M, 315M))
  const outbound = {
    kind: "clamped-rate" as const,
    ratePerM3: 900,
    floor: 5_000_000,
    fullLoad: 315_000_000,
    collateralPct: 0.005,
  };
  // ITL inbound: clamp(vol×900, 5M, 315M) — no collateral component
  const inbound = {
    kind: "clamped-rate" as const,
    ratePerM3: 900,
    floor: 5_000_000,
    fullLoad: 315_000_000,
  };

  it("below floor → minReward floor wins", () => {
    // 10 m³ × 900 = 9,000 < 5M floor
    expect(applyFormula(inbound, 10, 0)).toBe(5_000_000);
  });

  it("mid-range → vol × 900", () => {
    // 100,000 m³ × 900 = 90M, within [5M, 315M]
    expect(applyFormula(inbound, 100_000, 0)).toBe(90_000_000);
  });

  it("above ceiling → fullLoad ceiling (315M)", () => {
    // 400,000 m³ × 900 = 360M > 315M ceiling
    expect(applyFormula(inbound, 400_000, 0)).toBe(315_000_000);
  });

  it("outbound: collateral floor wins when collateral×0.5% beats clamped reward", () => {
    // 100,000 m³ × 900 = 90M clamped; collateral 50B × 0.5% = 250M > 90M
    expect(applyFormula(outbound, 100_000, 50_000_000_000)).toBe(250_000_000);
  });

  it("outbound: clamped reward wins when it beats collateral component", () => {
    // 100,000 m³ × 900 = 90M; collateral 1B × 0.5% = 5M < 90M
    expect(applyFormula(outbound, 100_000, 1_000_000_000)).toBe(90_000_000);
  });

  it("outbound: ceiling still caps the volume side before the collateral max", () => {
    // vol side capped at 315M; collateral 1B × 0.5% = 5M → 315M wins
    expect(applyFormula(outbound, 400_000, 1_000_000_000)).toBe(315_000_000);
  });

  it("honors the ratePerM3 override on the clamped volume leg", () => {
    // override rate 1000: 100,000 × 1000 = 100M, within clamp
    expect(applyFormula(inbound, 100_000, 0, 1000)).toBe(100_000_000);
  });
});

const FX = {
  "34": {
    buy:  { percentile: "3.94", median: "3.25", weightedAverage: "2.38", max: "4.0", min: "0.3", stddev: "1.1", volume: "1", orderCount: "1" },
    sell: { percentile: "2.80", median: "4.50", weightedAverage: "3.89", max: "55000", min: "2.8", stddev: "1", volume: "1", orderCount: "1" },
  },
};

describe("fetchPrices", () => {
  beforeEach(() => __resetPricingCacheForTesting());

  it("hits Fuzzwork and returns parsed prices", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => FX });
    vi.stubGlobal("fetch", fetchMock);

    const m = await fetchPrices([34]);
    expect(m.get(34)?.sell.percentile).toBeCloseTo(2.8);
    expect(m.get(34)?.buy.percentile).toBeCloseTo(3.94);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("caches and doesn't refetch within TTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => FX });
    vi.stubGlobal("fetch", fetchMock);
    await fetchPrices([34]);
    await fetchPrices([34]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("chunks at 200 IDs per request", async () => {
    const big: Record<string, any> = {};
    for (let i = 1; i <= 401; i++) big[String(i)] = FX["34"];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => big });
    vi.stubGlobal("fetch", fetchMock);
    await fetchPrices(Array.from({ length: 401 }, (_, i) => i + 1));
    expect(fetchMock).toHaveBeenCalledTimes(3); // 200 + 200 + 1
  });
});

describe("priceFor", () => {
  const p = {
    buy: { percentile: 3.94, median: 3.25 },
    sell: { percentile: 2.80, median: 4.50 },
    at: 0,
  };
  it("maps source → field", () => {
    expect(priceFor(p, "buy")).toBe(3.94);
    expect(priceFor(p, "sell")).toBe(2.80);
    expect(priceFor(p, "split")).toBeCloseTo((3.94 + 2.80) / 2);
  });
});

describe("fetchPrices error handling", () => {
  beforeEach(() => __resetPricingCacheForTesting());

  it("throws PricingError(rate-limited) when 429 persists past retries", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal("fetch", fetchMock);

    const p = fetchPrices([34]);
    // Attach rejection handler immediately so the promise is not "unhandled"
    const settled = p.catch((e) => e);
    // Advance through all backoff delays
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);
    const err = await settled;
    expect(err).toBeInstanceOf(PricingError);
    expect((err as PricingError).kind).toBe("rate-limited");
    expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
    vi.useRealTimers();
  });

  it("recovers when 429 clears on retry", async () => {
    vi.useFakeTimers();
    const fxResp = { ok: true, json: async () => FX };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(fxResp);
    vi.stubGlobal("fetch", fetchMock);

    const p = fetchPrices([34]);
    await vi.advanceTimersByTimeAsync(2000);
    const m = await p;
    expect(m.get(34)?.sell.percentile).toBeCloseTo(2.8);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throws PricingError(server-error) on 503 (no retry)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchPrices([34])).rejects.toMatchObject({
      kind: "server-error",
      status: 503,
    });
  });

  it("throws PricingError(network) on fetch rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchPrices([34])).rejects.toMatchObject({ kind: "network" });
  });
});
