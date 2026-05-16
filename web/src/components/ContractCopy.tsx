import { useClipboard, type ToastState } from "../lib/useClipboard";
import type { Location, Quote } from "../lib/logic";
import { track } from "../lib/analytics";
import { Check, Copy, Warn } from "./icons";

interface CopyRowProps {
  label: string;
  value: string;
  hint?: string;
  copy: (value: string, label: string) => void;
  toast: ToastState | null;
}

function CopyRow({ label, value, hint, copy, toast }: CopyRowProps) {
  const just = toast && toast.value === value;
  return (
    <button
      className={"copy-row " + (just ? "is-copied" : "")}
      onClick={() => copy(value, label)}
    >
      <div className="copy-l">
        <div className="copy-k">{label}</div>
        <div className="copy-v mono">{value}</div>
        {hint && <div className="copy-hint">{hint}</div>}
      </div>
      <div className="copy-r">
        {just ? (
          <>
            <Check /> Copied
          </>
        ) : (
          <>
            <Copy /> Copy
          </>
        )}
      </div>
    </button>
  );
}

interface ContractCopyProps {
  quote: Quote | undefined;
  origin: Location;
  dest: Location;
  warnings: { unmatched: number; noPriceItems: number };
}

export function ContractCopy({ quote, origin, dest, warnings }: ContractCopyProps) {
  const [toast, copy] = useClipboard();
  const trackedCopy = (value: string, label: string) => {
    copy(value, label);
    if (quote && quote.eligible) {
      track("copy", {
        field: label.toLowerCase(),
        service: quote.service.id,
        route: `${origin.id}->${dest.id}`,
        rushApplied: quote.rushApplied,
      });
    }
  };
  if (!quote || !quote.eligible) {
    return (
      <section className="block copy-block is-empty">
        <header className="block-h">
          <div className="block-step">05</div>
          <div className="block-title">
            <h2>Contract values</h2>
            <p>Select an eligible service to reveal the copy strings.</p>
          </div>
        </header>
        <div className="copy-placeholder">awaiting service selection</div>
      </section>
    );
  }
  const vol = Math.round(quote.vol * 100) / 100;
  const coll = Math.round(quote.collateral);
  const rew = Math.round(quote.reward);
  return (
    <section className="block copy-block">
      <header className="block-h">
        <div className="block-step">05</div>
        <div className="block-title">
          <h2>Contract values</h2>
          <p>Paste these directly into EVE's Create Contract window. Match the field order.</p>
        </div>
      </header>

      {(warnings.unmatched > 0 || warnings.noPriceItems > 0) && (
        <div className="copy-critical-warn">
          <Warn />
          <div>
            <strong>Contract values may be inaccurate:</strong>
            {warnings.unmatched > 0 && (
              <div>{warnings.unmatched} unmatched line{warnings.unmatched === 1 ? "" : "s"} — volume incomplete, total m³ undercounted.</div>
            )}
            {warnings.noPriceItems > 0 && (
              <div>{warnings.noPriceItems} item{warnings.noPriceItems === 1 ? "" : "s"} missing price data — collateral undervalued. Review parsed cargo above or adjust the collateral % in settings.</div>
            )}
          </div>
        </div>
      )}

      <div className="copy-grid">
        <CopyRow
          label="Shipper"
          value={quote.service.name}
          hint="paste into Recipient / Issue To field"
          copy={trackedCopy}
          toast={toast}
        />
        <CopyRow
          label="Destination"
          value={dest.name}
          hint="exact station/structure string"
          copy={trackedCopy}
          toast={toast}
        />
        <CopyRow
          label="Reward"
          value={String(rew)}
          hint="ISK · paste into Reward field"
          copy={trackedCopy}
          toast={toast}
        />
        <CopyRow
          label="Collateral"
          value={String(coll)}
          hint="ISK · paste into Collateral field"
          copy={trackedCopy}
          toast={toast}
        />
      </div>

      {quote.service.contract && (
        <div className="copy-contract-meta">
          <h3 className="copy-contract-meta-h">EVE contract window settings</h3>
          <dl>
            <div>
              <dt>Expiration</dt>
              <dd className="mono">{quote.service.contract.expiration}</dd>
            </div>
            <div>
              <dt>Days to complete</dt>
              <dd className="mono">{quote.service.contract.daysToComplete}</dd>
            </div>
            {quote.service.contract.descriptionHint && (
              <div>
                <dt>Description</dt>
                <dd className="mono">{quote.service.contract.descriptionHint}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="copy-foot">
        <div>
          <span className="dim">Volume</span> <span className="mono">{vol} m³</span>
        </div>
      </div>

      {toast && (
        <div className="toast">
          <Check /> {toast.label} copied
        </div>
      )}
    </section>
  );
}
