import { useState } from "react";
import { daysSince, fmtISK, fmtISKFull, fmtVol, type Quote } from "../lib/logic";
import { Caret, Warn } from "./icons";

interface ServiceCardProps {
  q: Quote;
  selected: boolean;
  onSelect: () => void;
}

function ServiceCard({ q, selected, onSelect }: ServiceCardProps) {
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
          <span className="svc-k">ETA</span>
          <span className="svc-v mono">{q.service.etaHours}h</span>
        </div>
        <div className="svc-cell">
          <span className="svc-k">Rate</span>
          <span className="svc-v mono">{q.service.ratePerM3} / m³</span>
        </div>
        <div className="svc-cell">
          <span className="svc-k">Rates updated</span>
          <span className={"svc-v mono " + (stale ? "is-stale" : "")}>
            {q.service.updated}
            {stale && <span className="stale-tag"> stale</span>}
          </span>
        </div>
      </div>

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

      {showCalc && (
        <div className="svc-calc mono">
          <div>
            <span className="dim">volume</span> {fmtVol(q.vol)} × {q.service.ratePerM3}/m³ ={" "}
            {fmtISKFull(q.breakdown.volPart)}
          </div>
          <div>
            <span className="dim">collateral</span> {fmtISKFull(q.collateral)} ×{" "}
            {(q.service.collateralPct * 100).toFixed(2)}% = {fmtISKFull(q.breakdown.collPart)}
          </div>
          <div className="svc-calc-sum">
            <span className="dim">reward</span> max({fmtISKFull(q.breakdown.min)}, sum) ={" "}
            <b>{fmtISKFull(q.reward)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

interface ServicePickerProps {
  quotes: Quote[];
  selectedId: string | undefined;
  setSelectedId: (id: string) => void;
}

export function ServicePicker({ quotes, selectedId, setSelectedId }: ServicePickerProps) {
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
              />
            ))}
        </div>
      ) : (
        <div className="empty-svc">
          <div className="empty-svc-h">No supported service covers this route yet</div>
          <p>
            None of the configured couriers ship this origin → destination pair, or your shipment
            exceeds every provider's volume / collateral cap.
          </p>
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
