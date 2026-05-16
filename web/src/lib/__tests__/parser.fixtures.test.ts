// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHangarPaste } from "../logic";
import type { ItemEntry } from "../items";

const FIXTURE_DIR = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../test/fixtures/hangar-pastes",
);

const sdeSubset = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, "sde-subset.json"), "utf8"),
) as Record<string, ItemEntry>;

// Expected total volume — sum of vol×qty across the 18 items.
// Hand-computed: 153,440 + 38,080×3 + 35,344.40 + 26,720 + 25,905.75 + 25,808.90
//                + 25,344.40×2 + 20,000 + 5,344.40 + 117 + 0.16 + 0.08×3 + 0.01
//              ≈ 457,609.66 m³.
const EXPECTED_TOTAL_VOL = 457_609.66;
const EXPECTED_ITEM_COUNT = 18;

const FIXTURES = [
  "hangar-detailed.txt",
  "hangar-simple.txt",
  "contract-window.txt",
];

describe("parser — real production paste shapes", () => {
  for (const fixture of FIXTURES) {
    it(`parses ${fixture} to ${EXPECTED_ITEM_COUNT} matched items with no unmatched`, () => {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, fixture), "utf8");
      const res = parseHangarPaste(raw, sdeSubset);
      expect(res.unmatched).toEqual([]);
      expect(res.matched).toHaveLength(EXPECTED_ITEM_COUNT);
    });

    it(`parses ${fixture} to the expected total volume (within 1 m³)`, () => {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, fixture), "utf8");
      const res = parseHangarPaste(raw, sdeSubset);
      expect(res.totalVol).toBeCloseTo(EXPECTED_TOTAL_VOL, 0); // within 0.5
    });
  }
});
