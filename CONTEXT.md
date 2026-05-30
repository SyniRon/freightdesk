# CONTEXT — domain language

Definitions for the vocabulary FreightDesk uses. Not scope (see `PROJECT.md`), not decisions (see `docs/adr/`).

## EVE Online vocabulary

- **Capsuleer.** A player character in EVE Online. The product audience.
- **Hangar.** The player-facing inventory listing inside a station or structure. In-game, a hangar can be pasted as text and EVE produces a tab-separated list. Display column count varies by client settings — see *paste shapes* below.
- **Courier contract.** An in-game contract where one player pays another to move items between two locations. The Create Contract window in EVE is the UI for setting one up — the four fields FreightDesk's copy buttons populate are Shipper / Destination / Reward / Collateral, in that visual order. The item set is chosen in-game, not pasted: either by selecting items in the hangar and right-click → Create Contract, or by starting a contract and ticking items from the in-window list. There is no paste target for the item manifest — which is why FreightDesk can advise *how to split* an over-cap load but cannot hand the user a per-contract item list to paste anywhere.
- **Upwell structure.** A player-built citadel, engineering complex, refinery, etc. Each has a unique listing string that the contract destination field requires verbatim (system name alone is not enough). Contrast with NPC stations, whose listing strings are stable and publicly known.
- **Jita.** The high-security trade hub in The Forge region. Jita IV - Moon 4 - Caldari Navy Assembly Plant (commonly "Jita 4-4") is the dominant market station.
- **Security status.** EVE's per-system safety rating (1.0 → -1.0). FreightDesk's `SecBadge` colours it green / amber / red. Load-bearing for shipper service eligibility — some shippers refuse to enter low-sec or null-sec.
- **SDE (Static Data Export).** CCP's official dump of game data — type IDs, names, volumes, market groups, etc. Released as a JSONL ZIP. FreightDesk consumes the SDE at image-build time, not at runtime. The ZIP also carries *universe* data: `mapSolarSystems.jsonl` (every solar system, self-describing — name + `securityStatus`) and `npcStations.jsonl` (every NPC station, but **id-only — no rendered name**; the listing string is reconstructed from system + celestial + operation/owner, or resolved via ESI).
- **ESI (EVE Swagger Interface).** CCP's public REST API. Used at build time to enrich the SDE — `packagedVolume` is missing or wrong for some categories, so ESI fills in those gaps.
- **ESI enrichment categories.** The categories where SDE-derived `packagedVolume` is unreliable and must be fetched from ESI: ships (6), modules (7), drones (18), subsystems (32), fighters (87). A known SDE gotcha.
- **Fuzzwork.** A third-party EVE pricing aggregator (<https://market.fuzzwork.co.uk>). Returns Jita region market aggregates (sell percentile, buy percentile, median, etc.). Browser-direct fetch is CORS-allowed (`*`). The only external runtime dependency.

## Product types

- **Service.** A shipping operator (e.g., ADFU Kum N Go Transport Group). One YAML file per service in `web/services/`. Has a service-level `minReward`, `maxVol`, optional `maxCollateral`, a `contract` metadata block, and one or more `ServiceRoute`s.
- **ServiceRoute.** A directed origin → destination pair owned by a Service. Carries a `RouteFormula` and an optional `rushFee`.
- **RouteFormula.** A discriminated union describing how to compute the reward for a given route. Four kinds:
  - **`sum`** — `vol × ratePerM3 + collateral × collateralPct`
  - **`max`** — `max(vol × ratePerM3, collateral × collateralPct)`
  - **`rate-only`** — `vol × ratePerM3` (collateral ignored)
  - **`flat`** — fixed ISK regardless of volume or collateral
- **`rushFee`.** Optional per-route addend toggled by a UI switch. ADFU is currently 250 M ISK per rush contract on each route.
- **`minReward`.** Service-level floor. If the computed reward is below `minReward`, the user pays the floor — and FreightDesk surfaces an amber info banner that shows both numbers explicitly so the gap isn't hidden. Guard: `minReward > 0 && formulaResult < minReward`.
- **`maxVol` / `maxCollateral`.** Service-level caps. A load exceeding a cap is not unserviceable — the service will still take it as multiple contracts. This is the **splittable** state (see *Eligibility*), not an error.
- **Eligibility.** A tri-state for a service against a given paste + origin/destination pair:
  - **eligible** — a route matches and the load is within all caps. One contract.
  - **splittable** — a route matches but the load exceeds `maxVol` and/or `maxCollateral`. The service will take it as `N = max(ceil(vol/maxVol), ceil(collateral/maxCollateral))` contracts. Rendered as a visible card carrying an *advisory* (N + optimized total cost + approximate per-contract targets), never copy buttons — EVE has no paste target for a per-contract item manifest, so the user splits by hand and FreightDesk can only advise. Even division is the advised split: for the only formula where distribution affects cost (`max`), an even split is the cost-optimal balance.
  - **ineligible** — no route matches (or no per-contract piece can ever fit, e.g. a single item above a collateral cap). Stays visible as a **dimmed (`is-blocked`), non-clickable card with its reason shown** — the service is seen to have considered the route and declined, rather than silently vanishing. When *no* service is eligible at all, the picker collapses to a dedicated empty state that still surfaces the reasons ("No service covers this route yet", "Cargo too large for any service", etc.).
  - Splitting is never cheaper than a hypothetical single contract — `max` is super-additive, and each extra contract adds its own `rushFee` and can hit `minReward`. Splitting is a cost forced by a cap, not an optimization.
- **`Service.contract` metadata.** Per-service block holding `expiration`, `daysToComplete`, and `descriptionHint`. Rendered as an info panel beneath the copy grid because those EVE fields are UI dropdowns the user has to set manually — they aren't paste targets.

## Copy block

- **Copy-block field order.** Shipper / Destination / Reward / Collateral — top-down matching the in-game Create Contract window, validated against the live game UI on 2026-05-16.
- **`Math.ceil` for reward / collateral.** Shippers round UP. Specifically, kumgo.space (ADFU's public calculator) uses `Math.ceil` on collateral-percent reward, and earlier `Math.round` produced a 1-ISK gap that broke parity. Round-up also favours the shipper (the contract never under-bids the floor).
- **`data-sensitive="true"`.** Attribute applied to the paste textarea and the shared `CopyRow` button. Sentry's `beforeBreadcrumb` walks `.closest('[data-sensitive=true]')` and drops any breadcrumb originating from a sensitive ancestor — this is how hangar contents are kept out of error reports.

## Paste shapes

The same EVE hangar pastes differently depending on the client's display mode. The parser must handle all three. Test fixtures live in `web/test/fixtures/hangar-pastes/`:

- **`hangar-simple.txt`** — 2-column "name<TAB>qty" pastes.
- **`hangar-detailed.txt`** — 6-column pastes including type, group, volume etc.
- **`contract-window.txt`** — 3-column pastes with a trailing tab, copied from inside the Create Contract dialog.

All three flow through the same `parseHangarPaste` by splitting on `\t` and taking `[name, qty]`. Real pastes carry trailing tabs and comma-thousands quirks that hand-crafted unit tests miss — the fixtures are load-bearing for correctness.

## Conversion event

- **Contract-value copy click.** The metric that matters. Pasting a hangar is engagement; copying a contract value is conversion. Pinned as the primary event in self-hosted Umami. Other instrumented events (paste-parsed with volume bucket, route changed, service selected, tip copied) are supporting signals. No PII, no item content — only metadata.

## Locations

- **Location data sources.** Three tiers, by how the listing data is obtained:
  - **Solar systems** — fully described by the SDE (`mapSolarSystems.jsonl`): name + security status, ~8.5k systems. Available offline at build time.
  - **NPC stations** — enumerated by the SDE (`npcStations.jsonl`, ~5.2k) but **without rendered names**; the contract-grade listing string ("Jita IV - Moon 4 - Caldari Navy Assembly Plant") must be reconstructed or resolved from ESI. Stable and publicly known once resolved.
  - **Upwell structures** — player-built, **not in the SDE at all**; querying one needs a docking-scoped token per structure. Cannot be enumerated from public data. This is the boundary that makes full-universe structure search a deferred v2 problem (structure-mapping decision), not a build-time extraction.
- **Dockable / contract endpoint.** A courier contract's origin and destination are always *dockables* — a specific NPC station or Upwell structure — never a bare solar system or region. The Destination copy field is pasted verbatim, so it must be the exact dockable listing string. Services contract to specific dockables (ADFU ships to Jita 4-4, not "any station in Jita" or "any system in The Forge"); offering systems or regions as endpoints would misrepresent what a shipper actually serves. Therefore **only dockables are selectable** in the location picker. Solar systems are *not* selectable endpoints — they serve two internal roles only: carrying security status (`SecBadge`) for their dockables, and scaffolding search (typing a system name surfaces that system's dockables). Where a service's *coverage* is broad (e.g. accepts pickup from any dockable in a region), that breadth is a property of service eligibility matching the picked dockable's system/region — never of the endpoint itself, which stays a specific dockable.
- **Preset list.** `LOCATIONS` in `web/src/lib/logic.ts` is hand-curated. Each entry has a system name, security status, and an optional Upwell structure listing string.
- **Custom location.** A user-asserted destination typed free-form, flowing through as `{custom: true}`. *Not* an error or a degraded fallback — it is a deliberate, retained path serving a union of roles: the route-input half of manual rate overrides (a user names a destination the catalog doesn't cover, then sets their own rate); the catch-all for Upwell structures the catalog can't resolve; and plain unrecognized text. Because no catalog rate exists for it, services mark it ineligible *for catalog pricing* — but the honest signal is "no catalog rate for this route," not "invalid location." Messaging must stay neutral so it never forecloses the manual-override path.
- **C-J6MT (system) → 1st Taj Mahgoon (structure).** ADFU's alliance staging. The system name is C-J6MT, not C-JM6T (easy to fat-finger). The full structure listing string is what the contract Destination field expects.
- **Jita 4-4.** Shorthand for Jita IV - Moon 4 - Caldari Navy Assembly Plant.

## Generated files

- **`web/public/items.json`.** ~25k items, ~25 MB. Built from CCP SDE + ESI enrichment by `scripts/build-sde.ts`. Loaded at runtime by `web/src/lib/items.ts`. Gitignored — regenerated on every container image build (~5 min first time, then cached).
- **`web/src/lib/services.generated.ts`.** Typed service config emitted from the YAMLs in `web/services/` by `scripts/build-services.ts`. Includes the `updated` date derived from `git log -1 --format=%cs`. Gitignored.

## Banner severity

- **`.copy-critical-warn`** (red, `--bad`) — data-accuracy errors (over-cap, no price data, unparseable item).
- **`.copy-info-warn`** (amber, `--warn`) — situations the user should know about but aren't errors (minReward floor active, stale rates >30 days, custom-typed location ineligible).

Same DOM structure, different colour token. If a third severity appears, refactor to a shared `.copy-warn-banner.is-{critical,info,...}` modifier.
