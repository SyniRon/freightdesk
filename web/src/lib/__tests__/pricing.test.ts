import { describe, expect, it, vi, beforeEach } from "vitest";
import { __resetPricingCacheForTesting, fetchPrices, priceFor, PricingError } from "../pricing";

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
    expect(priceFor(p, "sell 5%")).toBe(2.80);
    expect(priceFor(p, "sell median")).toBe(4.50);
    expect(priceFor(p, "buy 95%")).toBe(3.94);
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
