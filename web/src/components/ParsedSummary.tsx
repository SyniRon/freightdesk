import { useState } from "react";
import { fmtISK, fmtInt, fmtVol, type ParseResult } from "../lib/logic";
import { Caret, Warn } from "./icons";

interface ParsedSummaryProps {
  parse: ParseResult;
}

export function ParsedSummary({ parse }: ParsedSummaryProps) {
  const [open, setOpen] = useState(true);
  if (parse.matched.length === 0 && parse.unmatched.length === 0) return null;
  return (
    <section className="block">
      <header className="block-h">
        <div className="block-step">02</div>
        <div className="block-title">
          <h2>Parsed cargo</h2>
          <p>
            {fmtInt(parse.matched.length)} line{parse.matched.length === 1 ? "" : "s"} matched · total{" "}
            <span className="mono">{fmtVol(parse.totalVol)}</span>
            {(() => {
              const noPriceCount = parse.matched.filter((r) => r.price === 0).length;
              return noPriceCount > 0 ? (
                <>
                  {" · "}
                  <span style={{ color: "var(--warn)" }}>
                    {noPriceCount} item{noPriceCount === 1 ? "" : "s"} missing price data
                  </span>
                </>
              ) : null;
            })()}
          </p>
        </div>
        <div className="block-actions">
          <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Collapse" : "Expand"} <Caret style={{ transform: open ? "rotate(180deg)" : "" }} />
          </button>
        </div>
      </header>
      {open && (
        <div className="cargo-table">
          <div className="cargo-row cargo-head">
            <span>Item</span>
            <span className="num">Qty</span>
            <span className="num">m³ / unit</span>
            <span className="num">Subtotal m³</span>
            <span className="num">Subtotal ISK</span>
          </div>
          {parse.matched.map((r) => {
            const noPrice = r.price === 0;
            return (
              <div className={"cargo-row " + (noPrice ? "cargo-warn" : "")} key={r.key}>
                <span className="cargo-name">{r.name}</span>
                <span className="num mono">{fmtInt(r.qty)}</span>
                <span className="num mono dim">
                  {r.vol.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                </span>
                <span className="num mono">{fmtVol(r.vol * r.qty)}</span>
                <span className="num mono dim">
                  {noPrice ? "no price data" : fmtISK(r.price * r.qty)}
                </span>
              </div>
            );
          })}
          {parse.unmatched.length > 0 && (
            <>
              <div className="cargo-sep">
                <Warn /> {parse.unmatched.length} unmatched line
                {parse.unmatched.length === 1 ? "" : "s"} — won't ship until fixed
              </div>
              {parse.unmatched.map((r, i) => (
                <div className="cargo-row cargo-bad" key={i}>
                  <span className="cargo-name">{r.name}</span>
                  <span className="num mono">{r.qty}</span>
                  <span className="num dim">—</span>
                  <span className="num dim">—</span>
                  <span className="num dim">no typeID match</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
