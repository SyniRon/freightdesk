import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    launchOptions: {
      ...(process.platform === "linux"
        ? { executablePath: "/snap/bin/chromium", args: ["--no-sandbox", "--disable-setuid-sandbox"] }
        : {}),
    },
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
