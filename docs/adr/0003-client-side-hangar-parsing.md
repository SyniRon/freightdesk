# ADR 0003: Hangar parsing is client-side; the server never sees the item list

**Status:** Accepted (2026-05-13)

## Context

A user's hangar contents are operationally sensitive. What someone is shipping reveals where they are, what they're building, who their suppliers are, and how much liquid value they're moving. In a competitive PvP MMO with active corporate espionage as a normal mode of play, that information has weight.

The naive implementation would POST the pasted hangar to a backend, parse it server-side, look up volumes and prices, and return the rendered contract values. That implementation creates a server log of every player's cargo for every contract they ever generate — even if no DB rows persist, request logs, error tracking, and analytics middleware can all capture the body.

## Decision

Hangar text never leaves the user's browser.

- The clipboard paste handler in `web/src/components/PasteBlock.tsx` keeps the raw text in React state only.
- `parseHangarPaste` in `web/src/lib/logic.ts` produces a `[]{typeID, qty}` array client-side from the locally-loaded `items.json`.
- Volume math, eligibility evaluation, and contract-value computation all run in the browser.
- Fuzzwork pricing requests go browser-direct, not via the FreightDesk server.
- The paste textarea and copy buttons carry `data-sensitive="true"` so Sentry's `beforeBreadcrumb` (see [ADR 0007](0007-sentry-privacy-posture.md)) drops any input/click breadcrumb originating from them.
- Analytics records only *metadata*: paste-parsed (with volume bucket, never item names), route changed, service selected, copy clicked (with field name, never value).

## Consequences

- The server has no copy of the user's cargo at any layer — application logs, request bodies, error reports, analytics. This is the load-bearing privacy contract.
- All compute happens on the client. The item DB (`items.json`, ~25 MB) is shipped to every visitor. Cached aggressively by the browser; the trade-off is acceptable.
- Some product moves are unavailable as a result: server-side rate-limit on price fetches, server-derived contract preview screenshots, AI-suggested route optimisation. If any of those become must-have, they need to be redesigned around metadata-only inputs (e.g., volume + route + service, never the items).
- Any future feature that wants to send the item list to the server requires explicit re-litigation of this ADR.
