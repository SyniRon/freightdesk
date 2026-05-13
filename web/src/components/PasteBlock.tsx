import { fmtISK, fmtInt, fmtVol, type ParseResult } from "../lib/logic";
import { Dot, Warn } from "./icons";

interface PasteBlockProps {
  raw: string;
  setRaw: (raw: string) => void;
  parse: ParseResult;
  onLoadExample: () => void;
  itemsLoading?: boolean;
  itemsError?: string | null;
  pricesLoading?: boolean;
  pricesError?: "rate-limited" | "server-error" | "network" | null;
}

export function PasteBlock({ raw, setRaw, parse, onLoadExample, itemsLoading, itemsError, pricesLoading, pricesError }: PasteBlockProps) {
  const items = parse.matched.length + parse.unmatched.length;
  return (
    <section className="block paste-block">
      <header className="block-h">
        <div className="block-step">01</div>
        <div className="block-title">
          <h2>Paste your hangar</h2>
          <p>
            Select items in-game → right-click → <em>Copy to Clipboard</em>, then paste below.
          </p>
        </div>
        <div className="block-actions">
          {!raw && (
            <button className="btn-ghost" onClick={onLoadExample} disabled={!!itemsLoading}>
              Load example
            </button>
          )}
          {raw && (
            <button className="btn-ghost" onClick={() => setRaw("")}>
              Clear
            </button>
          )}
        </div>
      </header>

      <div className="paste-wrap">
        <textarea
          className="paste-area"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"Drake\t2\nLarge Shield Extender II\t12\nPLEX\t500\n…"}
          spellCheck={false}
          disabled={!!itemsLoading}
        />
        <div className="paste-meter">
          <div className="meter-cell">
            <span className="meter-k">Items</span>
            <span className="meter-v mono">{fmtInt(items)}</span>
          </div>
          <div className="meter-cell">
            <span className="meter-k">Volume</span>
            <span className="meter-v mono">{fmtVol(parse.totalVol)}</span>
          </div>
          <div className={"meter-cell " + (pricesError ? "meter-warn" : "")}>
            <span className="meter-k">
              {pricesError ? <><Warn /> Pricing</> : "Est. value"}
            </span>
            <span className={"meter-v mono " + (pricesLoading ? "dim" : "")}>
              {pricesError
                ? (pricesError === "rate-limited" ? "rate-limited" : pricesError === "server-error" ? "unavailable" : "offline")
                : `${fmtISK(parse.totalValue)} ISK${pricesLoading ? " …" : ""}`}
            </span>
          </div>
          {parse.unmatched.length > 0 && (
            <div className="meter-cell meter-warn">
              <span className="meter-k">
                <Warn /> Unmatched
              </span>
              <span className="meter-v mono">{parse.unmatched.length}</span>
            </div>
          )}
        </div>
      </div>

      <div className="privacy">
        {itemsError ? (
          <>
            <Warn />
            <span>Couldn't load items database — {itemsError}. Refresh the page.</span>
          </>
        ) : itemsLoading ? (
          <>
            <Dot style={{ color: "var(--accent)" }} />
            <span>Loading item database…</span>
          </>
        ) : (
          <>
            <Dot style={{ color: "var(--ok)" }} />
            <span>Your hangar list never leaves this browser. Parsing and pricing run client-side.</span>
          </>
        )}
      </div>
    </section>
  );
}
