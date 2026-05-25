# ADR 0005: Service config as YAML, build-time codegen, git as the edit surface

**Status:** Accepted (2026-05-14)

## Context

Each shipping service has a rate formula plus a set of constraints (origin/destination allowlist, volume cap, collateral cap, optional ship-type restrictions, contract-window metadata). The natural-looking implementations are: hard-code each service as TypeScript, store them in a database, or define a JSON schema and load them at runtime.

Three pressures make those choices wrong:

1. **Community PR path.** A long-term goal is community-contributed rate cards. Adding a shipper should be a small, reviewable Git diff — not a privileged DB write nor a TypeScript code change a non-engineer can't propose.
2. **Type safety at the call sites.** The route formula is a discriminated union (`sum` / `max` / `rate-only` / `flat`). The downstream eligibility evaluator and the reward computer need exhaustive handling of every variant. A runtime-loaded JSON object loses that compiler check.
3. **Auditable rate-update trail.** "When did this rate change?" must be answerable. `git log` is the answer for free if the config lives in the tree.

## Decision

Service config lives at `web/services/*.yaml`. One file per service. At build time, `scripts/build-services.ts` reads every file, validates the schema, and emits a single typed module `web/src/lib/services.generated.ts` with:

- Each `Service` typed against the discriminated `RouteFormula` union — exhaustiveness is enforced at every call site.
- An `updated` field per service derived from `git log -1 --format=%cs <yaml-path>`. That's the "rates last updated" surface in the UI.

The TypeScript types (`Service`, `ServiceRoute`, `RouteFormula`) live in `web/src/lib/types.ts` and constrain both the YAML schema and the codegen output.

Adding shipper #2 is: drop a YAML in `web/services/`, run `pnpm build:services` (or just `pnpm build`, which chains it), redeploy. No code edits.

## Consequences

- Rate updates and new shippers land as Git commits, reviewable by anyone with PR access. Auditable, blameable, revertable.
- The codegen step is a build prerequisite — the `services.generated.ts` file is gitignored. CI and local builds both regenerate it; a stale local copy is not a failure mode.
- Schema changes (e.g., a new `RouteFormula` kind, a new constraint type) require updating both the YAML schema and the TypeScript types. Same commit, same review.
- Validation runs at build time only. If a YAML is malformed, the build fails — a desirable outcome. Pairs naturally with a future YAML-validation CI step on PRs touching `services/*.yaml` (separate backlog item).
- The 30-day-stale UI flag (amber `stale` tag) is computed from the same `updated` field. Staleness pressure is visible to users, so the maintenance burden is socially enforced.
