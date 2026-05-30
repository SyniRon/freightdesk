import { LOCATIONS } from "../lib/logic";
import { Arrow } from "./icons";

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
        type="number"
        min="0"
        step="any"
        disabled={!state.enabled}
        placeholder={unit}
        value={Number.isFinite(state.value) && state.value > 0 ? state.value : ""}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange({ ...state, value: isNaN(n) || n < 0 ? 0 : n });
        }}
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
          <div className="setting">
            <div className="setting-k">Collateral as % of value</div>
            <div className="setting-d">
              Contract collateral = estimated cargo value × this percentage. Default 120% gives
              a 20% buffer over Jita value so price volatility doesn't underwater the contract.
            </div>
            <input
              className="text-input mono"
              type="number"
              min="100"
              max="500"
              step="5"
              value={settings.collateralPct}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n >= 50 && n <= 1000) {
                  setSettings({ ...settings, collateralPct: n });
                }
              }}
            />
          </div>
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
