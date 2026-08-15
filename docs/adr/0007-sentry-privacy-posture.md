# ADR 0007: Sentry privacy posture — no PII, no Replay, scrubbed query strings, ancestor-walk masking

**Status:** Accepted (2026-05-17). Amended 2026-08-14 — see *Amendment: credentials in URLs*.

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
- Stack traces in production de-minify to real `*.tsx:line` via source-map upload through `@sentry/vite-plugin` (see [ADR 0014](0014-sentry-source-maps-and-release-commits.md)). Maps are uploaded then deleted at build time — never served publicly. (Originally deferred; implemented once errors needed to be actionable.)
- This posture is appropriate where user content is operationally sensitive. Applications with looser privacy requirements should adopt individual patterns from this ADR (the ancestor-walk masking, the fetch-breadcrumb URL scrub) selectively rather than the whole bundle.
- DevTools console `throw` does **not** trip Sentry's auto-handler (inspector-routed, bypasses `window.onerror`). For verification, use `setTimeout(() => { throw ... }, 0)` so the error bubbles through the event loop.

## Amendment (2026-08-14): credentials in URLs

The three channels above all concern one subject — hangar contents. Additive character sign-in
([ADR 0016](0016-additive-character-sign-in-for-accessible-structures.md)) introduces a second
subject with different mechanics: **short-lived credentials that arrive in a URL**, and **character
identity that arrives in a request path**. The posture above does not cover either, in three specific
places.

1. **Navigation breadcrumbs are unscrubbed.** Layer 1 covers `ui.*` and layer 2 covers `fetch` /
   `xhr`; `navigation` breadcrumbs pass through with both URLs intact. An OAuth callback carrying
   `?code=` lands in one.
2. **Query-stripping does not reach identity in a path.** Layer 2 truncates at `?`, which is the right
   shape for Fuzzwork but not for ESI, where the character id sits in the path itself.
3. **Analytics is outside all three layers.** The tracker is loaded from the HTML entry point and
   auto-records a pageview before any application module resolves, so a callback URL would be written
   to the analytics store, and no application-side cleanup can outrun it.

**Decision.** The auth code is contained by construction rather than scrubbed after the fact:

- Sign-in redirects to a **dedicated callback route**, and the analytics tracker is **not loaded on
  that route** — gated in the HTML entry point, the only place early enough to matter. The callback is
  transient and has no analytics value, so suppressing it costs nothing.
- The code is removed from the address bar as soon as it is consumed, so no later capture can observe
  it.
- **A fourth scrubbing layer** treats `navigation` breadcrumbs the way layer 2 treats `fetch` / `xhr`.
- ESI breadcrumb URLs are rewritten to a **route template**, so the endpoint and status survive for
  debugging while the character id does not. Dropping these breadcrumbs entirely was rejected: this is
  the integration most likely to break, and shape-without-identity keeps it diagnosable.
- **Sentry is never told who the character is.** No `setUser`, no character name or id in context or
  tags. Signed-in and signed-out events are indistinguishable.
- `tracePropagationTargets: []` is retained and is now load-bearing for a second host — trace headers
  must not reach CCP's API any more than they reach Fuzzwork's.

PKCE makes an intercepted code useless without the verifier. That is real mitigation and it is not a
reason to skip any of the above; a credential in a log is a defect whether or not it is redeemable.

**The gate extends.** The verification described under *Consequences* is no longer complete with a
hangar paste alone. It now also requires a full sign-in round trip, after which the auth code must
appear in neither Sentry events nor the analytics store, and no event may carry a character id. Like
the original gate, this is load-bearing: two of the three gaps above would have shipped silently.
