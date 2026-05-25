// Umami analytics helper.
// `track()` is a no-op if Umami didn't load (dev / no VITE_UMAMI_WEBSITE_ID).
// Volume bucketing keeps hangar OPSEC sensitive shapes off the wire — only
// buckets travel, never raw values.

type PageviewProps = {
  website?: string;
  hostname?: string;
  language?: string;
  referrer?: string;
  screen?: string;
  title?: string;
  url?: string;
};

declare global {
  interface Window {
    umami?: {
      track: {
        (name: string, props?: Record<string, unknown>): void;
        (propsFn: (defaults: PageviewProps) => PageviewProps): void;
      };
    };
  }
}

export function track(name: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.umami?.track(name, props);
}

// Records a virtual pageview by overriding `url` (and optionally `title`) on
// Umami's default pageview shape. Used for SPA route changes so engaged
// multi-route sessions don't register as 1-pageview bounces.
export function trackPageview(url: string, title?: string): void {
  if (typeof window === "undefined") return;
  window.umami?.track((props) => ({ ...props, url, ...(title ? { title } : {}) }));
}

/** Bucket a volume (m³) into a coarse label. Privacy: never log raw m³. */
export function volumeBucket(v: number): string {
  if (!v || v <= 0) return "empty";
  if (v < 1_000) return "<1k";
  if (v < 10_000) return "1k-10k";
  if (v < 50_000) return "10k-50k";
  if (v < 100_000) return "50k-100k";
  if (v < 360_000) return "100k-360k";
  return "over-cap";
}

/** Bucket a value (ISK) into a coarse label. */
export function valueBucket(v: number): string {
  if (!v || v <= 0) return "0";
  if (v < 100_000_000) return "<100M";
  if (v < 1_000_000_000) return "100M-1B";
  if (v < 10_000_000_000) return "1B-10B";
  return "10B+";
}
