# Contributing a service to FreightDesk

FreightDesk's shipping services (rate cards) live as one YAML file per service
under [`web/services/`](web/services/). Adding or updating a service is a small,
reviewable Git diff — no code changes, no database, no privileged access. This
guide walks through the schema, the formula kinds, the service-level fields, and
how to test your change locally before opening a PR.

The canonical schema is the TypeScript in
[`web/src/lib/types.ts`](web/src/lib/types.ts). At build time,
[`web/scripts/build-services.ts`](web/scripts/build-services.ts) reads every
YAML file, validates it against those types, and emits a typed module the app
imports. If a YAML is malformed, the build fails — that's the validation gate.
See [ADR 0005](docs/adr/0005-yaml-service-config-build-time-codegen.md) for the
rationale.

## File layout

One file per service, named after the service `id`, e.g.
`web/services/my-shipper.yaml`. The build picks up every `*.yaml` / `*.yml` in
that directory automatically — no index to register in.

## Service schema

A service file is a single YAML document with these fields (mirrors the
`Service` interface in `types.ts`):

| Field           | Type     | Required | Notes                                                                 |
| --------------- | -------- | -------- | --------------------------------------------------------------------- |
| `id`            | string   | yes      | Stable slug, matches the filename. Used internally as the key.        |
| `name`          | string   | yes      | Display name on the service card.                                     |
| `tagline`       | string   | no       | Short subtitle. Defaults to empty.                                    |
| `minReward`     | number   | no       | Service-level floor on reward, in ISK.                                |
| `maxVol`        | number   | no       | Service-level volume cap, in m³.                                      |
| `maxCollateral` | number   | no       | Service-level collateral cap, in ISK. Omit for no cap.                |
| `routes`        | array    | yes      | One or more route entries (see below).                                |
| `contract`      | object   | no       | Contract-window metadata block (see below).                           |

Service-level `minReward` / `maxVol` / `maxCollateral` apply to every route. A
route may also carry its own `minReward` / `maxVol` / `maxCollateral`, which
override the service-level value for that route.

> **Note:** `updated` (the "rates last updated" date shown on each card) is
> **not** set in the YAML — it's derived automatically from `git log` at build
> time. Don't add it by hand.

### Route entry

Each entry in `routes` describes one direction (mirrors `ServiceRoute`):

| Field           | Type     | Required | Notes                                                             |
| --------------- | -------- | -------- | ---------------------------------------------------------------- |
| `origin`        | string   | yes      | Location key for the pickup (see "Location keys" below).         |
| `destination`   | string   | yes      | Location key for the drop-off.                                   |
| `formula`       | object   | yes      | Reward formula — one of the four kinds below.                    |
| `rushFee`       | number   | no       | Flat ISK surcharge for a rush contract.                          |
| `minReward`     | number   | no       | Route-level override of the service-level floor.                 |
| `maxVol`        | number   | no       | Route-level override of the service-level volume cap.            |
| `maxCollateral` | number   | no       | Route-level override of the service-level collateral cap.        |

### Location keys

`origin` and `destination` are location `id`s from the location table in
[`web/src/lib/logic.ts`](web/src/lib/logic.ts). The built-in hubs and staging
keys are:

| Key       | Location                                          |
| --------- | ------------------------------------------------- |
| `jita44`  | Jita IV - Moon 4 - Caldari Navy Assembly Plant    |
| `amarr`   | Amarr VIII (Oris) - Emperor Family Academy        |
| `rens`    | Rens VI - Moon 8 - Brutor Tribe Treasury          |
| `dodixie` | Dodixie IX - Moon 20 - Federation Navy Assembly   |
| `cj6mt`   | C-J6MT - 1st Taj Mahgoon                           |

If your service runs to or from a location not in that table, add the location
to `logic.ts` in the same PR.

## Formula kinds

`formula.kind` is a discriminated union with five variants (mirrors
`RouteFormula` in `types.ts`). Every value is in raw units: `ratePerM3` is
ISK per m³, `collateralPct` is a fraction (e.g. `0.005` = 0.5%), `reward` is ISK.

### `sum` — rate plus a collateral percentage

Reward = `vol × ratePerM3 + collateral × collateralPct`.

