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

## Contributing

Rate cards and routes live in `web/services/*.yaml`. PRs welcome. The `updated` field
is auto-derived from `git log` at build time.

## License

(Project is open source — license TBD.)
