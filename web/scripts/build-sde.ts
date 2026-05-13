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

// Categories where SDE volume is the *assembled* volume, not the packaged volume.
// The JSONL SDE format omits packagedVolume entirely; ESI is authoritative here.
//   6  = Ship (assembled volume >> packaged; e.g. Drake: 252000 → 15000 m³)
//   7  = Module
//  18  = Drone
//  32  = Subsystem
//  87  = Fighter
const ESI_ENRICH_CATEGORIES = new Set([6, 7, 18, 32, 87]);

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
  // SDE JSONL types don't carry categoryID directly — they have groupID.
  // Build a groupID → categoryID map from groups.jsonl first.
  const groupEntry = zip.getEntries().find((e) => e.entryName.endsWith("/groups.jsonl") || e.entryName === "groups.jsonl");
  if (!groupEntry) throw new Error("groups.jsonl not found in SDE zip");
  const groupCatMap = new Map<number, number>();
  for (const line of groupEntry.getData().toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    const g = JSON.parse(line);
    groupCatMap.set(Number(g._key), Number(g.categoryID ?? 0));
  }

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
    const groupID = Number(t.groupID ?? 0);
    const categoryID = groupCatMap.get(groupID) ?? 0;
    out.push({
      id: t._key,
      name: typeof t.name === "object" ? t.name.en : t.name,
      // JSONL SDE has no packagedVolume field; `volume` is the assembled volume
      // for ships/modules but equals packaged volume for commodities/minerals/etc.
      // ESI_ENRICH_CATEGORIES handles the difference for ship/module/drone/etc.
      packagedVolume: Number(t.volume ?? 0),
      categoryID,
      published: true,
    });
  }
  return out;
}

async function enrichViaEsi(types: SdeType[]): Promise<Map<number, number>> {
  // Returns typeID → packaged_volume for the broken categories.
  // ESI is rate-limited to ~150 req/sec across all users — be polite.
  const toEnrich = types.filter((t) => ESI_ENRICH_CATEGORIES.has(t.categoryID));
  console.error(`[esi] enriching ${toEnrich.length} types`);
  const enriched = new Map<number, number>();
  const CONCURRENCY = 20;
  let idx = 0;
  async function worker() {
    while (idx < toEnrich.length) {
      const i = idx++;
      const t = toEnrich[i];
      try {
        const r = await fetch(`https://esi.evetech.net/latest/universe/types/${t.id}/?datasource=tranquility`);
        if (!r.ok) {
          console.error(`[esi] ${t.id} ${t.name} → ${r.status}`);
          continue;
        }
        const data = await r.json();
        if (typeof data.packaged_volume === "number") {
          enriched.set(t.id, data.packaged_volume);
        }
      } catch (e) {
        console.error(`[esi] ${t.id} ${t.name} → ${(e as Error).message}`);
      }
      if (i % 500 === 0) console.error(`[esi] ${i}/${toEnrich.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.error(`[esi] enriched ${enriched.size}/${toEnrich.length}`);
  return enriched;
}

async function emit(types: SdeType[], enriched: Map<number, number>) {
  const out: Record<string, { id: number; vol: number }> = {};
  for (const t of types) {
    const vol = enriched.get(t.id) ?? t.packagedVolume;
    if (!vol || vol <= 0) continue; // skip zero-volume types (blueprints, skills…)
    const key = t.name.toLowerCase();
    // Collision policy: keep the lower typeID (older, usually canonical).
    if (key in out && out[key].id < t.id) continue;
    out[key] = { id: t.id, vol };
  }
  const json = JSON.stringify(out);
  await writeFile(OUT_PATH, json);
  console.error(`[emit] wrote ${OUT_PATH} (${Object.keys(out).length} items, ${(json.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  const zipBuf = await downloadSde();
  const types = parseTypesJsonl(zipBuf);
  console.error(`[sde] parsed ${types.length} published types`);
  const enriched = await enrichViaEsi(types);
  await emit(types, enriched);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
