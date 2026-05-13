# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: prototype frontend live (2026-05-13)

The frontend is ported from a Claude Design handoff bundle ("FreightDesk" — dark logistics-terminal aesthetic, copper accent, Space Grotesk + JetBrains Mono). End-to-end flow works against stubbed data: hangar paste parser, route picker with searchable combobox + custom-entry fallback, three stubbed services (Alliance Logistics / PushX / Red Frog) with eligibility filtering, four contract-window copy buttons (Destination / Shipper / Reward / Collateral) in EVE's Create Contract window order.

No backend yet. Everything runs client-side; the only stubs are the data sources.

Repo name is `eve-shipping-assistant`; **the product is branded "FreightDesk"** in the UI; design docs call it `eve-shipping-calc`. Same project, three names — the UI text is canonical for end users.

## Product in one paragraph

Public web tool for EVE Online haulers using contracted shipping services. User pastes an in-game hangar → tool parses it client-side, computes total volume, suggests collateral (Jita value), and produces **click-to-copy buttons matching the exact strings EVE's in-game contract window expects** (volume, collateral, reward, destination string). Every existing shipping calculator (Red Frog, PushX, alliance shippers) makes the user type volume manually — eliminating that step is the product.

## Canonical design context

Read these before proposing implementation changes — they capture decisions and open questions that are NOT yet in code:

- `/home/syniron/obsidian/directorate/indie/ideas/eve-shipping-calc.md` — full idea note (design pins, risks, audience, distribution, v1/post-SLC scope)
- `/home/syniron/obsidian/directorate/projects/syni-eve-shipping-calc.md` — this week's SLC scope and out-of-scope list
- `/home/syniron/obsidian/directorate/maintenance/syni-eve-reprocessing-helper.md` — the sibling shipped project we will copy patterns from (stack, deploy, learnings on SDE / Fuzzwork / ESI)

If those notes conflict with this file, the notes win — they are the working design surface.

## Design pins (already decided — do not re-litigate without flagging)

- **Standalone repo.** Not folded into the private `eve-importer-paradise` codebase.
- **No EVE SSO / character login in v1.** Auth complexity drops entirely. Reconsider only if alliance-structure picker forces it back in.
- **Hangar parsing is client-side.** What someone is shipping is OPSEC-sensitive. Volumes computed in the browser. Server only ever sees analytics metadata (route, service, volume bucket, conversion events) — **never the item list**.
- **Per-service constraint model.** Each service has origin/destination allowlist, volume cap, collateral cap, max-jumps cap, sometimes ship-type restrictions. Ineligible services drop out of the picker. Constraints live alongside the rate formula in per-service config.
- **Rates and new services land via git.** Per-service config (YAML or JSON) committed to the repo. Community PRs welcome long-term. UI surfaces `rates last updated YYYY-MM-DD` from git commit metadata.
- **Analytics is core, not bolt-on.** Self-hosted Plausible or Umami on synicloud, same Cloudflare Tunnel pattern as Reprocessing Helper. The **contract-value copy click is the conversion event** — pin that metric specifically. No PII, no third-party trackers.
- **Mobile is low priority.** Desktop-first. Mobile-graceful is fine; mobile-first is wrong.
- **Donation only.** EVE dev agreement bans paid tools — do not propose paywalls, premium tiers, or affiliate angles.

## Big unresolved design question

**Structure mapping for contract destinations.** Contracts need exact Upwell structure listing strings, not system names. ESI has no public endpoint listing all player structures; it needs a docking-scoped token per structure. Three options on the table (A: hand-curated NPC + major public Upwell; B: admin-token enumeration of alliance structures — OPSEC tension; C: alliance-only feature gated by character login — reintroduces auth). **For SLC: hardcode the alliance staging structure + Jita 4-4.** Defer the real decision to post-SLC v2. If you find yourself solving this in v1, stop and check.

## Architecture target (when code starts)

