// Fuzzwork aggregates client. CORS verified — direct from browser.
// Caches by typeID with 5min TTL matching Fuzzwork's Cache-Control header.

export type PriceSource = "buy" | "split" | "sell";

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

export class PricingError extends Error {
  constructor(public readonly kind: "rate-limited" | "server-error" | "network", public readonly status?: number) {
    super(kind === "rate-limited" ? "Fuzzwork rate-limited (429)" :
          kind === "server-error" ? `Fuzzwork server error (${status})` :
          "Fuzzwork unreachable");
    this.name = "PricingError";
  }
}

// Retry helper — fetch with exponential backoff on 429 only.
// Delays: 2s, 4s, 8s. Gives up after 3 retries.
async function fetchWithBackoff(url: string, signal?: AbortSignal): Promise<Response> {
  const RETRY_DELAYS = [2000, 4000, 8000];
  let attempt = 0;
  while (true) {
    let r: Response;
    try {
      r = await fetch(url, { signal });
    } catch (e) {
      // Network failure (DNS, refused, timeout, aborted)
      if ((e as { name?: string }).name === "AbortError") throw e;
      throw new PricingError("network");
    }
    if (r.ok) return r;
    if (r.status === 429 && attempt < RETRY_DELAYS.length) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, RETRY_DELAYS[attempt]);
        signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); });
      });
      attempt++;
      continue;
    }
    if (r.status === 429) throw new PricingError("rate-limited", 429);
    if (r.status >= 500) throw new PricingError("server-error", r.status);
    throw new PricingError("server-error", r.status);
  }
}

export async function fetchPrices(typeIds: number[], signal?: AbortSignal): Promise<Map<number, CachedPrice>> {
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
    const r = await fetchWithBackoff(url, signal);
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
    case "buy":   return p.buy.percentile;                               // top 5% buy — conservative
    case "sell":  return p.sell.percentile;                              // lowest 5% sell — optimistic
    case "split": return (p.buy.percentile + p.sell.percentile) / 2;    // true buy/sell midpoint
  }
}

// Test-only
export function __resetPricingCacheForTesting() {
  cache.clear();
}
