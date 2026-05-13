import { useClipboard, type ToastState } from "../lib/useClipboard";
import type { Location, Quote } from "../lib/logic";
import { Check, Copy } from "./icons";

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
}

export function ContractCopy({ quote, dest }: ContractCopyProps) {
  const [toast, copy] = useClipboard();
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

      <div className="copy-grid">
        <CopyRow
          label="Destination"
          value={dest.name}
          hint="exact station/structure string"
          copy={copy}
          toast={toast}
        />
        <CopyRow
          label="Shipper"
          value={quote.service.name}
          hint="paste into Recipient / Issue To field"
          copy={copy}
          toast={toast}
        />
        <CopyRow
          label="Reward"
          value={String(rew)}
          hint="ISK · paste into Reward field"
          copy={copy}
          toast={toast}
        />
        <CopyRow
          label="Collateral"
          value={String(coll)}
          hint="ISK · paste into Collateral field"
          copy={copy}
          toast={toast}
        />
      </div>

      <div className="copy-foot">
        <div>
          <span className="dim">Volume</span> <span className="mono">{vol} m³</span>
        </div>
        <div>
          <span className="dim">Days to complete</span>{" "}
          <span className="mono">{Math.ceil(quote.service.etaHours / 24) + 1}</span>
          <span className="sep">·</span>
          <span className="dim">Expiration</span> <span className="mono">14 days</span>
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
