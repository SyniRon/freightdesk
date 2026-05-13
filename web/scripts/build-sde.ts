#!/usr/bin/env tsx
// Builds web/public/items.json from CCP's static data dump.
//
// 1. Download (or read cached) JSONL ZIP from CCP
// 2. Parse `types.jsonl` — keep id, name (en), packagedVolume, categoryID
// 3. For categories where packagedVolume is broken (7, 18, 32, 87), enrich
//    via ESI /universe/types/{id}/ — uses the `packaged_volume` field.
// 4. Emit web/public/items.json shaped as:
//      { "<lowercase-name>": { "id": number, "vol": number } }

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import AdmZip from "adm-zip";

const SDE_URL =
  "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const CACHE_DIR = path.join(import.meta.dirname, "cache");
const ZIP_PATH = path.join(CACHE_DIR, "sde.zip");
const OUT_PATH = path.join(import.meta.dirname, "..", "public", "items.json");

// Categories where SDE packagedVolume is missing/zero — Reprocessing Helper learning.
const ESI_ENRICH_CATEGORIES = new Set([7, 18, 32, 87]);

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });

  // STUBS — filled in by subsequent tasks:
  console.error("not yet implemented");
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
