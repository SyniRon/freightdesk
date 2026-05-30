# ADR 0010: Over-cap shipments get an advisory, not an auto-built manifest

**Status:** Accepted (2026-05-29)

## Context

When a paste exceeds a service's `maxVol` or `maxCollateral`, the MVP treated the
service as ineligible: it pushed a string into `quote.reasons`, flipped
`eligible: false`, and (since ADFU is the only service) dropped the user into the
global "Cargo too large for any service" empty state. Issue #14 asked whether we
could instead compute the split automatically and produce "N sets of copy-buttons,
one per sub-contract."

Grilling the design surfaced two facts that reshape what's worth building:

1. **EVE has no paste target for a per-contract item manifest.** A courier
   contract's item set is chosen in-game (select-in-hangar → Create Contract, or
   tick items from the in-window list). There is nowhere to paste a "put these
   items in contract 2" list. So a manifest split — the appealing version where we
   assign specific stacks to specific contracts — cannot be *executed* by the user
   even if we compute it perfectly. Copy buttons for per-contract values are
   theater: under an even split every sub-contract is identical anyway, and
   reproducing identical numbers across N hand-built contracts is exactly the
   tedium FreightDesk exists to kill.

2. **Splitting never beats a single contract; it only adds cost.** For the `max`
   formula, `Σ max(Vᵢ·r, Cᵢ·p) ≥ max(ΣVᵢ·r, ΣCᵢ·p)` by super-additivity — no
   partition beats the (illegal, over-cap) single contract. `sum` / `rate-only` /
   `flat` are invariant to how you split. And every extra contract adds its own
   `rushFee` (N×250M on a rush) and can each hit the `minReward` floor. So there is
   no "split to save money" — splitting is a cost forced by a cap. Item-to-contract
   *assignment* does matter for the `max` formula (balancing collateral across the
   forced contracts claws cost back down to the single-contract floor), but
   realizing that requires manifest control we can't deliver.

## Decision

Over-cap is promoted to a **first-class `splittable` state**, distinct from
`ineligible`. `Quote` becomes tri-state — `eligible` / `splittable` / `ineligible` —
replacing the boolean-plus-magic-string conflation. A `splittable` service stays
**visible as a card** carrying a pure **advisory**, never copy buttons:

- `N = max(ceil(vol / maxVol), ceil(collateral / maxCollateral))` contracts.
- A single **all-in total cost**, rush-aware (respects the rush toggle, charged
  ×N) and including per-contract `minReward` floors — the honest number, no
  savings comparison.
- Approximate per-contract targets (`vol/N`, `collateral/N`) as informational text.
- A qualitative "keep collateral balanced across contracts" note — no figure.

Even division is the advised split (not pack-to-cap): simpler, and for `max` it is
the cost-optimal balance. `ineligible` now means only "no route matches" or "no
per-contract piece can ever fit" (e.g. a single item above a collateral cap).

## Consequences

- The `Quote` model and the eligibility sort in `ServicePicker` change; over-cap no
  longer routes to the global empty state. This is the correct fix for an original
  conflation, not scope creep.
- Multi-service v1 (Red Frog, PushX) gets per-service advisories for free — each
  over-cap service shows *its own* N and cost rather than silently vanishing.
- We explicitly do **not** ship manifest splitting or cost-balancing guidance. The
  cross-shipment balancing idea — a multi-paste workspace where the user owns the
  partition (so the boxes *are* the manifest) and we advise "move ~Z ISK from box 2
  to box 1" — is the only framing where balancing becomes deliverable, and is
  tracked as a separate future issue.
