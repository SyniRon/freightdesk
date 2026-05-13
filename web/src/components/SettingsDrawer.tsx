import { LOCATIONS } from "../lib/logic";
import { Arrow } from "./icons";

export interface AppSettings {
  priceSource: "buy" | "split" | "sell";
  collateralPct: number;        // was: collOverride: string
  defaultOrigin: string;
  defaultDest: string;
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
