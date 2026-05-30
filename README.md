# FreightDesk

Third-party shipping helper for EVE Online. Paste a hangar list, pick a route,
get the four strings to drop into the in-game Create Contract window.

**Live:** https://freightdesk.syniron.com

Not affiliated with CCP Games. EVE Online and all related logos are trademarks
of CCP hf.

## Stack

Vite + React + TypeScript, served as static via Caddy on Cloudflare Tunnel.
Item volumes are built from CCP's SDE at image-build time with ESI enrichment
for modules / drones / subsystems / fighters / ships. Live Jita prices come
from Fuzzwork aggregates fetched directly from the browser.

## Dev

```bash
cd web
pnpm install
pnpm build:sde     # downloads SDE + ESI-enriches, ~5min first time
pnpm dev           # http://localhost:5173
pnpm test          # vitest unit tests
pnpm test:e2e      # playwright against the prod build
```

## Adding a service

Shipping services are one YAML file per service under `web/services/`. Drop a
file in, run `pnpm build:services` (which validates it and regenerates
`src/lib/services.generated.ts`), and open a PR.

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the full schema, all four
formula kinds with examples, the service-level fields, and the local-test
workflow.

## Deploy

`Dockerfile` is multi-stage (Node SDE/ESI build → Caddy static serve, listens
on `:8080`). `docker-compose.yml` includes the app, an Umami + Postgres
analytics sidecar, and a (commented-out) `cloudflared` service for exposing
via Cloudflare Tunnel. The image build runs the SDE + ESI pipeline inside the
container (~5 minute first build).

Copy `.env.example` to `.env`, fill in the secrets, then `docker compose up
-d --build`. To go public, either uncomment the `cloudflared` service and set
`TUNNEL_TOKEN`, or swap the `app` service's `ports` back to `expose: ["8080"]`
and front it with whatever reverse proxy you prefer.

## Analytics

Self-hosted [Umami](https://umami.is) runs alongside the app via `docker compose`.
The admin UI binds to the address in `UMAMI_BIND` — set this to a private
interface (loopback, VPN/tailnet, etc.) so it's not publicly exposed. The
tracking script is reverse-proxied through Caddy so visitor browsers hit it on
the app's own origin (no third-party tracker).

**First-time setup** (after the stack is up):

1. Set `UMAMI_BIND` in `.env` to a private interface IP. `docker compose up -d`.
2. From a device on that interface, visit `http://<UMAMI_BIND>:3000`.
3. Log in (default `admin` / `umami`) — **change the password immediately** in Settings → Account.
4. Settings → Websites → Add. Copy the resulting website UUID.
5. Set `VITE_UMAMI_WEBSITE_ID=<uuid>` in `.env`, then `docker compose up -d --build` to rebake the bundle with the tracking script embedded.

**Privacy:** No PII, no third-party. Hangar contents never reach Umami — only
metadata events (paste-parsed with volume bucket, route changed, service selected,
copy clicked with field name).

## Contributing

Rate cards and routes live in `web/services/*.yaml`. PRs welcome — see
**[CONTRIBUTING.md](./CONTRIBUTING.md)** for how to add or update a service. The
`updated` field is auto-derived from `git log` at build time.

## License

[MIT](./LICENSE)
