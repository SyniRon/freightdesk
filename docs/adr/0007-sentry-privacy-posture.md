# ADR 0007: Sentry privacy posture — no PII, no Replay, scrubbed query strings, ancestor-walk masking

**Status:** Accepted (2026-05-17)

## Context

Error tracking is desirable — silent production failures are worse than visible ones, and Sentry is the de facto choice for React SPAs. The official `@sentry/react` skill recommends a default configuration that includes Session Replay, automatic fetch/xhr breadcrumbs, and `sendDefaultPii: true`.

For FreightDesk that default is unacceptable. Hangar contents are OPSEC-sensitive ([ADR 0003](0003-client-side-hangar-parsing.md)) and Sentry's default behaviour leaks them through three separate channels:

1. **Server-side IP and geo derivation.** `sendDefaultPii: false` stops the *client* from attaching IP/headers, but Sentry's *server-side* ingest still derives both IP and geo from the request envelope.
2. **Fetch/xhr breadcrumb URLs.** Auto-instrumented breadcrumbs go through unmodified by default. A request to Fuzzwork with `?types=4312,17959,...` puts type IDs into every error event — those reverse-map to item names via the public SDE.
3. **Session Replay DOM masking.** `maskAllText: true` is one misconfig away from leaking paste content. The bundle cost (~50 KB) plus the implicit attack surface isn't worth it for the marginal debugging value.

## Decision

Error tracking is enabled. Privacy posture is strict and explicit.

**Initialisation (`web/src/instrument.ts` sidecar pattern — runs before any other import resolves):**

- `sendDefaultPii: false`
- `tracePropagationTargets: []` (do not propagate trace headers to Fuzzwork)
- `tracesSampleRate: 0.1`
- Session Replay **deliberately omitted**
- Project-level "Prevent Storing of IP Addresses" toggle enabled in Sentry's Security & Privacy settings (kills `user.ip_address`). Geo at country/state granularity is retained — parity with existing Umami country-level data; acceptable given hangar contents are the privacy-load-bearing thing, not coarse geo.

**Three scrubbing layers in `instrument.ts`:**

1. `beforeBreadcrumb` drops `ui.input` / `ui.click` from any element with `data-sensitive="true"` — or any ancestor (`.closest()` traversal). This is how the paste textarea and the shared `CopyRow` button get masked: one attribute, four copy fields covered.
2. `beforeBreadcrumb` truncates `fetch` / `xhr` breadcrumb URLs at `?` so the Fuzzwork query string can't leak type IDs.
3. `beforeSend` strips query strings from `event.request.url` — the equivalent of layer 2 for the top-level event URL.

**Wrapping:** `Sentry.ErrorBoundary` at the App root with a minimal reload-style fallback. A manual `captureError(msg, err, extra?)` helper at `web/src/lib/sentry.ts` for explicit captures (used in the pricing-fetch catch — captures `server-error` and `network`; skips `rate-limited` (expected upstream state already surfaced via toast) and `AbortError` (cancellation)).

## Consequences

- Production errors are visible in Sentry without exposing hangar contents in breadcrumbs, request URLs, or replays.
- Verification of this posture is **load-bearing, not ceremonial**. Both the geo/IP retention and the fetch-breadcrumb URL leak would have shipped silently without a dev-side privacy test against a real hangar paste. The gate is: local DSN in `.env.local`, paste a real fixture, throw a synthetic error, inspect the event in Sentry for any hangar content. Mandatory before any production DSN goes live.
- Stack traces in production point at minified bundle paths (`/assets/index-*.js:LINE:COL`). Unminified source is on the public GitHub repo so devs can cross-reference. Source-map upload via `@sentry/vite-plugin` is deferred until the first real incident makes it worth the deploy-recipe change.
- This posture is appropriate where user content is operationally sensitive. Applications with looser privacy requirements should adopt individual patterns from this ADR (the ancestor-walk masking, the fetch-breadcrumb URL scrub) selectively rather than the whole bundle.
- DevTools console `throw` does **not** trip Sentry's auto-handler (inspector-routed, bypasses `window.onerror`). For verification, use `setTimeout(() => { throw ... }, 0)` so the error bubbles through the event loop.
