# Cross-Contract Collateral Balancing

FreightDesk will not add a multi-paste workspace, and will not offer per-contract
collateral rebalancing advice beyond the even-split target the over-cap advisory already
shows.

The request: let a capsuleer open N paste boxes, one per courier contract they intend to
create, paste a different item set into each, and have FreightDesk say *"move ~Z ISK of
collateral from box 2 to box 1 to drop your total reward by ~X."* Because the boxes would
be the manifest the user reproduces in-game, this is the only framing in which FreightDesk
could give item-level splitting advice at all — EVE has no paste target for a per-contract
item manifest, so the single-paste advisory can only ever advise.

The framing is sound. The advice it would produce is worth nothing.

## Why this is out of scope

### The optimal advice is already one sentence, and it already ships

For the `max` formula, the total across N contracts is:

```
Σ max(volᵢ × ratePerM3, collateralᵢ × collateralPct)
```

Subject to fixed totals `V` and `C`, the minimum of that sum is `max(V × ratePerM3,
C × collateralPct)` — and a capsuleer reaches it exactly when every contract carries the
same ISK per m³. There is no pairwise "move Z from box 2 to box 1" structure to discover.
There is one target density, and an even split of a homogeneous load hits it.

ADR 0010 already reached this conclusion, and the over-cap advisory already renders both
halves of it: the per-contract collateral target, and the instruction to keep collateral
balanced across the contracts. The multi-paste workspace would let a user *verify* a
division item by item. It would not produce different advice.

### Below the crossover, every division costs exactly the same

`max` changes branch at a fixed cargo density:

```
crossover = ratePerM3 / collateralPct        ISK per m³
```

Below it the volume branch binds in every contract, so the total is `V × ratePerM3` no
matter how the load is divided — rebalancing saves exactly zero. Above it the collateral
branch binds everywhere, and the total is `C × collateralPct` — again independent of the
division. **Rebalancing can only ever recover the gap created by a division that straddles
the crossover.**

For the catalog's collateral-sensitive route (`ratePerM3: 900`, `collateralPct: 0.005`,
`maxVol: 350000`) the crossover is 180,000 ISK/m³ — which is **63 B ISK of collateral in a
single full contract**. Best against worst division:

| Total volume | Total collateral | ISK/m³ | Best | Worst | Recoverable |
|---|---|---|---|---|---|
| 360,000 m³ | 1 B | 2,778 | 324 M | 324 M | **0** |
| 360,000 m³ | 10 B | 27,778 | 324 M | 365 M | 41 M |
| 500,000 m³ | 10 B | 20,000 | 450 M | 450 M | **0** |
| 700,000 m³ | 50 B | 71,429 | 630 M | 630 M | **0** |
| 700,000 m³ | 100 B | 142,857 | 630 M | 815 M | 185 M |

Real freight that exceeds a 350,000 m³ cap is bulk — ore, minerals, modules. Dense cargo
that clears 180,000 ISK/m³ does not come close to filling a freighter. A load has to be
simultaneously over the volume cap *and* carrying tens of billions in collateral before any
division of it costs more than any other.

The `clamped-rate` kind has the same collateral branch and the same crossover, with
`fullLoad` standing in for `ratePerM3 × maxVol`.

### The rush fee is larger than the prize

`rushFee` is charged per contract. On the catalog's collateral-sensitive route it is 250 M
ISK, so a two-contract split adds 500 M ISK. The largest recoverable amount anywhere near
realistic cargo density is a fraction of that. A feature that optimises the smaller term
while the larger one is set by a checkbox is not where the ISK is.

### It only bites on collateral-sensitive routes

A `rate-only` route ignores collateral entirely, and a `clamped-rate` route without
`collateralPct` does too. Their cost is invariant under any division. In the current
catalog that is half the routes, and both return legs.

### The build cost is not small

FreightDesk holds one parse. A multi-paste workspace changes that state model and
everything hanging off it: the overrides, the copy block (which box does the user copy?),
the settings persistence, and the custom-service path. The issue also carried three
unresolved design questions — whether it replaces or augments the single paste, how
per-box collateral is surfaced, and rebalance granularity — none of which need answering
if the answer they serve is worth zero ISK.

## When to reconsider

Reopen if a real over-cap shipment turns up carrying collateral above the crossover for the
route it is shipping on — roughly **50 B ISK and up** on the current catalog rates. That is
the only condition under which any division of a load costs more than another, and it is
therefore the only evidence that clears the bar.

Theoretical generality does not. "Someone might ship 100 B in a freighter" is the shape of
argument this file exists to answer; "here is the paste, here is what it cost" is the shape
that reopens it.

Note that the `paste-parsed` analytics event cannot currently answer this question — its
value bucket races the price fetch (#91). That defect should be fixed before anyone
concludes from telemetry that the condition never occurs.

## Prior requests

- #27 — "Multi-shipment workspace: paste N loads, get cross-contract collateral-balancing advice"
