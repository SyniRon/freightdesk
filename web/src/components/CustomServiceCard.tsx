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
  const priced = !!quote && rateNum != null;
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
          <Warn /> Set a per-m³ rate to price this route.
        </div>
      )}
    </div>
  );
}
