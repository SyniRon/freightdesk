import { useState } from "react";
import { daysSince, fmtISK, fmtISKFull, fmtVol, type Quote } from "../lib/logic";
import { Caret, Warn } from "./icons";

// Inline "override" tag for a card line whose value comes from a direct
// override rather than market data (issue #39). Reuses the established
// advisory tag treatment (the `stale` tag), not a new visual language.
function OverrideTag() {
  return (
    <span
      className="stale-tag override-tag"
      title="This value comes from a manual override in Settings, not market data."
    >
      {" "}override
    </span>
  );
}

// A splittable quote renders as a visible card (selectable, like eligible) but
// swaps the copy/selection affordances for a read-only over-cap advisory.
// Eligible and splittable are both "shown as a card" states; only ineligible
// dims and routes to the empty state. ADR 0010.
const isShown = (q: Quote) => q.status !== "ineligible";

interface ServiceCardProps {
  q: Quote;
  selected: boolean;
  onSelect: () => void;
  rushEnabled: boolean;
  setRushEnabled: (v: boolean) => void;
}

function ServiceCard({ q, selected, onSelect, rushEnabled, setRushEnabled }: ServiceCardProps) {
  const [showCalc, setShowCalc] = useState(false);
  const stale = daysSince(q.service.updated) > 30;
  const shown = q.status !== "ineligible";
  const splittable = q.status === "splittable";
  return (
    <div
      className={
        "service-card " +
        (shown ? "" : "is-blocked ") +
        (splittable ? "is-splittable " : "") +
        (selected ? "is-selected" : "")
      }
      onClick={() => shown && onSelect()}
      role={shown ? "button" : undefined}
      tabIndex={shown ? 0 : -1}
    >
      <div className="svc-row-1">
        <div className="svc-id">
          <div className="svc-radio">{selected && <span className="svc-radio-dot" />}</div>
          <div>
            <div className="svc-name">{q.service.name}</div>
            <div className="svc-tag">{q.service.tagline}</div>
          </div>
        </div>
        <div className="svc-reward">
          <div className="svc-reward-k">{splittable ? "All-in across splits" : "Quoted reward"}</div>
          <div className="svc-reward-v mono">
            {q.status === "eligible"
              ? fmtISK(q.reward) + " ISK"
              : splittable
                ? fmtISK(q.split!.allInCost) + " ISK"
                : "—"}
          </div>
          {shown && q.overridden.vol && (
            <div className="svc-reward-override mono">
              <span className="svc-struck">{fmtVol(q.market.vol)}</span> {fmtVol(q.vol)}
              <OverrideTag />
            </div>
          )}
        </div>
      </div>

      <div className="svc-row-2">
        <div className="svc-cell">
          <span className="svc-k">Collateral</span>
          <span className="svc-v mono">
            {!shown ? (
              "—"
            ) : q.overridden.collateral ? (
              <>
                <span className="svc-struck">{fmtISK(q.market.collateral) + " ISK"}</span>{" "}
                {fmtISK(q.collateral) + " ISK"}
                <OverrideTag />
              </>
            ) : (
              fmtISK(q.collateral) + " ISK"
            )}
          </span>
        </div>
        <div className="svc-cell">
          <span className="svc-k">Rate</span>
          <span className="svc-v mono">
            {q.route && q.breakdown.formula ? (
              q.breakdown.formula.kind === "flat" ? (
                "flat"
              ) : q.overridden.rate ? (
                <>
                  <span className="svc-struck">{`${q.market.ratePerM3} / m³`}</span>{" "}
                  {`${q.ratePerM3} / m³`}
                  <OverrideTag />
                </>
              ) : (
                `${q.breakdown.formula.ratePerM3} / m³`
              )
            ) : (
              "—"
            )}
          </span>
        </div>
        <div className="svc-cell">
          <span className="svc-k">Rates updated</span>
          <span className={"svc-v mono " + (stale ? "is-stale" : "")}>
            {q.service.updated}
            {stale && <span className="stale-tag"> stale</span>}
          </span>
        </div>
      </div>

      {splittable && q.split && (
        <div className="svc-split">
          <div className="svc-split-h">
            <Warn /> Over cap — ship as {q.split.n} contracts
          </div>
          <p className="svc-split-body">
            This load exceeds the service caps. Split it into <b>{q.split.n}</b> even
            contracts of roughly <span className="mono">{fmtVol(q.split.perContractVol)}</span> and{" "}
            <span className="mono">{fmtISK(q.split.perContractCollateral)} ISK</span> collateral each.
            The total above is the honest all-in cost across all {q.split.n} contracts
            {q.rushApplied ? " (rush included on each)" : ""}.
          </p>
          <p className="svc-split-note dim">
            Keep collateral balanced across the contracts — EVE has no paste target for
            a per-contract item list, so you choose the items in-game; FreightDesk can
            only advise the split, not hand you a manifest.
          </p>
        </div>
      )}

      {q.status === "eligible" && q.breakdown.formula?.kind === "max" && (() => {
        const f = q.breakdown.formula;
        const volPart = q.vol * f.ratePerM3;
        const collPart = q.collateral * f.collateralPct;
        if (collPart <= volPart) return null;
        return (
          <div className="svc-coll-note">
            <Warn /> Rate driven by shipment value, not volume — high-value cargo costs more on this route.
          </div>
        );
      })()}

      {q.status === "eligible" && q.breakdown.formula?.kind === "clamped-rate" && q.breakdown.formula.collateralPct != null && (() => {
        const f = q.breakdown.formula;
        const clamped = Math.min(Math.max(q.vol * f.ratePerM3, f.floor), f.fullLoad);
        const collPart = q.collateral * f.collateralPct!;
        if (collPart <= clamped) return null;
        return (
          <div className="svc-coll-note">
            <Warn /> Rate driven by shipment value, not volume — high-value cargo costs more on this route.
          </div>
        );
      })()}

      {q.status === "eligible" && q.breakdown.flooredToMinimum && (
        <div className="svc-coll-note">
          <Warn /> This shipment is too small — the shipper's minimum reward applies instead of the per-volume rate.
        </div>
      )}

      {q.rushFee > 0 && shown && (
        <label className="svc-rush" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={rushEnabled}
            onChange={(e) => setRushEnabled(e.target.checked)}
          />
          <span>Rush (+{fmtISK(q.rushFee)} ISK)</span>
        </label>
      )}

      {q.status === "ineligible" && (
        <div className="svc-blocked">
          <Warn />
          <span>{q.reasons.join(" · ")}</span>
        </div>
      )}

      {!splittable && (
        <button
          className="svc-calc-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setShowCalc((s) => !s);
          }}
        >
          {showCalc ? "Hide calculation" : "Show calculation"}{" "}
          <Caret style={{ transform: showCalc ? "rotate(180deg)" : "" }} />
        </button>
      )}

      {!splittable && showCalc && q.breakdown.formula && (
        <div className="svc-calc mono">
          {q.breakdown.formula.kind === "sum" && (
            <>
              <div><span className="dim">volume</span> {fmtVol(q.vol)} × {q.breakdown.formula.ratePerM3}/m³ = {fmtISKFull(q.vol * q.breakdown.formula.ratePerM3)}</div>
              <div><span className="dim">collateral</span> {fmtISKFull(q.collateral)} × {(q.breakdown.formula.collateralPct * 100).toFixed(2)}% = {fmtISKFull(q.collateral * q.breakdown.formula.collateralPct)}</div>
              <div className="svc-calc-sum"><span className="dim">sum</span> = {fmtISKFull(q.breakdown.formulaResult)}</div>
            </>
          )}
          {q.breakdown.formula.kind === "max" && (() => {
            const f = q.breakdown.formula;
            const volPart = q.vol * f.ratePerM3;
            const collPart = q.collateral * f.collateralPct;
            const volWins = volPart >= collPart;
            return (
              <>
                <div className={volWins ? "" : "dim"}>
                  <span className="dim">volume</span> {fmtVol(q.vol)} × {f.ratePerM3}/m³ = {fmtISKFull(volPart)}
                  {volWins && " ← wins"}
                </div>
                <div className={volWins ? "dim" : ""}>
                  <span className="dim">collateral</span> {fmtISKFull(q.collateral)} × {(f.collateralPct * 100).toFixed(2)}% = {fmtISKFull(collPart)}
                  {!volWins && " ← wins"}
                </div>
                <div className="svc-calc-sum"><span className="dim">max</span> = {fmtISKFull(q.breakdown.formulaResult)}</div>
              </>
            );
          })()}
          {q.breakdown.formula.kind === "rate-only" && (
            <div className="svc-calc-sum"><span className="dim">volume</span> {fmtVol(q.vol)} × {q.breakdown.formula.ratePerM3}/m³ = <b>{fmtISKFull(q.breakdown.formulaResult)}</b></div>
          )}
          {q.breakdown.formula.kind === "flat" && (
            <div className="svc-calc-sum"><span className="dim">flat</span> = <b>{fmtISKFull(q.breakdown.formula.reward)}</b></div>
          )}
          {q.breakdown.formula.kind === "clamped-rate" && (() => {
            const f = q.breakdown.formula;
            const raw = q.vol * f.ratePerM3;
            const clamped = Math.min(Math.max(raw, f.floor), f.fullLoad);
            const collPart = f.collateralPct != null ? q.collateral * f.collateralPct : 0;
            const collWins = f.collateralPct != null && collPart > clamped;
            return (
              <>
                <div className={collWins ? "dim" : ""}>
                  <span className="dim">volume</span> {fmtVol(q.vol)} × {f.ratePerM3}/m³ = {fmtISKFull(raw)} → clamp [{fmtISK(f.floor)}, {fmtISK(f.fullLoad)}] = {fmtISKFull(clamped)}
                  {f.collateralPct != null && !collWins && " ← wins"}
                </div>
                {f.collateralPct != null && (
                  <div className={collWins ? "" : "dim"}>
                    <span className="dim">collateral</span> {fmtISKFull(q.collateral)} × {(f.collateralPct * 100).toFixed(2)}% = {fmtISKFull(collPart)}
                    {collWins && " ← wins"}
                  </div>
                )}
                <div className="svc-calc-sum"><span className="dim">{f.collateralPct != null ? "max" : "reward"}</span> = <b>{fmtISKFull(q.breakdown.formulaResult)}</b></div>
              </>
            );
          })()}
          <div className="svc-calc-sum"><span className="dim">reward</span> max({fmtISKFull(q.breakdown.minReward)}, formula){q.breakdown.rushAdded > 0 && ` + ${fmtISKFull(q.breakdown.rushAdded)} rush`} = <b>{fmtISKFull(q.reward)}</b></div>
        </div>
      )}
    </div>
  );
}

