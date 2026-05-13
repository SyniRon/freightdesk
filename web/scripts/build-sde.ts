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

async function downloadSde(): Promise<Buffer> {
  // Cache the zip locally — it's ~50MB and rebuilds shouldn't re-download.
  // Invalidate when the cached file is older than 7 days.
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  try {
    const s = await stat(ZIP_PATH);
    if (Date.now() - s.mtimeMs < STALE_MS) {
      console.error(`[sde] using cached ${ZIP_PATH}`);
      return await readFile(ZIP_PATH);
    }
  } catch {
    /* not cached yet */
  }
  console.error(`[sde] downloading ${SDE_URL}`);
  const res = await fetch(SDE_URL);
  if (!res.ok || !res.body) throw new Error(`SDE download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(ZIP_PATH));
  return await readFile(ZIP_PATH);
}

interface SdeType {
  id: number;
  name: string;
  packagedVolume: number;
  categoryID: number;
  published: boolean;
}

function parseTypesJsonl(zipBuf: Buffer): SdeType[] {
  const zip = new AdmZip(zipBuf);
  // SDE bundles each "schema" as one .jsonl file. The types file is `types.jsonl`
  // inside the ZIP. Path layout may include a leading directory — search broadly.
  const entry = zip.getEntries().find((e) => e.entryName.endsWith("/types.jsonl") || e.entryName === "types.jsonl");
  if (!entry) throw new Error("types.jsonl not found in SDE zip");
  const text = entry.getData().toString("utf8");
  const out: SdeType[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const t = JSON.parse(line);
    if (!t.published) continue; // skip retired/test types
    out.push({
      id: t.typeID,
      name: typeof t.name === "object" ? t.name.en : t.name,
      packagedVolume: Number(t.packagedVolume ?? 0),
      categoryID: Number(t.categoryID ?? 0),
      published: true,
    });
  }
  return out;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  const zipBuf = await downloadSde();
  const types = parseTypesJsonl(zipBuf);
  console.error(`[sde] parsed ${types.length} published types`);

  // TODO Task 9: ESI enrichment + emit JSON
  console.error("ESI enrichment not yet wired");
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
