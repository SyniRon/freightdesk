# ADR 0002: No EVE SSO in v1; per-visitor state in `localStorage`

**Status:** Accepted (2026-05-13)

## Context

EVE Online has a public OAuth/SSO endpoint (`login.eveonline.com`) and an associated ESI scope system. Many third-party tools require login — typically to read character-scoped data, to dock-token Upwell structures for market lookups, or to bind per-character settings server-side.

FreightDesk does none of those things directly. Hangar contents arrive via clipboard paste, not via ESI. Rate cards are public. The only scope-bearing data is the docking token needed to enumerate alliance-private Upwell structures — and that's deferred entirely (see [ADR 0003](0003-client-side-hangar-parsing.md) and the structure-mapping deferral in PROJECT.md).

The cost of supporting login is substantial: an OAuth client per environment, a token store, a session model, a rotation strategy, CSRF protection on the callback, a logout flow, and the cognitive overhead of "is this user logged in" on every render. None of that earns its keep for the v1 product surface.

## Decision

No EVE SSO in v1. The site requires zero authentication.

Per-visitor preferences (default service, price-source toggle, collateral %, rush toggle, custom locations entered) live in `localStorage` under the `eveship.*` namespace. A small migration shim in `web/src/lib/storage.ts` handles older shapes (e.g., `sell 5%` → `sell`, deprecated `collOverride` ignored).

The server has no concept of a user. There is no session, no cookie, no token. The browser is the entire state container.

## Consequences

- No auth surface to attack. No token-leak risk. No "log in to use the calculator" friction at the conversion event.
- Settings don't sync across devices. Acceptable — the use case is paste-this-hangar-once-and-copy-the-values, not a stateful workflow.
- Reset is `localStorage.clear()` or a Settings drawer button. Recoverable by the user without any support touch.
- Revisited only if alliance-structure mapping (option C in PROJECT.md deferred limitations) genuinely requires per-character scoping. If it does, the auth surface returns in a v2 redesign — not as a graft onto v1.
