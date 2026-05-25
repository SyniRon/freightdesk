# ADR 0001: Standalone public repo, not folded into the private importer codebase

**Status:** Accepted (2026-05-13)

## Context

Prior work on related EVE tooling already contained reusable building blocks — reward formulas, route eligibility, structure mapping, hangar parsing, SDE volume lookup, Fuzzwork pricing. One option was to extend an existing internal codebase to host this public-facing product alongside it; another was to start a standalone repository and reuse only the patterns.

Existing internal codebases had not been designed with a public-facing audience in mind. Public-surface concerns — OPSEC posture, no admin-token dependencies, MIT licensing, separable secrets, an externally reviewable dependency footprint — would have to be retrofitted, with the older code's complexity coming along for the ride.

## Decision

Ship FreightDesk as a standalone public repository (`SyniRon/freightdesk`, MIT). Reuse *patterns* from prior EVE tooling (hangar paste parser, SDE volume lookup with ESI enrichment, Fuzzwork pricing client, Cloudflare Tunnel deploy compose), but copy-don't-fork — the two surfaces will diverge quickly and the public-facing artifact should be reasoned about on its own terms.

## Consequences

- Clean public surface from day one. License, README, dependency footprint, and secret handling are public-facing artifacts rather than retrofits of a private tool.
- Some pattern duplication across repositories — the SDE+ESI build pipeline and the Fuzzwork client are reimplemented rather than imported. Acceptable cost.
- The two codebases evolve independently. A change in one is not automatically a change in the other.
- Future tools in this product family follow the same shape: standalone repository per tool, shared patterns documented in ADRs rather than imported as a monorepo dependency.
