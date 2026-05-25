# FreightDesk

> **Status:** MVP shipped 2026-05-16. Live at <https://freightdesk.syniron.com>.

Third-party web tool for EVE Online haulers using contracted shipping services. The user pastes an in-game hangar; FreightDesk parses it client-side, computes total volume, suggests collateral (Jita value), and produces click-to-copy buttons matching the exact strings EVE's in-game Create Contract window expects (Shipper / Destination / Reward / Collateral).

The product is the friction kill. Every existing shipping calculator (Red Frog, PushX, alliance shippers) makes the user type volume manually. Eliminating that step is the entire reason this exists.

**Audience:** EVE haulers using contracted hauling. Major segments are alliance-internal traffic (alliance shippers) and nullsec ↔ Jita traffic (Red Frog, PushX, Goon alliance shippers).

## MVP — shipped 2026-05-16

- Live at <https://freightdesk.syniron.com>.
- Paste hangar → compute volume → suggest collateral → four click-to-copy contract values.
- **One alliance shipper** (ADFU Kum N Go Transport Group), **one staging structure** (C-J6MT 1st Taj Mahgoon ↔ Jita 4-4), no auth.

## v1

- Additional shippers: Red Frog Freight, PushX Industries, a Goon alliance shipper. Schema already supports it — adding shipper #2 means dropping a YAML in `web/services/` and redeploying.
- More routes per shipper.
- Per-service constraint model: origin/destination allowlist, volume cap, collateral cap, max-jumps cap, optional ship-type restrictions. Ineligible services drop out of the picker.
- Git-driven rate config with `rates last updated YYYY-MM-DD` surfaced prominently in the UI.
- Real analytics dashboards on the conversion event (contract-value copy click).

## Out of scope

The following are explicit non-goals.

- **EVE SSO / character login.** Drops the entire auth surface. Revisited only if alliance-structure mapping requires per-character scoping.
- **Paid tiers / premium features / affiliate angles.** EVE dev agreement bans paid tools. Donation only.
- **Mobile-first UX.** EVE lives on desktop; hangar paste is a computer workflow. Mobile-graceful is fine, mobile-first is wrong.
- **Server-side persistence of user data.** Per-visitor settings live in `localStorage`. The server never sees the item list — hangar contents are OPSEC-sensitive and parsing is client-side.
- **Server-rendered backend.** Pure-static is enough for the current scope.
- **Multi-leg routes.** Many shippers don't do nullsec → Jita directly; the user contracts to hisec staging, then uses a second service for the nullsec leg. Out of scope; could revisit if demand surfaces.

## Deferred limitations (v2 candidates)

Acknowledged gaps in the shipped MVP. Tracked as open issues but not committed to a timeline.

- **Structure mapping for contract destinations.** Contracts need exact Upwell structure listing strings, not system names. ESI has no public endpoint listing all player structures; querying specific structures needs a docking-scoped token per structure. Three options on the table: (A) hand-curated NPC stations + major public Upwell; (B) admin-token enumeration of alliance structures, with OPSEC tension; (C) alliance-only feature gated by character login, which reintroduces the auth surface. **The MVP hardcodes** C-J6MT staging + Jita 4-4. The real decision is deferred to v2.
- **Real ESI search for the location combobox.** Currently filters a hand-curated preset list. Custom-typed locations flow through but services correctly mark them ineligible.
- **Auto-split-contracts logic for over-cap shipments.** Currently surfaces "exceeds cap — split into multiple contracts" as a warning. Could compute the optimal split automatically.
- **Direct overrides for collateral / volume / shipping rate.** Settings currently exposes only collateral %.

## Stack

- **Frontend:** Vite + React + TypeScript, pnpm. Single-file CSS (`web/src/styles.css`, ~1030 lines) — no shadcn/ui, no CSS framework.
- **Item database:** built from CCP's official SDE at image-build time via `scripts/build-sde.ts`, with ESI enrichment for the four categories whose `packagedVolume` is unreliable (modules, drones, subsystems, fighters) plus ships. Output is `web/public/items.json` (~25k items).
- **Service config:** `web/services/*.yaml` → `scripts/build-services.ts` → typed `web/src/lib/services.generated.ts`. The `updated` field is auto-derived from `git log -1 --format=%cs` per file.
- **Pricing:** Fuzzwork aggregates, browser-direct (CORS-verified `*`), 200-id chunking, 5-minute in-memory cache. Used only for collateral suggestion, not core volume math.
- **Per-visitor settings:** `localStorage` (`eveship.*` keys). Includes a migration shim for older shapes.
- **Serving:** Caddy static, multi-stage Dockerfile (Node build → Caddy serve on `:8080`).
- **Hosting:** Cloudflare Tunnel (no public host ports), with a self-hosted Umami + Postgres analytics sidecar in the same compose stack. The Umami tracking script is reverse-proxied through Caddy so visitor browsers hit it on the app's own origin.
- **Error tracking:** Sentry (`@sentry/react`) with a strict privacy posture — see [ADR 0007](docs/adr/0007-sentry-privacy-posture.md).
- **Dependency hygiene:** Dependabot weekly with a 7-day cooldown.
- **Tests:** Vitest unit (60 tests covering parser, eligibility, pricing, formatters, storage), Playwright e2e (3 tests against the prod build), CI runs both on every PR.

For *why* each of these is the way it is, see `docs/adr/`.

## Done — definition

**MVP done (achieved 2026-05-16):** Live. Paste hangar → compute volume → click-to-copy contract values for one alliance shipper on one route pair. No auth.

**v1 done (not yet):** Three+ shippers including at least one public service (Red Frog or PushX), per-service constraint model fully populated, git-driven rate config with prominent `rates last updated` UI affordance, conversion-event dashboards live. Structure mapping beyond hardcoded staging + Jita remains deferred.

## Domain language

For terminology — Service / Route / RouteFormula / rush fee / minReward / Upwell structure / SDE / ESI / Fuzzwork / contract-value copy click — see `CONTEXT.md`.
