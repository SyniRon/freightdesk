import type { Location } from "../lib/logic";
import { Arrow } from "./icons";
import { LocationCombo } from "./LocationCombo";

interface RoutePickerProps {
  origin: Location;
  dest: Location;
  setOrigin: (loc: Location) => void;
  setDest: (loc: Location) => void;
}

export function RoutePicker({ origin, dest, setOrigin, setDest }: RoutePickerProps) {
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
        <LocationCombo label="Origin" value={origin} onChange={setOrigin} />
        <div className="route-arrow">
          <Arrow />
        </div>
        <LocationCombo label="Destination" value={dest} onChange={setDest} />
      </div>
    </section>
  );
}
