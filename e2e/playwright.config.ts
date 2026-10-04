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

// The Sentry privacy suite (ADR 0007) needs a build with Sentry switched on,
// so it gets its own production build with a placeholder DSN on a .invalid
// host. The suite intercepts that host, so nothing leaves the machine. It
// only runs against local builds: a deployed site carries the real DSN.
const runSentrySuite = !process.env.E2E_BASE_URL;
const SENTRY_SUITE = /sentry-privacy\.spec\.ts/;
const SENTRY_SUITE_PORT = 4174;

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
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"], testIgnore: SENTRY_SUITE },
    ...(runSentrySuite
      ? [
          {
            name: "sentry-privacy",
            testMatch: SENTRY_SUITE,
            use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${SENTRY_SUITE_PORT}` },
          },
        ]
      : []),
  ],
  webServer: runSentrySuite
    ? [
        {
          command: "cd ../web && pnpm preview --port 4173",
          port: 4173,
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          command:
            "cd ../web && pnpm exec vite build --outDir dist-e2e-sentry --emptyOutDir" +
            ` && pnpm exec vite preview --outDir dist-e2e-sentry --port ${SENTRY_SUITE_PORT} --strictPort`,
          port: SENTRY_SUITE_PORT,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            VITE_SENTRY_DSN: "https://public@sentry.invalid/1",
            VITE_SENTRY_ENV: "e2e",
          },
        },
      ]
    : undefined,
});
