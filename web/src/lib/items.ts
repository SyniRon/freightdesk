// Runtime items DB. Fetches /items.json on first call, caches in module scope.
// Test code can call `__setItemsForTesting()` to inject a fixture.

export interface ItemEntry {
  id: number;
  vol: number;
}

let cache: Record<string, ItemEntry> | null = null;
let inflight: Promise<Record<string, ItemEntry>> | null = null;

export async function loadItems(): Promise<Record<string, ItemEntry>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/items.json")
    .then((r) => {
      if (!r.ok) throw new Error(`items.json fetch failed: ${r.status}`);
      return r.json() as Promise<Record<string, ItemEntry>>;
    })
    .then((data) => {
      cache = data;
      inflight = null;
      return data;
    });
  return inflight;
}

export function getItemsSync(): Record<string, ItemEntry> | null {
  return cache;
}

// Test-only — resets module state.
export function __setItemsForTesting(items: Record<string, ItemEntry> | null) {
  cache = items;
  inflight = null;
}

// Example paste — kept here so the empty-state hero stays self-contained.
export const EXAMPLE_PASTE = [
  "Drake\t2",
  "Large Shield Extender II\t12",
  "Damage Control II\t4",
  "Scourge Rage Heavy Assault Missile\t4800",
  "Hobgoblin II\t10",
  "Nanite Repair Paste\t250",
  "PLEX\t500",
].join("\n");
