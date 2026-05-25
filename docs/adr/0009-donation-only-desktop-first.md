# ADR 0009: Donation-only monetisation; desktop-first UX

**Status:** Accepted (2026-05-13)

## Context

Two product-positioning decisions that constrain feature scope.

### Monetisation

CCP Games' Developer License Agreement for third-party EVE tools prohibits selling the tool, charging subscription fees, or running advertising tied to EVE content. Indirect monetisation paths (premium tiers locked behind login, "pro features", paid affiliate links to in-game services) all read as violations and risk having the app's API access revoked.

The viable revenue surface is in-game ISK donations — the EVE community has a well-established norm of tipping useful third-party tools by sending ISK to a named in-game corporation or character. Real-world money is off the table.

### Form factor

EVE Online is a desktop game. The hangar-paste workflow specifically is a desktop ritual — paste from one Windows window into another. Mobile traffic is real (players checking market data from phones) but for *this* tool's primary loop it is at best a corner case.

## Decision

**Donation only.** No paywalls, no premium tiers, no affiliate angles, no advertising. A single tip-jar surface in the About footer naming a specific in-game donee corporation (`Delve Time Unit Expenditures`). Copying the tip-jar string fires a `tip-copy` event so donation-button engagement is observable.

**Desktop-first.** Layout, density, and interaction patterns are designed for a mouse-and-keyboard cursor on a 1280px+ viewport. Mobile-graceful is fine — the page should remain readable and the copy buttons should still function. Mobile-first is not a design constraint and will not be invoked to override a desktop-optimal layout.

## Consequences

- The product cannot be a primary income source. Acceptable — that was never the goal.
- Feature ideas that depend on monetisation (gated alliance-structure databases, "subscribe to rate updates", branded shipper marketing slots) are out of scope without re-litigating this ADR.
- The CSS already respects `data-density` and `data-layout` attributes on `<html>` (carried over from the original Claude Design pass) — re-adding mobile-optimised variants in the future is a low-friction change if the audience composition shifts materially. But "responsive defaults are fine" is the bar; "rebuild for mobile" is not.
- Removing the in-game-jargon "o7" from the post-copy toast was a deliberate consequence of this ADR's framing: the donation surface is one of the few touchpoints that non-EVE-fluent visitors might reach, and friendliness there is load-bearing.
