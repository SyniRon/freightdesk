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
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
# items.json is gitignored — build pipeline produces it here
RUN pnpm build:sde && pnpm build

# ---- serve ----
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/web/dist /srv
EXPOSE 8080
