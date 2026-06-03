# ADR 0006: Self-hosted Umami analytics, reverse-proxied same-origin

**Status:** Accepted (2026-05-14)

## Context

The product needs to know whether anyone is using it, which routes are popular, and — most importantly — whether visitors are actually clicking the contract-value copy buttons (the conversion event). The shape of that need argues for analytics; the shape of the *audience* argues against most analytics.

EVE players are a privacy-conscious audience. Third-party trackers (GA4, Plausible Cloud, Segment, etc.) are a tell that the operator is monetising user data — broadcast-friendly for the gaming-tools subculture this product distributes through. A self-hosted analytics container avoids that signal and keeps the data physically on infrastructure the operator controls.

Additionally, when the analytics endpoint is on a third-party domain (`umami.example.com/script.js`), ad-blockers and privacy extensions block it by default — which would systematically under-count exactly the privacy-conscious audience FreightDesk attracts.

## Decision

Self-host Umami in the same compose stack as the app. Two containers (Umami + its Postgres) sit alongside the app container.

The Umami tracking script is **reverse-proxied through Caddy** at the app's own origin — visitor browsers fetch the script and POST events to the same hostname as the page, not a third-party analytics domain. The Caddy config rewrites a path prefix on the public origin to the Umami container internally.

The Umami admin UI is bound to a private network interface (loopback / VPN / tailnet) — *never* publicly exposed. The tracking endpoint is the only thing exposed via the public origin.

The website UUID is baked into the bundle at build time via `VITE_UMAMI_WEBSITE_ID`. Treated as non-secret (it's a public identifier sent on every page load) but not committed to the tracked repo — set at deploy time.

Conversion event: **`copy` with the field name** (Shipper / Destination / Reward / Collateral). Supporting events: `paste-parsed` (with volume bucket, never item names), `route-changed`, `service-selected`, `tip-copy`.

## Consequences

- No third-party trackers, no PII (see [ADR 0007](0007-sentry-privacy-posture.md) for the parallel decision in error tracking).
- Ad-blocker coverage is dramatically lower because the tracking endpoint is same-origin. Closer-to-real visitor counts than a cloud-hosted tracker would yield for this audience.
- The operator owns the analytics database. The trade-off is operational: another container to keep up, another Postgres to back up.
- A separate maintenance gotcha exists around SPA route changes not being captured as pageviews — tracked as a separate open issue. The shape of the gotcha is downstream of this ADR, not a reason to revisit it.

## Own-traffic filtering

Sessions reaching the app off the public origin (operator/dev access over non-public hostnames) were registering in the rollups and skewing low-volume counts. Stock Umami does **not** drop events by the website's configured domain — that field is metadata only; the server ingests every hostname. The native filter lives in the tracker, not the server.

We gate with the tracker's **`data-domains` allowlist**: the script refuses to send events unless `window.location.hostname` is in the list. The allowlist is supplied at build time via `VITE_UMAMI_DOMAINS` (same pattern as the website ID — operator config, not committed). When unset, the tracker counts all hostnames (the prior behaviour), so a fork without the var is unaffected. A production deploy must set it, or own-traffic creeps back in.

Chosen over a reverse-proxy strip (would need a Caddy content-rewrite to edit the inline loader — disproportionate) and a hand-rolled hostname check (reinvents what the tracker already does). Backfilling the handful of already-counted own-traffic rows is out of scope.
