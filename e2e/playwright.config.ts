import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// On synicloud's Ubuntu host we use the snap-packaged Chromium; on macOS dev
// boxes and GitHub Actions runners we let Playwright's bundled Chromium win.
const SNAP_CHROMIUM = "/snap/bin/chromium";
const useSnapChromium = process.platform === "linux" && existsSync(SNAP_CHROMIUM);

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    launchOptions: useSnapChromium
      ? { executablePath: SNAP_CHROMIUM, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
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
