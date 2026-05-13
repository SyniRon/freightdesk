// Fuzzwork aggregates client. CORS verified — direct from browser.
// Caches by typeID with 5min TTL matching Fuzzwork's Cache-Control header.

export type PriceSource = "sell 5%" | "sell median" | "buy 95%";

const JITA_REGION_ID = 10000002;
const TTL_MS = 5 * 60 * 1000;
const CHUNK_SIZE = 200;

interface CachedPrice {
  buy: { percentile: number; median: number };
  sell: { percentile: number; median: number };
  at: number;
}

const cache = new Map<number, CachedPrice>();

interface FuzzworkAgg {
  buy: { percentile: string; median: string };
  sell: { percentile: string; median: string };
}

export async function fetchPrices(typeIds: number[]): Promise<Map<number, CachedPrice>> {
  const now = Date.now();
  const stale = typeIds.filter((id) => {
    const c = cache.get(id);
    return !c || now - c.at > TTL_MS;
  });
  // Dedupe and chunk
  const unique = Array.from(new Set(stale));
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const url = `https://market.fuzzwork.co.uk/aggregates/?region=${JITA_REGION_ID}&types=${chunk.join(",")}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fuzzwork ${r.status}`);
    const data = (await r.json()) as Record<string, FuzzworkAgg>;
    for (const [idStr, agg] of Object.entries(data)) {
      const id = Number(idStr);
      cache.set(id, {
        buy: { percentile: Number(agg.buy.percentile), median: Number(agg.buy.median) },
        sell: { percentile: Number(agg.sell.percentile), median: Number(agg.sell.median) },
        at: now,
      });
    }
  }
  // Return only the requested ids that are now in cache.
  const out = new Map<number, CachedPrice>();
  for (const id of typeIds) {
    const c = cache.get(id);
    if (c) out.set(id, c);
  }
  return out;
}

export function priceFor(p: CachedPrice, source: PriceSource): number {
  switch (source) {
    case "sell 5%":     return p.sell.percentile;   // lowest 5% sell — optimistic
    case "sell median": return p.sell.median;
    case "buy 95%":     return p.buy.percentile;    // top 5% buy — conservative
  }
}

// Test-only
export function __resetPricingCacheForTesting() {
  cache.clear();
}
