# CLAUDE.md — freightdesk

Operational knowledge for this repo — the unwritten convention, the reason behind a choice, the trap
that cost an afternoon. Tracked in the public repo, so the public-repo posture under Conventions
applies to this file too.

**Cache only what costs real digging.** Test counts, timings, dependency versions, bundle sizes,
issue and PR status, and live metrics rot, and a rotted line gets believed. Those live in `git`,
`gh`, `package.json`, and the workflow files, which are always right. When an ADR or a code comment
covers something, point at it rather than restating it — a restatement drifts from its source
silently, and the copy in here is the one that's always loaded.

Other homes:

- `PROJECT.md` — what the product is and who it's for; read before scoping a feature.
- `GLOSSARY.md` — domain vocabulary; read before naming a type, a function, or any UI string.
- `docs/adr/` — why a decision was made; read before changing behaviour a gotcha below points at.

## Running the gate

`.github/workflows/ci.yml` is the gate — run its chain locally before any commit lands, and treat
any non-zero exit as a failed phase. `pnpm -C web build` is the typecheck gate inside it.

`validate-services.yml` is the fast path for PRs touching only `web/services/**` YAML. `ci.yml`
remains the ultimate gate.

## Conventions

- **Branch:** `agent/issue-N-<slug>` (kebab-case, ~40 chars of issue title).
- **Commits:** conventional — `fix(<scope>):`, `feat(<scope>):`, `chore(<scope>):`, `docs(<scope>):`.
- **Landing:** push the branch, open a PR with `Closes #<N>`, let the user merge.
- **Public-repo posture:** the repo is public and forkable (ADR 0001). Everything you write into an
  issue, PR, or tracked file is world-readable and permanent — write it for a stranger running their
  own fork, who needs the shape of the problem and none of this deployment's specifics. Host logins
  and paths, private network addresses, and deploy-time IDs for *this* deployment stay out of the
  repo, this file included.

## Agent skills

### Issue tracker

GitHub Issues, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default role labels, each named after its role. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context, with `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.

## Gotchas

### Three EVE paste shapes — the parser must handle all of them

The game emits hangar pastes at three different column counts depending on in-game settings: 2-col
simple, 6-col detailed, and 3-col contract-window with a trailing tab. All three flow through
`parseHangarPaste` if we split on `\t` and take `[name, qty]`, but real pastes carry trailing tabs,
comma-thousands, and column-mode quirks that hand-crafted unit tests miss. Fixtures live in
`web/test/fixtures/hangar-pastes/` — keep them load-bearing, and add the new shape there before
touching the parser.

### kumgo.space rounds UP

Pin `Math.ceil` for reward and collateral display — `Math.round` opened a 1-ISK gap against ADFU's
published calculator. Rationale and the worked example:
[ADR 0008](docs/adr/0008-copy-block-order-and-rounding.md).

### Sentry privacy posture — [ADR 0007](docs/adr/0007-sentry-privacy-posture.md)

Read the ADR before touching `instrument.ts`, before any production DSN goes live, and after every
Sentry SDK upgrade. It carries the three leak channels, the three scrubbing layers, and the
verification gate — all of which need re-walking after an upgrade, because two of the three would
otherwise have shipped silently.

Not in the ADR: `Sentry` is not exposed on `window` — the SDK is module-local.

### vitest `localStorage` collision with the Node built-in

Node's experimental built-in `localStorage` shadows the one jsdom would provide, so storage-touching
tests throw. `web/src/test-setup.ts` polyfills it, and that file's header comment is the live record
— read it before changing test setup, bumping vitest or jsdom, or moving the CI Node version.

## Infrastructure and deploy

### Deploy is tag-triggered

Pushing a SemVer tag `vX.Y.Z` runs `release.yml` — build, push to GHCR, deploy behind a `production`
Environment that requires human approval. Read
[ADR 0013](docs/adr/0013-github-actions-cicd-ghcr-host-owned-prod-compose.md) before cutting a
release, rolling back, or touching anything compose-shaped; it carries the mechanics and the
reasoning.

The prod compose is **host-owned and not in this repo**. The committed `docker-compose.example.yml`
is the reference stack for forkers and local dev — editing it does not change production.

Verify a deploy against the public URL — the app has no host port binding, so there is no tailnet
port to smoke:

```bash
curl -sL -o /dev/null -w '%{http_code}\n' https://freightdesk.syniron.com/
```

Then confirm the served `index-*.js` bundle hash matches the release build.

### The image build fails if a source map survives

The Dockerfile's serve stage is a gate: any image build where a `.map` reaches the served assets
fails, on every build path. Treat a failure there as a real leak, never a flaky step. How the maps
get emitted, uploaded, and deleted — and why the whole path is inert without `SENTRY_AUTH_TOKEN` —
is in [ADR 0014](docs/adr/0014-sentry-source-maps-and-release-commits.md).

### SDE build pipeline is slow on a cold cache

`scripts/build-sde.ts` downloads the CCP SDE and ESI-enriches the categories whose `packagedVolume`
the SDE gets wrong. First run takes several minutes, then it caches under `web/scripts/cache/`; a
stale CI cache costs one extra download and needs no intervention. **In a fresh worktree, copy
`web/public/items.json` and `web/public/locations.json` in from the main checkout** — `prebuild` then
skips the download entirely.

### Umami same-origin reverse proxy

Design, and why the website UUID is non-secret but stays untracked:
[ADR 0006](docs/adr/0006-self-hosted-umami-same-origin.md). The `Caddyfile` proxies `/umami/*` to
the Umami container, and `UMAMI_BIND` in `.env` keeps the admin UI on a private interface;
`docker-compose.example.yml` shows both.

## Fixed values

- **Live URL:** <https://freightdesk.syniron.com>
- **Staging structure**, exact contract destination string: `C-J6MT - 1st Taj Mahgoon` — the system
  is C-J6MT, not C-JM6T
- **Tip-jar donee corp:** `Delve Time Unit Expenditures` — deliberately not the shipper
- **Shippers, routes, rates, and caps:** `web/services/*.yaml` is the source of truth; the typed
  output is generated by `build:services`

## Cross-repo notes

- The maintainer's design notes outside this repo use the legacy slug `eve-shipping-calc`, the same
  project as `SyniRon/freightdesk`.
