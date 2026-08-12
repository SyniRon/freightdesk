# ADR 0015: Rate freshness is a declared date in the config, not git metadata

**Status:** Accepted (2026-08-12)

Supersedes the freshness consequence of [ADR 0005](0005-yaml-service-config-build-time-codegen.md); the rest of that ADR stands.

## Context

[ADR 0005](0005-yaml-service-config-build-time-codegen.md) derived each service's `updated` date from `git log -1 --format=%cs <yaml-path>`, with today's date as a fallback when the lookup failed. The service card shows that date and tags a service `stale` past 30 days.

Two things were wrong with it, one fatal.

**The build environment has no git.** The service generator runs inside the production image build, where the base image ships no git binary and only the `web` subtree is copied in, so there is no repository either. The lookup failed on every production build and the fallback won every time, which made each service's `updated` value *the date the image was built*. `daysSince(updated) > 30` was therefore never true in a released build: the badge has never once fired in production, and users were shown a fresh-looking date, under a label about rates, that actually reported the build. A developer's laptop resolved real git dates, so the feature appeared to work everywhere it was looked at and nowhere it ran.

**A commit date answers a different question.** Even where it resolved, it reported when the file was last *committed*, not when the rates were last *confirmed correct* against the shipper's published rate card. Confirming that a rate card is unchanged is the common case and produces no commit, so it could never clear the badge; meanwhile any unrelated edit — a comment, a typo fix — silently reset the badge to fresh.

## Decision

Each service config declares `ratesVerified: YYYY-MM-DD`, a required top-level field, and that declared date is the only freshness signal. `Service.updated` is populated from it. Nothing in the generator consults git; `gitFileDate()` and its fallback are deleted.

- **The field is a sibling of `minReward` / `maxVol` / `maxCollateral`, not part of `contract:`.** The `contract:` block models the EVE Create Contract dialog fields the user sets by hand, and renders as an info panel. A verification date is not one of those.
- **The build fails on a missing field, on a value that is not a real calendar date, and on a date in the future**, naming the offending file and field. Validation lives in `web/scripts/lib/validate-service.ts`, a pure module with no filesystem or process side effects, so the schema gate is unit-testable; `build-services.ts` keeps the readdir/parse/emit half.
- **Future dates are rejected because a mistyped year would suppress that service's badge permanently and silently** — the exact failure this ADR exists to fix. Dates are compared as UTC dates, never instants, so the verdict does not depend on where the build runs.
- **There is no lower bound.** A very old date is the badge working as intended.
- **The 30-day threshold is one exported constant**, `STALE_AFTER_DAYS` in `web/src/lib/logic.ts`, consumed by the card and the About footer. The value stays 30 until there is evidence from watching it fire for the first time.
- **The card's label reads "Rates verified"**, matching what the value now means.

## Consequences

- Freshness is now a maintainer claim rather than a byproduct of file history, and it is only as honest as the person bumping it. That is the trade: a claim that can be made accurately beats a derivation that cannot. Re-checking a rate card and finding nothing changed is a real contribution, and now it is a diff.
- The generated output is identical whether the build runs on a laptop, in CI, or inside the image. Environment sensitivity is removed at the input rather than patched at the consumer, which is why no test asserts on dates in a built image — there is no longer a hazard there to guard.
- The staleness badge can now fire in production, and on current configs it will first do so 30 days after the last verification. This is the first time the amber tag has been reachable for real users.
- `validate-services.yml` no longer needs `fetch-depth: 0`; it was requested solely so the `git log` lookup would not come back blank on a shallow clone.
- Adding a service now requires one more field. `CONTRIBUTING.md` documents it as required; a config that omits it fails the build with a message that names the file and the field.
- Other build-time generated values may carry the same environment sensitivity — `scripts/build-sde.ts` makes its own assumptions about the build environment. Not audited here; worth its own issue.
