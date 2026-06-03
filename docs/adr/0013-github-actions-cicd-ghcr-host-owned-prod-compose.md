# GitHub Actions CI/CD: GHCR images, tag-triggered deploy, host-owned prod compose

**Status:** Accepted (2026-06-02)

## Context

Deploys were manual and fragile. The image was built *on the prod host* (`docker compose up -d --build`), which re-ran the slow `build:sde` pipeline (CCP SDE download + ESI enrichment, several minutes) on every release, with rollback as a hand-retagged image. Worse, **CI never built the Docker image** — it ran `pnpm build` directly on node 22 while the image used node 26 — so Dockerfile-only breakage surfaced only at deploy time (the node-25-dropped-corepack break, PR #56, passed all CI and failed at `docker compose build`).

Three constraints shape the solution: the repo is **public and forkable** (ADR 0001) so no operator-specific infra may be committed; the host has **no public ingress** (cloudflared tunnel only); and prod carries a **permanent uncommitted overlay** on `docker-compose.yml` (strips the bundled Umami, connecting instead to a separately-managed Umami over an external Docker network), preserved by `git stash` across pulls — incompatible with automation.

## Decision

CI/CD runs on GitHub Actions. Every operator-specific value is a GitHub **Secret/Variable**, never committed — the same discipline already used for the `VITE_*` build args — so the workflows are forker-generic.

- **Images build in CI and publish to GHCR** (`ghcr.io/<repo>`, public package, derived from `github.repository`). The host stops building; it pulls. This exercises the real Dockerfile on every PR (a no-push `image-build` gate, closing the CI gap) and makes images immutable and rollback-able by tag.
- **Releases are SemVer git tags.** Pushing `v0.2.0` triggers `release.yml`: build → push `:0.2.0` + moving `:latest` → deploy. `workflow_dispatch` re-deploys an existing tag (the rollback/re-deploy lever) without rebuilding.
- **The version comes from the tag at build time.** `package.json` version is metadata nothing reads (only `VITE_SENTRY_RELEASE` consumes a version, `web/src/instrument.ts`), so the build injects the tag's version ephemerally (`npm pkg set version`, and `VITE_SENTRY_RELEASE`) — no pre-release bump to maintain, no commit-back, no drift. Committed `package.json` sits at a `0.0.0` sentinel.
- **The prod compose is host-owned, not in the repo.** The committed compose is renamed `docker-compose.example.yml` — it is exactly that, the all-in-one reference stack (app + cloudflared + bundled Umami) for forkers and local dev. Prod runs its own compose on the host, referencing the GHCR image by `${IMAGE_TAG}` from the host `.env` and wiring its connection to a separately-managed Umami stack via an external Docker network. Deploy = SSH in, write `IMAGE_TAG`, `docker compose pull app && up -d --no-deps app`.
- **The deploy reaches the private host over Tailscale SSH.** `release.yml`'s deploy job joins the tailnet as an ephemeral `tag:ci` node (SHA-pinned action, OAuth client scoped by ACL to the host's SSH only), runs the deploy, then drops off. No new public exposure.
- **A `production` GitHub Environment gates the deploy** with a required reviewer (a human approval no token can bypass), a `v*` tag restriction, and Environment-scoped deploy secrets. The default `GITHUB_TOKEN` is read-only; `packages: write` is granted only to the tag-triggered push job.

## Consequences

- Deploys are push-button-with-approval; rollback is "set the prior `IMAGE_TAG`, recreate." The prod tree is clean — no stash, deterministic.
- Prod wiring (its Umami connection, tailnet access) stays out of the public repo by living on the host, consistent with ADR 0001 — at the cost that it must be backed up elsewhere (a private infra repo or host-level backup), since it is no longer in version control here.
- The build moves off the host: faster, reproducible deploys, and the Dockerfile is continuously tested. CI minutes rise (an image build per PR), mitigated by buildx `type=gha` cache + the existing SDE-zip cache.
- Security posture is deliberate against the supply-chain / PR-shenanigans class: fork PRs get no secrets (plain `pull_request`, GitHub-hosted runners only — never a self-hosted runner on a public repo), the human approval gate sits in front of prod, and third-party Actions are SHA-pinned.
- The baked Caddyfile reverse-proxies to the literal `umami:3000`, so one image serves both worlds — the bundled `umami` service (forkers) and a separately-managed Umami container reachable as `umami` over the external network (prod) — with no per-environment edit.
