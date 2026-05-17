# ---- frontend build ----
FROM node:24-alpine AS builder
ENV CI=true
RUN corepack enable
WORKDIR /app/web
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_WEBSITE_ID=${VITE_UMAMI_WEBSITE_ID}
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ARG VITE_SENTRY_ENV
ENV VITE_SENTRY_ENV=${VITE_SENTRY_ENV}
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