Mirror `SyniRon/reprocessing_helper` (the shipped sibling at https://reprocess.syniron.com):

- **Backend:** Go 1.26 + Chi router. Single binary, SPA embedded via `go:embed all:frontend`.
- **Frontend:** Vite + React + TypeScript + shadcn/ui (pnpm).
- **SDE:** CCP official JSONL ZIP, auto-bootstrapped on first boot. Volume lookup via `packagedVolume`, with ESI enrichment fallback for modules (cat 7), drones (18), subsystems (32), fighters (87) — that's a known gotcha the sibling repo solved.
- **Pricing:** Fuzzwork aggregates, chunked 500 IDs/request, 5-min in-mem cache. Used only for collateral suggestion (Jita value), not core volume math.
- **Persistence:** None server-side in v1 — no auth means no token bucket. Per-visitor settings (default service, custom shipping ISK/m³, etc.) live in `localStorage`.
- **Hosting:** synicloud VPS via Cloudflare Tunnel (`cloudflared` container). No public host ports. Deploy stack lives at `/opt/syni/stacks/<project>/` on the VPS (see global CLAUDE.md for the SSH-as-`claudeuser` pattern).

## Code reuse path

Copy (don't fork — divergence will be fast) from the Reprocessing Helper repo:
- Hangar paste parser (clipboard text → `[]{typeID, qty}`)
- SDE volume lookup + ESI enrichment fallback for the four broken categories above
- Fuzzwork pricing aggregates
- Cloudflare Tunnel / `cloudflared` container deploy compose pattern
- Background warmer pattern (only if pre-caching ESI data turns out to be needed — probably not for v1)

If a pattern from the sibling repo seems wrong here, prefer rewriting over inheriting — the OPSEC posture differs (no admin token, no structure markets, no auth surface).

## Commands

Frontend lives in `web/` (Vite + React + TypeScript, pnpm).

```
cd web
pnpm install
pnpm dev          # vite dev server on :5173
pnpm build        # tsc -b && vite build → web/dist/
pnpm preview      # serve the build
```

Headless verify (no GUI on this dev box — see global CLAUDE.md for the Chromium snap pattern):

```
# from anywhere with global playwright installed
NODE_PATH=$(npm root -g) node /tmp/verify-freightdesk.mjs   # or wherever the verify script lives
```

Backend (Go + Chi, mirroring sibling `reprocessing_helper`) is **not yet scaffolded** — SLC keeps everything client-side. Add `cmd/server/main.go` with `go:embed all:frontend` once a server-side need lands (analytics endpoint, git-driven service config refresh, etc.).

## Frontend layout

```
web/
  index.html              entry — loads Space Grotesk + JetBrains Mono webfonts
  src/
    main.tsx              React root
    App.tsx               root state, persistence, Reveal-animated section flow
    styles.css            all styles (single file, ~1030 lines, copied verbatim from design)
    lib/
      itemsDb.ts          STUB: ~40 items → {vol, price}. Replace with Fuzzwork + SDE.
      logic.ts            parser, services, locations, formatters, eligibility eval
      storage.ts          localStorage helpers (eveship.* keys)
      useClipboard.ts     clipboard + toast
    components/
      icons.tsx           inline SVG strokes (no icon library)
      Reveal.tsx          enter/exit animation primitive (grid-rows collapse + fade)
      AppHeader.tsx       brand mark + settings cog
      EmptyState.tsx      hero shown until first paste
      PasteBlock.tsx      01 — paste textarea + live items/volume/value meter
      ParsedSummary.tsx   02 — collapsible cargo table
      RoutePicker.tsx     03 — origin/destination + swap
      LocationCombo.tsx   searchable combobox; falls back to custom-typed entry
      SecBadge.tsx        EVE-coloured security-status pill (red/amber/green)
      ServicePicker.tsx   04 — service cards with eligibility + show-calculation
      ContractCopy.tsx    05 — four copy buttons + volume footer
      SettingsDrawer.tsx  per-visitor settings (price source, collateral override)
      AboutFooter.tsx     about + GitHub links + ISK tip jar + CCP disclaimer
```

## Stubs that need wiring (in priority order)

| Stub | Where | Real source / plan |
|---|---|---|
| Item DB (typeID → volume + price) | `web/src/lib/itemsDb.ts` | Fuzzwork market API + CCP SDE JSONL. Reprocessing Helper has the full pattern, including ESI enrichment fallback for modules/drones/subsystems/fighters. |
| Service rates, caps, routes | `SERVICES` in `web/src/lib/logic.ts` | Per-service YAML/JSON config files under `services/` (post-SLC). `updated` field reads from `git log -1 --format=%ai <file>` at build time. |
| Location preset list | `LOCATIONS` in `web/src/lib/logic.ts` | ESI `/universe/systems` + `/universe/stations` for trade hubs; alliance staging is hardcoded (SLC-K7) until the OPSEC question on alliance-Upwell-publishing is resolved. |
| Location free-text search beyond presets | `LOCATIONS.filter` inside `LocationCombo` | Debounced ESI `/search` or alliance-side system list. Custom-typed entries continue to be supported as a fallback. Data shape is `{id, short, name, sec, hub?, alliance?, custom?}` — don't break it. |
| Jita price source toggle (UI exists, not wired) | `SettingsDrawer` `priceSource` setting | Fuzzwork `/aggregates` — values `sell 5%`, `sell median`, `buy 95%` already match the standard query shape. |
| ISK tip-jar destination | `ISK_ADDRESS` in `AboutFooter.tsx` | Real corp or character name. |

## Deliberate omissions vs. the design bundle

- **Tweaks panel** (accent / layout / density) dropped. It was Claude Design's dev-time iteration affordance using their `__edit_mode_set_keys` protocol — not a user-facing feature. The CSS still respects `data-density` and `data-layout` attributes on `<html>`, so re-adding the controls to the Settings drawer later is trivial.
- **shadcn/ui** skipped despite being in the original CLAUDE.md plan. The "Logistics Terminal" design has bespoke CSS for every primitive (paste meter, sec badge, copy row, etc.) and shadcn would fight it. Reconsider only if we need a complex component shadcn ships (combobox, dialog) that the design doesn't already define.
- **Go backend** not scaffolded yet. Pure client-side is enough for the SLC; revisit once analytics or git-driven config refresh lands.

## What "done" looks like for v1 / SLC

**SLC bar (current week target — Sunday ship):** Live at a `syniron.com` subdomain via Cloudflare Tunnel. Paste hangar → compute volume → click-to-copy contract values (volume, suggested collateral, reward) for **one alliance shipper** on **alliance staging → Jita**. Single shipper, single route, no auth.

**v1 (post-SLC):** Adds Red Frog + PushX + Goon alliance shipper, more routes, the per-service constraint model, git-driven rate config, real analytics. Structure mapping beyond hardcoded staging + Jita stays deferred.
