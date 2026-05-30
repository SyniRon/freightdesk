import type { Location } from "../lib/logic";
import type { LocationIndex } from "../lib/locations";
import { Arrow } from "./icons";
import { LocationCombo } from "./LocationCombo";

interface RoutePickerProps {
  origin: Location;
  dest: Location;
  setOrigin: (loc: Location) => void;
  setDest: (loc: Location) => void;
  locIndex: LocationIndex | null;
  /** True when the SDE corpus failed to load — surfaced in the combo. */
  locUnavailable: boolean;
}

export function RoutePicker({ origin, dest, setOrigin, setDest, locIndex, locUnavailable }: RoutePickerProps) {
  return (
    <section className="block">
      <header className="block-h">
        <div className="block-step">03</div>
        <div className="block-title">
          <h2>Route</h2>
          <p>Pick where the cargo is now and where it needs to be. Type to search any system.</p>
        </div>
        <div className="block-actions">
          <button
            className="btn-ghost"
            onClick={() => {
              const o = origin;
              setOrigin(dest);
              setDest(o);
            }}
          >
            Swap ⇌
          </button>
        </div>
      </header>
      <div className="route-grid">
        <LocationCombo label="Origin" value={origin} onChange={setOrigin} locIndex={locIndex} locUnavailable={locUnavailable} />
        <div className="route-arrow">
          <Arrow />
        </div>
        <LocationCombo label="Destination" value={dest} onChange={setDest} locIndex={locIndex} locUnavailable={locUnavailable} />
      </div>
    </section>
  );
}
