<!--
Service PR template. See CONTRIBUTING.md for the full schema and local-test
workflow: https://github.com/SyniRon/freightdesk/blob/main/CONTRIBUTING.md
-->

## Service

<!-- Name of the shipping service this PR adds or updates. -->

**Service:**

**Change:** <!-- new service / rate update / route added / fix -->

## Rate card source

<!--
Link to the authoritative rate card this YAML transcribes — the shipper's
in-game MOTD, forum post, public calculator, Discord announcement, etc. A
reviewer must be able to confirm the rates against this source.
-->

- Source:

## Checklist

- [ ] One YAML file per service under `web/services/`, named after the `id`.
- [ ] `formula.kind` is one of `sum` / `max` / `rate-only` / `flat` for every route.
- [ ] `origin` / `destination` use valid location keys (added any new location to `web/src/lib/logic.ts` in this PR).
- [ ] Contract metadata block (`expiration`, `daysToComplete`) filled in where the service uses one.
- [ ] Rates match the linked source above.
- [ ] `pnpm build:services` passes locally (validates the YAML).
- [ ] `pnpm test` passes locally.
- [ ] Verified the service card renders and quotes correctly in `pnpm dev`.

## Screenshot

<!-- Optional but appreciated for a new or visually changed service card. -->

## Notes

<!-- Anything a reviewer should know — quirks, assumptions, open questions. -->
