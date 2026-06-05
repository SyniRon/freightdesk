# syntax=docker/dockerfile:1
# ---- frontend build ----
FROM node:26-alpine AS builder
ENV CI=true
# Node 25+ no longer bundles the corepack shim, so `corepack enable` fails on
# node:26-alpine. Install pnpm directly, pinned to the major CI uses (pnpm 11,
# lockfileVersion 9), so the image build matches CI.
RUN npm install -g pnpm@11
WORKDIR /app/web
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_WEBSITE_ID=${VITE_UMAMI_WEBSITE_ID}
ARG VITE_UMAMI_DOMAINS
ENV VITE_UMAMI_DOMAINS=${VITE_UMAMI_DOMAINS}
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ARG VITE_SENTRY_ENV
ENV VITE_SENTRY_ENV=${VITE_SENTRY_ENV}
ARG VITE_SENTRY_RELEASE
ENV VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE}
# Commit SHA for Sentry release→commit association (suspect-commit blaming).
# Non-secret: the repo is public. Empty for PR/local builds (upload is off).
ARG SENTRY_RELEASE_COMMIT
ENV SENTRY_RELEASE_COMMIT=${SENTRY_RELEASE_COMMIT}
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
# items.json is gitignored — build pipeline produces it here.
#
# SENTRY_AUTH_TOKEN is a BuildKit secret, NOT an ARG/ENV: the GHCR image is
# public, so a token in any layer would leak. The secret is mounted only for
# this RUN and never persists. Token absent (PRs, forks, local) → the Vite
# plugin disables itself and no source maps are emitted or uploaded.
RUN --mount=type=secret,id=sentry_auth_token \
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)"; \
    pnpm build:sde && pnpm build

# ---- serve ----
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/web/dist /srv
# Source maps must never ship (ADR 0014). When a Sentry token is present, Vite
# emits hidden maps and the plugin uploads then deletes them (see the builder
# note above) — but nothing verifies that delete succeeded. If it silently
# fails (or a toolchain change alters the behavior), maps would be served
# publicly. Unconditional: runs on every build of this image regardless of
# whether maps were emitted. `&&`/`||` routing makes a find error fail the
# build too, rather than pass it vacuously.
RUN maps="$(find -L /srv -name '*.map')" && [ -z "$maps" ] || \
    { echo 'ERROR: source maps leaked into served assets (Sentry upload/delete likely failed):'; \
      printf '%s\n' "$maps"; exit 1; }
EXPOSE 8080
