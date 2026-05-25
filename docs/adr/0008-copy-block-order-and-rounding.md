# ADR 0008: Copy-block field order matches in-game UI; `Math.ceil` for reward/collateral

**Status:** Accepted (2026-05-16)

## Context

Two small but load-bearing correctness decisions were locked during the in-game validation pass on launch day. Both came up by surprise — not from spec — and both have specific reasons that would be lost if they were captured only as a passing test.

### Field order

The original design-doc pin had the copy block as Destination / Shipper / Reward / Collateral. That came from a screenshot annotation that read the in-game field stack bottom-up by mistake. Pasted in that order against a real Create Contract dialog, the values land in the wrong fields and the user has to manually re-shuffle. A 4-field tab cycle is small but every contract repeats it — the friction adds up.

### Rounding

Early implementation used `Math.round` for collateral-percent reward. Comparing against kumgo.space (ADFU's published calculator) produced a consistent 1-ISK gap on certain volumes — example: collateral 49,920,689,422 × 0.5% = 249,603,447.11. FreightDesk rounded to 249,603,447; kumgo rounded to 249,603,448. EVE contracts care about exact numbers, and a calculator that doesn't match the shipper's own calculator erodes trust on contact.

## Decision

**Copy-block order is Shipper / Destination / Reward / Collateral**, top-down, matching the EVE Create Contract window. Validated against the live in-game UI on 2026-05-16. The order is locked; changes require a superseding ADR.

**Reward and collateral display use `Math.ceil`.** This matches kumgo.space and — more importantly — rounding *up* favours the shipper. A FreightDesk-computed value will never under-bid the shipper's published floor. If a future shipper publishes a calculator that rounds differently, the schema accommodates a per-service rounding policy; until then, ceil is universal.

## Consequences

- The four copy fields populate the EVE dialog top-down without any user reordering. Verified end-to-end on launch day with real pastes.
- Reward/collateral parity with the reference shipper calculator is exact. The trust contract holds.
- Test fixtures pinned both behaviours: copy-block order is asserted in the e2e suite, `Math.ceil` is unit-tested against the specific collateral × pct values that surfaced the gap.
- If a future shipper publishes round-down behaviour, the schema needs a `rounding: ceil | floor | round` field on the formula. Defer until it actually happens.
