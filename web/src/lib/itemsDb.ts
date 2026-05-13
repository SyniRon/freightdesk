// Minimal item database for the demo parser.
// Keyed by lowercase item name. Volume in m³ per unit.
// STUB: real app will query Fuzzwork / SDE for full coverage —
// see CLAUDE.md "Code reuse path" (sibling repo `reprocessing_helper`).
export interface ItemEntry {
  vol: number;
  price: number;
}

export const ITEM_DB: Record<string, ItemEntry> = {
  // Minerals / commodities (packed 0.01)
  tritanium: { vol: 0.01, price: 5.2 },
  pyerite: { vol: 0.01, price: 11.4 },
  mexallon: { vol: 0.01, price: 78.0 },
  isogen: { vol: 0.01, price: 142.0 },
  nocxium: { vol: 0.01, price: 820.0 },
  zydrine: { vol: 0.01, price: 1450.0 },
  megacyte: { vol: 0.01, price: 3100.0 },
  morphite: { vol: 0.01, price: 8600.0 },

  // PLEX & injectors
  plex: { vol: 0.01, price: 3_950_000 },
  "large skill injector": { vol: 0.01, price: 880_000_000 },
  "small skill injector": { vol: 0.01, price: 195_000_000 },
  "skill extractor": { vol: 0.01, price: 290_000_000 },

  // Modules (packed)
  "damage control ii": { vol: 5, price: 580_000 },
  "large shield extender ii": { vol: 25, price: 1_120_000 },
  "10mn afterburner ii": { vol: 5, price: 870_000 },
  "100mn afterburner ii": { vol: 25, price: 4_400_000 },
  "warrior ii": { vol: 5, price: 580_000 },
  "hobgoblin ii": { vol: 5, price: 610_000 },
  "hammerhead ii": { vol: 10, price: 1_200_000 },
  "ogre ii": { vol: 25, price: 4_300_000 },
  "heavy assault missile launcher ii": { vol: 10, price: 5_800_000 },
  "425mm autocannon ii": { vol: 20, price: 2_400_000 },

  // Ammo
  "scourge fury heavy assault missile": { vol: 0.005, price: 980 },
  "republic fleet emp l": { vol: 0.0125, price: 1_440 },
  "caldari navy antimatter charge l": { vol: 0.0125, price: 1_520 },

  // Ships (packed volumes)
  rifter: { vol: 2500, price: 540_000 },
  merlin: { vol: 2500, price: 480_000 },
  punisher: { vol: 2500, price: 620_000 },
  incursus: { vol: 2500, price: 510_000 },
  caracal: { vol: 10000, price: 11_200_000 },
  drake: { vol: 15000, price: 56_000_000 },
  ferox: { vol: 15000, price: 48_000_000 },
  harbinger: { vol: 15000, price: 64_000_000 },
  raven: { vol: 50000, price: 220_000_000 },
  rokh: { vol: 50000, price: 235_000_000 },
  megathron: { vol: 50000, price: 245_000_000 },
  vargur: { vol: 50000, price: 1_750_000_000 },
  machariel: { vol: 50000, price: 720_000_000 },

  // Misc
  "mobile tractor unit": { vol: 50, price: 16_500_000 },
  "core probe launcher ii": { vol: 5, price: 1_180_000 },
  "sisters core scanner probe": { vol: 0.1, price: 920_000 },
  "cap booster 800": { vol: 1, price: 78_000 },
  "nanite repair paste": { vol: 0.01, price: 18_500 },
};

// Example paste — used as placeholder + "Load example" button.
export const EXAMPLE_PASTE = [
  "Drake\t2",
  "Large Shield Extender II\t12",
  "Damage Control II\t4",
  "Scourge Fury Heavy Assault Missile\t4800",
  "Hobgoblin II\t10",
  "Nanite Repair Paste\t250",
  "PLEX\t500",
].join("\n");
