import { useState } from "react";
import { LOCATIONS, parseShorthand } from "../lib/logic";
import { Arrow } from "./icons";

// Canonical valid range for the collateral-% field — single source of truth.
// Both the <input> attributes and the commit-time clamp read these, so the
// declared range and the enforced range can never drift apart (see #36).
export const COLLATERAL_PCT_MIN = 100;
export const COLLATERAL_PCT_MAX = 500;

const clampPct = (n: number) =>
  Math.min(Math.max(n, COLLATERAL_PCT_MIN), COLLATERAL_PCT_MAX);

export interface AppSettings {
  priceSource: "buy" | "split" | "sell";
  collateralPct: number;        // was: collOverride: string
  defaultOrigin: string;
  defaultDest: string;
  // Direct overrides (issue #15) — each independently toggleable. When enabled
  // with a value, wins over the market-derived value in the calculation.
  overrideCollateral: { enabled: boolean; value: number };
  overrideVol: { enabled: boolean; value: number };
  overrideRate: { enabled: boolean; value: number };
}

interface OverrideRowProps {
  title: string;
  desc: string;
  unit: string;
  state: { enabled: boolean; value: number };
  onChange: (s: { enabled: boolean; value: number }) => void;
}

function OverrideRow({ title, desc, unit, state, onChange }: OverrideRowProps) {
  // A local draft string lets the user type EVE shorthand / separators (`2b`,
  // `1,000,000`) without the value snapping back mid-keystroke. The raw string
  // is parsed to a number only on blur (no live masking — #37). Unparseable
  // input commits 0 (treated as cleared, like the old `< 0 → 0` rule), never a
  // stale or wrong number. The field is a text input with inputMode="numeric"
  // so mobile gets a numeric keypad while still accepting suffix/comma chars.
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft ??
    (Number.isFinite(state.value) && state.value > 0 ? String(state.value) : "");

  const commit = () => {
    if (draft === null) return;
    onChange({ ...state, value: parseShorthand(draft) ?? 0 });
    setDraft(null);
  };

  return (
    <div className="setting">
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => onChange({ ...state, enabled: e.target.checked })}
        />
        <span className="setting-k">{title}</span>
      </label>
      <div className="setting-d">{desc}</div>
      <input
        className="text-input mono"
        type="text"
        inputMode="numeric"
        disabled={!state.enabled}
        placeholder={unit}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
}

// Collateral-% field. Controlled by `value` (a number) but kept editable via a
// local draft string so intermediate keystrokes — empty field, a partial number
// below the valid range — stick instead of snapping back (the #36 bug). The
// number range is clamped at commit time (blur), never by dropping keystrokes.
function CollateralPctRow({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    onCommit(isNaN(n) ? value : clampPct(n));
    setDraft(null);
  };

  return (
    <div className="setting">
      <label className="setting-k" htmlFor="collateral-pct">
        Collateral as % of value
      </label>
      <div className="setting-d">
        Contract collateral = estimated cargo value × this percentage. Default 120% gives
        a 20% buffer over Jita value so price volatility doesn't underwater the contract.
      </div>
      <input
        id="collateral-pct"
        className="text-input mono"
        type="number"
        min={COLLATERAL_PCT_MIN}
        max={COLLATERAL_PCT_MAX}
        step="any"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
}

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
}

export function SettingsDrawer({ open, onClose, settings, setSettings }: SettingsDrawerProps) {
  return (
    <>
      <div className={"drawer-scrim " + (open ? "is-open" : "")} onClick={onClose} />
      <aside className={"drawer " + (open ? "is-open" : "")}>
        <div className="drawer-h">
          <div>
            <div className="drawer-eyebrow">Per-visitor</div>
            <h3>Settings</h3>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-body">
          <div className="setting">
            <div className="setting-k">Jita price source</div>
            <div className="setting-d">Determines how cargo value is estimated for collateral. We never call out for your hangar — only for type prices.</div>
            <div className="seg">
              {(["buy", "split", "sell"] as const).map((opt) => (
                <button
                  key={opt}
                  className={"seg-b " + (settings.priceSource === opt ? "is-on" : "")}
                  onClick={() => setSettings({ ...settings, priceSource: opt })}
                >{opt[0].toUpperCase() + opt.slice(1)}</button>
              ))}
            </div>
          </div>
          <CollateralPctRow
            value={settings.collateralPct}
            onCommit={(n) => setSettings({ ...settings, collateralPct: n })}
          />
          <div className="setting-group-h">Direct overrides</div>
          <OverrideRow
            title="Override collateral (ISK)"
            desc="Hard-set the contract collateral. Wins over both the collateral % and the Jita-derived value — use for non-market items or when you price the cargo better than Fuzzwork."
            unit="ISK"
            state={settings.overrideCollateral}
            onChange={(s) => setSettings({ ...settings, overrideCollateral: s })}
          />
          <OverrideRow
            title="Override volume (m³)"
            desc="Hard-set total packaged volume — for cargo not yet in the items database, where the parser undercounts."
            unit="m³"
            state={settings.overrideVol}
            onChange={(s) => setSettings({ ...settings, overrideVol: s })}
          />
          <OverrideRow
            title="Override per-m³ rate (ISK)"
            desc="Hard-set the per-m³ shipping rate — for a custom side-deal rate negotiated with the shipper. Applies to the rate leg of the active route's formula."
            unit="ISK/m³"
            state={settings.overrideRate}
            onChange={(s) => setSettings({ ...settings, overrideRate: s })}
          />

          <div className="setting">
            <div className="setting-k">Default route</div>
            <div className="setting-d">Loaded next time you open the page.</div>
            <div className="setting-route mono">
              {LOCATIONS.find((l) => l.id === settings.defaultOrigin)?.short || "—"}
              <Arrow style={{ margin: "0 8px" }} />
              {LOCATIONS.find((l) => l.id === settings.defaultDest)?.short || "—"}
            </div>
            <div className="setting-d">Set by remembering your last selection in the route picker.</div>
          </div>
        </div>
      </aside>
    </>
  );
}
