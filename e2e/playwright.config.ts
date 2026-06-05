import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Browser resolution, most specific first:
// 1. E2E_CHROMIUM_PATH — explicit Chromium/Chrome binary, for hosts where
//    Playwright's bundled Chromium can't be installed (supplied at runtime so
//    no host-specific path is committed; empty counts as unset).
// 2. Snap-packaged Chromium, on any Linux host where /snap/bin/chromium exists.
// 3. Playwright's bundled Chromium (macOS dev boxes, GitHub Actions runners).
// Any explicit binary (tiers 1–2) launches with --no-sandbox, since these
// tiers exist precisely for hosts where the sandboxed bundled build doesn't
// work. Tests only ever target localhost or an explicitly chosen E2E_BASE_URL.
const SNAP_CHROMIUM = "/snap/bin/chromium";
const useSnapChromium = process.platform === "linux" && existsSync(SNAP_CHROMIUM);
const chromiumPath = process.env.E2E_CHROMIUM_PATH || (useSnapChromium ? SNAP_CHROMIUM : undefined);

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    launchOptions: chromiumPath
      ? { executablePath: chromiumPath, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
      : {},
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "cd ../web && pnpm preview --port 4173",
        port: 4173,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
