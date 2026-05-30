import type { AppSettings } from "./SettingsDrawer";
import { Warn, X } from "./icons";

// Persistent, dismissible indicator that one or more direct overrides are
// active (issue #40). Because overrides persist across sessions, a skewed
// quote could otherwise go unnoticed until the Settings drawer is opened — so
// this surfaces near the top of the results area without opening Settings.
//
// "Dismissed" hides the chip for the current session only; it is NOT persisted,
// so a reload with overrides still enabled re-surfaces it. That is the whole
// point — dismissal must never permanently mask a skewed-pricing state.

interface OverridesChipProps {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  dismissed: boolean;
  onDismiss: () => void;
}

// Enabled overrides, in card vocabulary order (collateral / volume / rate).
function activeNames(s: AppSettings): string[] {
  const names: string[] = [];
  if (s.overrideCollateral.enabled) names.push("collateral");
  if (s.overrideVol.enabled) names.push("volume");
  if (s.overrideRate.enabled) names.push("rate");
  return names;
}

export function OverridesChip({ settings, setSettings, dismissed, onDismiss }: OverridesChipProps) {
  const names = activeNames(settings);
  if (names.length === 0 || dismissed) return null;

  const clearAll = () =>
    setSettings({
      ...settings,
      overrideCollateral: { ...settings.overrideCollateral, enabled: false },
      overrideVol: { ...settings.overrideVol, enabled: false },
      overrideRate: { ...settings.overrideRate, enabled: false },
    });

  return (
    <div className="overrides-chip" role="status">
      <Warn />
      <span className="overrides-chip-text">
        Overrides active: <b>{names.join(", ")}</b>
      </span>
      <button className="overrides-chip-clear" onClick={clearAll}>
        Clear all
      </button>
      <button className="overrides-chip-dismiss" onClick={onDismiss} aria-label="Dismiss" title="Hide for this session">
        <X />
      </button>
    </div>
  );
}
