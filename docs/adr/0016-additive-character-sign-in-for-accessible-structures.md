# ADR 0016: Additive character sign-in resolves accessible Upwell structures

**Status:** Accepted (2026-08-14). Supersedes [ADR 0002](0002-no-eve-sso-localstorage-only.md) in part.

## Context

A courier contract's Destination field wants the exact listing string of a dockable. NPC stations and
solar systems are solved offline ([ADR 0011](0011-location-search-via-sde-extract.md)); player-built
Upwell structures are not in the SDE at all, and reading one needs a docking-scoped token. ADR 0011
scoped itself to systems and NPC stations and reserved the rest: *"Runtime ESI `/search` is justified
only for player-built Upwell structures, which this decision does not attempt."* This is that carve-out
being taken.

Three options were carried for months: a curated list of public structures; a maintainer enumerating
alliance structures with a scope-bearing token and publishing the result as static data; or a
login-gated feature. Investigation against the live API and CCP's own record settled it by removing
two of them.

**There is no enumeration.** No endpoint returns the structures a character can dock at. The request
has been open since 2017, and a CCP-side comment conceded that a better mechanism *"is not at the top
of anyone's list and would require buy-in from a gameplay team."* Character search requires a
three-character query, so blind enumeration is impossible by construction rather than by policy —
which retires the admin-token option, since a maintainer would have to already know the names they
were searching for and would then be publishing them.

**The public structure list doesn't reach the destinations that matter.** It is unauthenticated and
small, covering only structures that are public *and* have banned nobody. Alliance staging — the
thing this project exists to ship to — is absent from it. A curated public list is therefore a
trade-hub feature wearing a structure-mapping costume.

**Per-character access dissolves the OPSEC problem.** Structure accessibility is an access-list
property of a character, not of an alliance. If each capsuleer's own token performs the search, the
results are information that capsuleer already has in-game, nothing is ever published, and there is
no list to leak. The confidentiality concern that made a coalition gate look necessary was an artifact
of the enumerate-and-publish shape, not of sign-in.

**The cost is trivial when the mechanism is autocomplete.** One search call plus one resolution per
displayed result, against an error budget of 100 non-2xx/3xx responses per 60-second window, with
hour-long cache lifetimes. A correct implementation generates zero errors, because search only returns
structures the character can already reach. CCP is explicit about the line: using search *as a
discovery mechanism* is abuse and is met with bans, while *"searching for and autocompletion of the
names"* is the endpoint's stated purpose.

## Decision

**Character sign-in is additive.** Every existing flow works with no authentication: the NPC-station
corpus, hand-pinned structures, free-typed destinations, quotes, and the copy block are unchanged for
a signed-out capsuleer. Signing in adds one capability — resolving **accessible structures** — and
removes nothing.

- **Authorization Code with PKCE (S256), no client secret**, so the app stays a static bundle with no
  server ([ADR 0004](0004-pure-static-no-backend.md) holds). Two read-only scopes: structure search
  and structure read.
- **Credentials live in `sessionStorage` and the refresh token is never persisted.** Closing the tab
  destroys the credential. This is chosen partly because there is no revocation path for a public
  client — a logout flow could not actually revoke anything — and partly because the product is a
  short-session tool where a ~20-minute access token spans a realistic visit.
- **Structures enter the route keyspace as `str:<esiId>`**, mirroring the existing `sta:<id>` escape
  hatch. An alias entry may pin an optional `esiId`, so a searched structure reconciles to the same
  slug its preset commits and prices identically either way.
- **No shared or pre-warmed cache.** Names are cached for the session only. A cross-user cache would
  need either a server, which ADR 0004 forecloses, or a committed structure list, which is the
  rejected publish-it option under another name.
- **No alliance or coalition gate.** The token supplies the confidentiality property; a membership
  check would add a drifting list of alliance identifiers, exclude forks from a feature that works
  correctly for them, and protect nothing that isn't already protected.
- **Search is user-driven autocomplete only** — a minimum-length, debounced query against what the
  signed-in character typed. Programmatic sweeps of the search endpoint are out of bounds, and the
  app reads its remaining error budget from the response headers and backs off rather than
  discovering the limit by tripping it.
- **The compatibility date is pinned explicitly.** Omitting it silently pins to the oldest supported
  date, which CCP may raise; a declared constant with a documented bump matches the instinct already
  recorded in [ADR 0015](0015-declared-rates-verified-date.md).
- **The client identifies itself** with app name, version, and repository URL as a compiled-in
  constant, plus an optional deployment contact supplied by untracked build configuration. The contact
  is deliberately not committed: CCP uses it to warn an operator before banning them, and a hardcoded
  address would send every fork's warnings to the upstream maintainer while the actual operator heard
  nothing.

## Consequences

- **ADR 0002 is superseded in part.** Its reasoning stands as the record of why the app shipped
  auth-free, but its boundary is now behavioural rather than versioned: core flows require no
  authentication; sign-in is optional and unlocks accessible-structure resolution only.
- **ADR 0011's zero-privacy-surface consequence no longer holds universally.** For a signed-in
  capsuleer, structure queries leave the browser. It remains true for everyone else, and no location
  query left the browser before sign-in exists.
- **A hand-pinned `esiId` cannot be validated at build time.** NPC-station aliases resolve against the
  SDE and fail the build loudly on a mismatch; structures have no build-time source and the build
  holds no token. A wrong id degrades silently to "no route matches," so the mechanism carries a
  development-time assertion — including a warning when a searched structure's *name* matches an alias
  whose id did not, which is the dual-identity regression ADR 0011 was written to prevent.
- **Search silently under-returns.** A long-standing defect returns fewer accessible structures than a
  character can dock at, and the response is indistinguishable from a complete one. On a Destination
  field this means a wrong pick or an abandoned contract, so a manual free-text path stays permanently
  available rather than being treated as a fallback for failure.
- **Two undocumented dependencies.** Neither ESI nor the SSO token endpoint documents a CORS policy,
  yet both permit cross-origin browser requests today, and the no-server design rests entirely on that.
  Likewise, the SSO metadata does not advertise public clients even though the PKCE flow works, so
  strict OAuth libraries validating against that metadata will refuse. Both have been stable for years
  and CCP publishes browser-specific guidance elsewhere, but neither is a promise.
- **A new class of secret enters the front end.** Credentials in URLs are a leak channel the previous
  privacy posture never had to consider; [ADR 0007](0007-sentry-privacy-posture.md) is amended to cover
  it, and its verification gate now extends to the callback route and to analytics.
