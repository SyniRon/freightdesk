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

Drop a YAML file in `web/services/`. Example:

```yaml
id: my-shipper
name: My Shipping Service
tagline: short tagline
minReward: 5000000
maxVol: 350000
routes:
  - origin: cj6mt
    destination: jita44
    formula:
      kind: max          # sum | max | rate-only | flat
      ratePerM3: 900
      collateralPct: 0.005
    rushFee: 250000000   # optional
```

Then `pnpm build:services` regenerates `src/lib/services.generated.ts`.

## Deploy

Production deploy lives on synicloud behind Cloudflare Tunnel:

```bash
ssh claudeuser@synicloud "cd /opt/syni/stacks/freightdesk && sudo git pull && docker compose up -d --build"
```

The image build runs the SDE + ESI pipeline inside the container (~5 minute first build).

## Analytics

Self-hosted [Umami](https://umami.is) runs alongside the app via `docker compose`.
The admin UI is bound to the host's Tailscale interface only — no public exposure.

**First-time setup** (after the stack is up):

1. Find the synicloud Tailscale IP: `ssh claudeuser@synicloud "tailscale ip -4"`
2. Set `UMAMI_BIND=<that IP>` in `/opt/syni/stacks/freightdesk/.env` and `docker compose up -d`
3. From a Tailscale-connected device, visit `http://<that IP>:3000`
4. Log in (default `admin` / `umami`) — **change the password immediately** in Settings → Account
5. Settings → Websites → Add → name "FreightDesk", domain "freightdesk.syniron.com"
6. Copy the website UUID, set `VITE_UMAMI_WEBSITE_ID=<uuid>` in `.env`
7. `docker compose up -d --build` to rebake the bundle with the tracking script

**Privacy:** No PII, no third-party. Hangar contents never reach Umami — only
metadata events (paste-parsed with volume bucket, route changed, service selected,
copy clicked with field name).

## Contributing

Rate cards and routes live in `web/services/*.yaml`. PRs welcome. The `updated` field
is auto-derived from `git log` at build time.

## License

(Project is open source — license TBD.)