interface ServicePickerProps {
  quotes: Quote[];
  selectedId: string | undefined;
  setSelectedId: (id: string) => void;
  rushEnabled: boolean;
  setRushEnabled: (v: boolean) => void;
}

export function ServicePicker({ quotes, selectedId, setSelectedId, rushEnabled, setRushEnabled }: ServicePickerProps) {
  // A card is shown for eligible AND splittable; only all-ineligible drops to
  // the empty state (ADR 0010). Eligible sorts ahead of splittable.
  const anyShown = quotes.some(isShown);
  const rank = (q: Quote) => (q.status === "eligible" ? 2 : q.status === "splittable" ? 1 : 0);
  const cost = (q: Quote) => (q.status === "splittable" ? q.split!.allInCost : q.reward);
  return (
    <section className="block">
      <header className="block-h">
        <div className="block-step">04</div>
        <div className="block-title">
          <h2>Service</h2>
          <p>
            {anyShown
              ? "Pick a courier. Over-cap services show a split advisory; ineligible ones are dimmed with the reason."
              : "No supported service covers this shipment."}
          </p>
        </div>
      </header>

      {anyShown ? (
        <div className="services">
          {quotes
            .slice()
            .sort((a, b) => rank(b) - rank(a) || cost(a) - cost(b))
            .map((q) => (
              <ServiceCard
                key={q.service.id}
                q={q}
                selected={selectedId === q.service.id}
                onSelect={() => setSelectedId(q.service.id)}
                rushEnabled={rushEnabled}
                setRushEnabled={setRushEnabled}
              />
            ))}
        </div>
      ) : (
        <div className="empty-svc">
          {(() => {
            // Empty state fires only when every service is ineligible (ADR 0010):
            // cap-exceeded loads are now splittable and render as cards. The
            // remaining ineligible causes are route mismatch, or an indivisible
            // unit too large/valuable to fit any single contract.
            const allReasons = quotes.flatMap((q) => q.reasons);
            const allRoute = allReasons.length > 0 && allReasons.every((r) => r.toLowerCase().includes("route") || r.toLowerCase().includes("custom"));
            const allUnit = allReasons.length > 0 && allReasons.every((r) => /single item/i.test(r));
            if (allUnit) {
              return (
                <>
                  <div className="empty-svc-h">A single item can't fit any contract</div>
                  <p>One indivisible item exceeds every courier's per-contract volume or collateral cap. It can't be split across contracts — move it via a service with a larger cap.</p>
                </>
              );
            }
            if (allRoute) {
              return (
                <>
                  <div className="empty-svc-h">No service covers this route yet</div>
                  <p>None of the configured couriers ship this origin → destination pair. Use a known trade hub or alliance staging structure.</p>
                </>
              );
            }
            return (
              <>
                <div className="empty-svc-h">No supported service covers this shipment</div>
                <p>Mixed reasons across the configured couriers — see per-service detail below.</p>
              </>
            );
          })()}
          <ul className="empty-svc-list">
            {quotes.map((q) => (
              <li key={q.service.id}>
                <span className="dim">{q.service.name}</span> —{" "}
                {q.reasons.join(" · ") || "n/a"}
              </li>
            ))}
          </ul>
          <a className="link-arrow" href="#">
            Suggest a service on GitHub <span aria-hidden>↗</span>
          </a>
        </div>
      )}
    </section>
  );
}
