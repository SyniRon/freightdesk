import { useState } from "react";
import { daysSince, fmtISK, fmtISKFull, fmtVol, type Quote } from "../lib/logic";
import { Caret, Warn } from "./icons";

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
  return (
    <div
      className={
        "service-card " + (q.eligible ? "" : "is-blocked ") + (selected ? "is-selected" : "")
      }
      onClick={() => q.eligible && onSelect()}
      role={q.eligible ? "button" : undefined}
      tabIndex={q.eligible ? 0 : -1}
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
          <div className="svc-reward-k">Quoted reward</div>
          <div className="svc-reward-v mono">
            {q.eligible ? fmtISK(q.reward) + " ISK" : "—"}
          </div>
        </div>
      </div>

      <div className="svc-row-2">
        <div className="svc-cell">
          <span className="svc-k">Collateral</span>
          <span className="svc-v mono">
            {q.eligible ? fmtISK(q.collateral) + " ISK" : "—"}
          </span>
        </div>
        <div className="svc-cell">
          <span className="svc-k">Rate</span>
          <span className="svc-v mono">
            {q.route && q.breakdown.formula
              ? q.breakdown.formula.kind === "flat"
                ? "flat"
                : `${q.breakdown.formula.ratePerM3} / m³`
              : "—"}
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

      {q.eligible && q.breakdown.formula?.kind === "max" && (() => {
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

      {q.rushFee > 0 && q.eligible && (
        <label className="svc-rush" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={rushEnabled}
            onChange={(e) => setRushEnabled(e.target.checked)}
          />
          <span>Rush (+{fmtISK(q.rushFee)} ISK)</span>
        </label>
      )}

      {!q.eligible && (
        <div className="svc-blocked">
          <Warn />
          <span>{q.reasons.join(" · ")}</span>
        </div>
      )}

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

      {showCalc && q.breakdown.formula && (
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
  const anyEligible = quotes.some((q) => q.eligible);
  return (
    <section className="block">
      <header className="block-h">
        <div className="block-step">04</div>
        <div className="block-title">
          <h2>Service</h2>
          <p>
            {anyEligible
              ? "Pick a courier. Ineligible services are dimmed with the reason."
              : "No supported service covers this shipment."}
          </p>
        </div>
      </header>

      {anyEligible ? (
        <div className="services">
          {quotes
            .slice()
            .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.reward - b.reward)
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
            // Build a headline + sub-explanation based on the dominant reason across all services.
            const allReasons = quotes.flatMap((q) => q.reasons);
            const allVolume = allReasons.length > 0 && allReasons.every((r) => r.includes("Volume"));
            const allCollateral = allReasons.length > 0 && allReasons.every((r) => r.includes("Collateral"));
            const allRoute = allReasons.length > 0 && allReasons.every((r) => r.toLowerCase().includes("route"));
            if (allVolume) {
              return (
                <>
                  <div className="empty-svc-h">Cargo too large for any service</div>
                  <p>Reduce the shipment size or split into multiple contracts. Every configured courier caps volume below your current load.</p>
                </>
              );
            }
            if (allCollateral) {
              return (
                <>
                  <div className="empty-svc-h">Cargo value too high for any service</div>
                  <p>Split into multiple contracts or move expensive items separately — every configured courier caps collateral below your shipment value.</p>
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
