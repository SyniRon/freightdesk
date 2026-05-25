# PLEX Shipping

FreightDesk will not special-case PLEX (type ID 44992) — not for pricing, not for warnings, not for any other ergonomic affordance. Real shipping clients do not contract PLEX, and the calculator should not act as if they might.

## Why this is out of scope

PLEX is held in the per-account **PLEX Vault**, an account-wide storage that does not appear in hangar pastes and cannot be contracted as a physical inventory item. The only way to have PLEX as a physical item in a contract is to deliberately undock it as inventory — a well-known antipattern in EVE that almost exclusively shows up on lossmails. There is no legitimate shipping workflow that involves PLEX as a contracted item.

Because PLEX is the only commonly-discussed item that lives on the **New Eden global market (region 19000001)** rather than The Forge / Jita, it surfaces in the calculator as a "no price data → critical warning" when someone pastes it. That warning is technically incorrect — Fuzzwork *does* have PLEX prices, just from a different region — but it is correct in spirit: this paste should not be happening.

A trivial fix exists (per-type region override map in the Fuzzwork pricing client, ~30 minutes of work). We are choosing not to ship it. Making PLEX-shipping ergonomic would imply the project endorses the workflow, which it does not. The visible warning is a feature, not a bug.

## When to reconsider

Reopen the question only if a real shipping client reports concrete friction — for example, a public-service shipper (Red Frog, PushX, or similar) takes PLEX contracts in practice and a real user hits the warning. Theoretical generality (e.g. "what if someone wants to ship PLEX?") does not clear the bar. The shape of the report should be "this happened, here is the contract" rather than "this could happen."

## Prior requests

- #19 — "PLEX pricing special-case (New Eden market, not Jita)"
