import { LOCATIONS } from "../lib/logic";
import { Arrow } from "./icons";

export interface AppSettings {
  priceSource: string;
  collOverride: string;
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
            <div className="setting-d">
              Used to estimate collateral. We never call out for your hangar — only for type prices.
            </div>
            <div className="seg">
              {["sell 5%", "sell median", "buy 95%"].map((opt) => (
                <button
                  key={opt}
                  className={"seg-b " + (settings.priceSource === opt ? "is-on" : "")}
                  onClick={() => setSettings({ ...settings, priceSource: opt })}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <div className="setting-k">Custom collateral override</div>
            <div className="setting-d">
              Force a specific collateral instead of the Jita estimate. Blank = auto.
            </div>
            <input
              className="text-input mono"
              placeholder="auto"
              value={settings.collOverride}
              onChange={(e) => setSettings({ ...settings, collOverride: e.target.value })}
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
