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
`src/lib/services.generated.ts`), and open a PR. Every config declares
`ratesVerified` — the `YYYY-MM-DD` date its rates were last checked against the
shipper's published rate card — and the build rejects a config without a real,
non-future one.

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the full schema, all five
formula kinds with examples, the service-level fields, and the local-test
workflow.

## Deploy

`Dockerfile` is multi-stage: a Node builder runs the SDE + ESI pipeline and
produces the static bundle; Caddy serves it on `:8080`. The first build is slow
(the SDE + ESI pipeline runs inside the image), fast and cached thereafter. The
app is `expose`-only (no host port) — public traffic enters through the
cloudflared tunnel over the internal Docker network.

### Local / fork stack

`docker-compose.example.yml` is the all-in-one reference stack: the app, a
`cloudflared` tunnel service, and a bundled Umami + Postgres analytics sidecar.
Because `docker compose` auto-discovers `docker-compose.yml` / `compose.yml`,
copy the file first:

```bash
cp docker-compose.example.yml docker-compose.yml   # gitignored locally
cp .env.example .env                               # fill in secrets
docker compose up -d --build
```

Or run directly without copying: `docker compose -f docker-compose.example.yml up -d --build`.

Set `TUNNEL_TOKEN` in `.env` to expose the app through the Cloudflare Tunnel.
To front it yourself instead, drop the `cloudflared` service and either add a
`ports: ["8080:8080"]` mapping on `app` or attach your own reverse proxy to the
Docker network.

### Production images (CI/CD)

On a `v*` SemVer tag, GitHub Actions builds the Docker image and publishes it
to GHCR. The production host runs its own compose file (not committed here —
operator-specific wiring lives off-repo), which pulls the published image by
tag and wires its own analytics. Rollback is re-deploying a prior image tag.
This keeps all host-specific configuration out of the public repo.

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
**[CONTRIBUTING.md](./CONTRIBUTING.md)** for how to add or update a service.
Re-checking a rate card counts as a contribution even when nothing changed —
bump that service's `ratesVerified` date.

## License

[MIT](./LICENSE)
