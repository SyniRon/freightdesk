import { Dot } from "./icons";

interface EmptyStateProps {
  onLoadExample: () => void;
}

export function EmptyState({ onLoadExample }: EmptyStateProps) {
  return (
    <section className="empty-hero">
      <div className="empty-eye">step 01</div>
      <h2>Paste your hangar to start.</h2>
      <p>
        FreightDesk takes the format EVE puts on your clipboard when you select items and pick
        <em> Copy to Clipboard</em>. We figure out volume, value, and which courier fits — you get
        four strings to paste into the contract window.
      </p>
      <div className="empty-example">
        <div className="empty-example-h mono">example paste</div>
        <pre className="mono">
          {"Drake\t2\nLarge Shield Extender II\t12\nPLEX\t500"}
        </pre>
        <button className="btn-primary" onClick={onLoadExample}>
          Load example into paste box
        </button>
      </div>
      <div className="empty-bullets">
        <div>
          <Dot style={{ color: "var(--ok)" }} /> Client-side parsing — your hangar list never leaves
          the browser.
        </div>
        <div>
          <Dot style={{ color: "var(--accent)" }} /> Open rates — each service shows when its
          formula was last edited.
        </div>
      </div>
    </section>
  );
}