```yaml
formula:
  kind: sum
  ratePerM3: 800
  collateralPct: 0.01   # 1% of collateral, added on top of the volume rate
```

### `max` — the larger of rate or collateral percentage

Reward = `max(vol × ratePerM3, collateral × collateralPct)`.

```yaml
formula:
  kind: max
  ratePerM3: 900
  collateralPct: 0.005  # 0.5% — used when it beats the volume rate
```

### `rate-only` — pure volume rate, no collateral component

Reward = `vol × ratePerM3`.

```yaml
formula:
  kind: rate-only
  ratePerM3: 700
```

### `flat` — a fixed reward regardless of volume or collateral

Reward = `reward`.

```yaml
formula:
  kind: flat
  reward: 50000000      # 50M ISK flat
```

### `clamped-rate` — volume rate clamped to `[floor, fullLoad]`, optional collateral floor

Reward = `clamp(vol × ratePerM3, floor, fullLoad)`, then — when `collateralPct`
is present — `max()`'d against `collateral × collateralPct`. Use for cards that
quote a per-m³ rate with a full-load reward ceiling. `fullLoad` is the reward at
a full load (typically `ratePerM3 × maxVol`). Omit `collateralPct` on legs with
no collateral component.

```yaml
formula:
  kind: clamped-rate
  ratePerM3: 900
  floor: 5000000        # lower bound on the volume reward
  fullLoad: 315000000   # upper bound = 900 × 350,000 m³
  collateralPct: 0.005  # 0.5% — optional; collateral floor on this leg
```

## Contract metadata block

The optional `contract` block holds the manual picks a contractor sets in EVE's
Create Contract dialog — informational only, not paste fields (mirrors
`ServiceContractMeta`):

| Field             | Type   | Required | Notes                                              |
| ----------------- | ------ | -------- | -------------------------------------------------- |
| `expiration`      | string | yes      | Free-form display, e.g. `"1 week"`.                |
| `daysToComplete`  | string | yes      | Free-form display, e.g. `"7 days"`.                |
| `descriptionHint` | string | no       | Free-form hint, e.g. `"optional"`.                 |
| `source`          | string | no       | URL of the published rate card this config mirrors.|

```yaml
contract:
  expiration: 1 week
  daysToComplete: 7 days
  descriptionHint: optional
  source: https://example.com/rate-card   # optional — published card this mirrors
```

## Full example

A complete two-route service (the bundled
[`web/services/adfu-kum-n-go.yaml`](web/services/adfu-kum-n-go.yaml) is a good
reference):

```yaml
id: my-shipper
name: My Shipping Service
tagline: Internal alliance freight

# Service-level defaults — apply to every route below.
minReward: 5000000
maxVol: 350000
# (omit maxCollateral to leave collateral uncapped)

routes:
  - origin: cj6mt
    destination: jita44
    formula:
      kind: max
      ratePerM3: 900
      collateralPct: 0.005   # 0.5%
    rushFee: 250000000       # +250M ISK

  - origin: jita44
    destination: cj6mt
    formula:
      kind: rate-only
      ratePerM3: 700
    rushFee: 250000000

contract:
  expiration: 1 week
  daysToComplete: 7 days
  descriptionHint: optional
```

## Test locally

From the `web/` directory:

```bash
pnpm install
pnpm build:services   # validates every YAML + regenerates the typed module
pnpm test             # vitest unit suite (parser, eligibility, pricing, …)
pnpm dev              # vite dev server — open the app and check your card
```

`build:services` is the validation gate: a schema error (wrong field type,
unknown formula kind, missing required field) fails it with a message pointing
at the offending file. `pnpm build` runs the same step as part of the full
build, so a clean `pnpm build` also confirms your YAML is valid.

In the running dev app, confirm:

- Your service card appears with the right name, tagline, and rates.
- Each route quotes the reward you expect for a sample hangar paste.
- Service-level and route-level caps behave as intended.

## Open the PR

When you open a pull request that adds or changes a service, pick the
**Service** PR template from the dropdown under "Create pull request" (or append
`?template=service.md` to the compare URL). It pre-fills the checklist: rate-card
source link, contract metadata, and a local-test confirmation.
