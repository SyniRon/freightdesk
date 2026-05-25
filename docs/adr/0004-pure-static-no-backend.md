# ADR 0004: Pure-static frontend; no Go backend, no SDE bootstrap at boot

**Status:** Accepted (2026-05-14)

## Context

An initial scaffolding plan proposed a Go 1.26 + Chi server with the SPA embedded via `go:embed all:frontend`, the SDE auto-bootstrapped on first boot, and Fuzzwork pricing fetched server-side behind an in-memory cache. That architecture is well-suited to EVE tools that require OAuth, character-scoped ESI calls, or admin-tokened structure-market endpoints — none of which apply to FreightDesk ([ADR 0002](0002-no-eve-sso-localstorage-only.md), [ADR 0003](0003-client-side-hangar-parsing.md)).

The cost of inheriting the backend anyway: a Go service to monitor, a longer container boot, the SDE-download-and-extract cold start on first run, a token bucket for the Fuzzwork proxy, and a deploy story with a runtime dependency on the SDE-cache mount. All for a product whose actual server-side compute requirement is *zero*.

## Decision

FreightDesk ships as a pure-static SPA served by Caddy. No Go backend exists in the repo and none is scaffolded.

- The item database is built **at image-build time** by `scripts/build-sde.ts`: download CCP SDE → ESI-enrich the four broken-volume categories (see *ESI enrichment categories* in `CONTEXT.md`) → emit `web/public/items.json`. The result is a static asset shipped with the bundle.
- The service config is similarly precomputed at build time by `scripts/build-services.ts` (see [ADR 0005](0005-yaml-service-config-build-time-codegen.md)).
- Fuzzwork pricing is fetched browser-direct. CORS is verified (`Access-Control-Allow-Origin: *`). A 5-minute in-memory cache lives in the browser tab.
- Deployment is a multi-stage Dockerfile: Node builder runs the SDE+ESI pipeline, output is copied into a Caddy stage that serves the dist directory on port `:8080`. The image bakes in everything; runtime mounts are unnecessary.

## Consequences

- The image build is slow on the first run (the SDE+ESI pipeline takes ~5 min). Cached after that. CI runs this gauntlet on every PR via the baseline workflow.
- Container boot is fast and stateless. Restart, redeploy, and image rebuild are all idempotent.
- No server-side rate-limit on price fetches — each visitor's browser hits Fuzzwork directly. If Fuzzwork ever rate-limits aggressively, a server-side proxy with a shared cache becomes necessary; that's the trigger to revisit this ADR.
- No analytics endpoint owned by the app. Umami is a separate container in the same compose stack (see [ADR 0006](0006-self-hosted-umami-same-origin.md)).
- Scaffolding a Go (or any) backend later remains an option — add `cmd/server/main.go` with `go:embed all:frontend` when a server-side need genuinely lands. Until then, the simplest possible thing.
