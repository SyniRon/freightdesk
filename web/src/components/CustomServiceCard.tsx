import { fmtISK, parseShorthand, type Quote } from "../lib/logic";
import { Warn } from "./icons";

interface CustomServiceCardProps {
  // The synthetic-service quote computed from the inputs below (ADR 0012), or
  // undefined when no rate is set yet (nothing to price).
  quote: Quote | undefined;
  rate: string;
  setRate: (v: string) => void;
  collateralPct: string;
  setCollateralPct: (v: string) => void;
  recipient: string;
  setRecipient: (v: string) => void;
  // Catalog corp-name strings seeding the Recipient combobox (bridges catalog lag).
  recipientOptions: string[];
}

export function CustomServiceCard({
  quote,
  rate,
  setRate,
  collateralPct,
  setCollateralPct,
  recipient,
  setRecipient,
  recipientOptions,
}: CustomServiceCardProps) {
  const rateNum = parseShorthand(rate);
  // A quote prices the route only when it produces a positive reward. A zero
  // reward means empty/zero-volume cargo (e.g. only unrecognized item names
  // pasted: totalVol === 0 → reward = 0 × rate), which must NOT read as a
  // confident "0 ISK" copyable quote (finding #1). Gate priced (and therefore
  // copyability via selectedQuote) on reward > 0.
  const hasRate = rateNum != null;
  const priced = !!quote && hasRate && quote.reward > 0;
  // Distinguish "no rate yet" from "rate set but nothing to price" so the note
  // tells the user the right next step.
  const zeroCargo = !!quote && hasRate && quote.reward <= 0;
  // A collateral-% was entered but the cargo's collateral is unknown (0) — the
  // `max` formula silently fell back to the rate leg, so the percent did
  // nothing. Surface it rather than letting the user think they priced on
  // collateral (finding #2).
  const collPctNum = parseShorthand(collateralPct);
  const collateralInert = !!quote && collPctNum != null && quote.collateral <= 0;
  return (
    <div className="service-card is-custom is-selected">
      <div className="svc-row-1">
        <div className="svc-id">
          <div>
            <div className="svc-name">
              Custom service <span className="svc-custom-badge">your own rate</span>
            </div>
            <div className="svc-tag">
              No catalog courier covers this route — price it with your own rate.
            </div>
          </div>
        </div>
        <div className="svc-reward">
          <div className="svc-reward-k">Quoted reward</div>
          <div className="svc-reward-v mono">{priced ? fmtISK(quote!.reward) + " ISK" : "—"}</div>
        </div>
      </div>

      <div className="svc-custom-inputs">
        <label className="svc-custom-field">
          <span className="svc-k">Rate (per m³)</span>
          <input
            className="svc-custom-input mono"
            inputMode="decimal"
            placeholder="e.g. 800"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            aria-label="Custom rate per m³"
          />
        </label>
        <label className="svc-custom-field">
          <span className="svc-k">Collateral % (optional)</span>
          <input
            className="svc-custom-input mono"
            inputMode="decimal"
            placeholder="e.g. 0.5"
            value={collateralPct}
            onChange={(e) => setCollateralPct(e.target.value)}
            aria-label="Custom collateral percent"
          />
        </label>
        <label className="svc-custom-field">
          <span className="svc-k">Recipient (optional)</span>
          <input
            className="svc-custom-input"
            list="custom-recipient-options"
            placeholder="Public contract — leave blank"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            aria-label="Recipient / Issue To"
          />
          <datalist id="custom-recipient-options">
            {recipientOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      </div>

      {!priced && (
        <div className="svc-coll-note">
          <Warn />{" "}
          {zeroCargo
            ? "Paste cargo to price this route."
            : "Set a per-m³ rate to price this route."}
        </div>
      )}

      {collateralInert && (
        <div className="svc-coll-note">
          <Warn /> Collateral is unknown for this cargo — the collateral % is
          inert and the route is priced on the rate alone.
        </div>
      )}
    </div>
  );
}
