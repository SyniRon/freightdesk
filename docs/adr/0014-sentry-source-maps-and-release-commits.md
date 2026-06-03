# ADR 0014: Sentry source-map upload + release/commit association via a BuildKit-secret token

**Status:** Accepted (2026-06-03)

## Context

[ADR 0007](0007-sentry-privacy-posture.md) shipped error tracking but deferred source-map upload: production stack traces pointed at minified bundle paths (`/assets/index-*.js:1:NNN`) and Sentry's Releases view was empty — no commit blaming, no regression detection. Errors were captured but not actionable. This ADR closes that gap.

The constraint that shapes the whole design: **`vite build` runs inside the Docker image build, and that image is public on GHCR** ([ADR 0013](0013-github-actions-cicd-ghcr-host-owned-prod-compose.md)). Anything in an image layer is world-readable, and any file under `dist/` is served by Caddy. So the Sentry auth token must never enter a layer, and source maps must never reach the final stage.

## Decision

Use **`@sentry/vite-plugin`** (`web/vite.config.ts`) to do release creation, commit association, and source-map upload-and-delete in one pass during `vite build`. Everything is gated on `SENTRY_AUTH_TOKEN`:

- **Token as a BuildKit secret, not an ARG/ENV.** The build step mounts `--mount=type=secret,id=sentry_auth_token` for that single `RUN` and exports it only into that shell. It never persists in a layer. `release.yml`'s `build-push-action` passes it via `secrets:` from the `SENTRY_AUTH_TOKEN` repo secret. It is a **repo** secret (build-time, tag-push job only), *not* a `production` Environment secret (those are deploy-time).
- **Source maps emitted `hidden`, then deleted.** `build.sourcemap: 'hidden'` emits maps with no `//# sourceMappingURL` comment in the shipped JS; the plugin uploads them, then `sourcemaps.filesToDeleteAfterUpload` deletes every `dist/**/*.map` before the Caddy stage copies `dist`. No `.map` is served publicly.
- **Fully inert without the token.** When `SENTRY_AUTH_TOKEN` is absent, the plugin is `disable`d *and* `build.sourcemap` is `false`, so no maps are even emitted. This is the path for PR/fork builds (`ci.yml`'s `image-build` passes no secret), local `docker compose build`, and plain `pnpm build` — none upload, none ship maps, none fail on a missing token.
- **Commit association without `.git`.** The Docker context has no `.git`, so the commit SHA is passed in as a non-secret build-arg `SENTRY_RELEASE_COMMIT` (`github.sha`) and fed to `release.setCommits({ repo, commit, ignoreMissing: true })`. `ignoreMissing` keeps the release build green if a prior release's commit isn't in Sentry yet. Requires the Sentry GitHub integration connected to the repo (it is).

The release name matches `VITE_SENTRY_RELEASE` (the git tag) already set in `instrument.ts`, so uploaded maps bind to the release that captured the event.

## Consequences

- Production traces de-minify to real `*.tsx:line`; releases appear in Sentry with their commits, enabling suspect-commit blaming and regression detection.
- The token never touches an image layer and no `.map` is served — verified by building the image with no secret and confirming `find /srv -name '*.map'` is empty.
- `@sentry/cli` (a plugin dependency) ships a native binary; its build script is allow-listed in `pnpm-workspace.yaml` (`onlyBuiltDependencies`) so the Alpine image build has it. The single static `linux-x64` binary runs on musl.
- **Dependency-footprint + licensing (per [ADR 0001](0001-standalone-public-repo.md)).** This adds `@sentry/vite-plugin` (MIT) and ~15 transitive packages, including **`@sentry/cli`, licensed FSL-1.1-MIT — source-available, *not* OSI-approved** (it converts to MIT two years after each release). The footprint grows but FreightDesk's *distributed* artifact stays MIT-clean: `@sentry/vite-plugin` is a **devDependency**, and the published image is `caddy:2-alpine` + the static `dist` only — the builder stage holding `@sentry/cli` and its binary is discarded, so no FSL code is ever redistributed. The FSL terms (no competing product for 2 years) don't bite either: FreightDesk merely invokes the tool at build time and isn't a Sentry competitor. There is no MIT-licensed equivalent for Sentry source-map upload, so this is the cost of de-minified traces. Recorded explicitly because ADR 0001 makes the dependency footprint and licensing a reviewable public-facing artifact, not a silent default.
- **Stays forker-generic / no admin-token dependency (per [ADR 0001](0001-standalone-public-repo.md)).** The build no-ops without `SENTRY_AUTH_TOKEN`: a forker clones and `pnpm build` / `docker build`s with zero Sentry config and gets a working app — no maps emitted, no upload attempted, no failure. The token is the canonical operator's convenience, a separable secret, never a build prerequisite.
- Source-map *upload* failure (bad token/scopes, Sentry outage) fails the release build by the plugin's default — surfaced loudly during rollout rather than silently shipping unmapped releases. Acceptable: the failure mode is a missing Sentry release, not a broken site.
- Respects ADR 0007: source maps carry no user data, and the existing `data-sensitive` breadcrumb scrubbing in `instrument.ts` is unaffected.
