import { test, expect } from "@playwright/test";

// Fail any test on an uncaught page error — catches the "renders but throws"
// class of regression (e.g. a bundler transform breaking a non-asserted path)
// that visibility assertions alone would miss.
const pageErrors: Error[] = [];
test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error));
});
test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("eveship.")).forEach((k) => localStorage.removeItem(k)),
  );
  await page.reload();
});

test("empty hero → paste → contract values → copy", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Paste your hangar to start." })).toBeVisible();
  await page.getByRole("button", { name: /Load example into paste box/i }).click();
  await expect(page.locator(".cargo-row").first()).toBeVisible();
  await expect(page.locator(".service-card")).toHaveCount(2); // ADFU + ITL, both on this route
  await expect(page.locator(".copy-block:not(.is-empty)")).toBeVisible();
  await expect(page.locator(".copy-row")).toHaveCount(4);

  // New copy-block order — Shipper first matches EVE's Create Contract window.
  const rows = page.locator(".copy-row");
  await expect(rows.nth(0)).toContainText("Shipper");
  await expect(rows.nth(1)).toContainText("Destination");
  await expect(rows.nth(2)).toContainText("Reward");
  await expect(rows.nth(3)).toContainText("Collateral");

  // Contract-window settings panel (Task 3) — informational, not copy buttons.
  const meta = page.locator(".copy-contract-meta");
  await expect(meta).toBeVisible();
  await expect(meta).toContainText("1 week");
  await expect(meta).toContainText("7 days");
  await expect(meta).toContainText("optional");

  await page.locator(".copy-row").filter({ hasText: "Destination" }).click();
  await expect(page.locator(".toast")).toBeVisible();
});

test("location combobox accepts custom entry", async ({ page }) => {
  await page.getByRole("button", { name: /Load example into paste box/i }).click();
  await page.locator(".loc-btn").first().click();
  await page.locator(".loc-input").fill("XX-XYZ");
  await expect(page.locator(".loc-opt-custom")).toBeVisible();
  await page.locator(".loc-opt-custom").click();
  await expect(page.locator(".tag-custom")).toBeVisible();
});

test("rush toggle adjusts reward", async ({ page }) => {
  await page.getByRole("button", { name: /Load example into paste box/i }).click();
  // Wait for the alliance card to appear with a real reward (not "—")
  const rewardLocator = page.locator(".svc-reward-v").first();
  await expect(rewardLocator).not.toHaveText("—");
  const beforeText = await rewardLocator.textContent();
  // Toggle rush
  await page.locator(".svc-rush input[type='checkbox']").check();
  // Reward should now reflect +250M
  await expect(rewardLocator).not.toHaveText(beforeText!);
});

test("active override surfaces a chip + on-card annotation; Clear all persists", async ({ page }) => {
  // Seed a persisted collateral override (as if set in a prior session) and reload
  // so the chip surfaces on first load without opening Settings.
  await page.evaluate(() => {
    const settings = {
      priceSource: "sell",
      collateralPct: 120,
      defaultOrigin: "jita44",
      defaultDest: "cj6mt",
      overrideCollateral: { enabled: true, value: 100000000000 },
      overrideVol: { enabled: false, value: 0 },
      overrideRate: { enabled: false, value: 0 },
    };
    localStorage.setItem("eveship.settings", JSON.stringify(settings));
  });
  await page.reload();
  await page.getByRole("button", { name: /Load example into paste box/i }).click();

  // Global chip names the active override.
  const chip = page.locator(".overrides-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(/Overrides active/i);
  await expect(chip).toContainText("collateral");

  // On-card annotation: a struck market figure + an override tag.
  const card = page.locator(".service-card").first();
  await expect(card.locator(".svc-struck").first()).toBeVisible();
  await expect(card.locator(".override-tag").first()).toBeVisible();

  // Clear all disables the override, removes the chip, and persists across reload.
  await page.getByRole("button", { name: /clear all/i }).click();
  await expect(chip).toHaveCount(0);
  // The pasted cargo persists, so after reload the results area is already
  // populated — the chip must stay gone because the override is cleared in LS.
  await page.reload();
  await expect(page.locator(".service-card").first()).toBeVisible();
  await expect(page.locator(".overrides-chip")).toHaveCount(0);
});

test("custom destination → Custom service card prices an uncovered route (ADR 0012)", async ({ page }) => {
  await page.getByRole("button", { name: /Load example into paste box/i }).click();
  await expect(page.locator(".loc-btn").first()).toBeVisible();

  // Pick a custom (free-typed) destination no catalog courier covers.
  await page.locator(".loc-btn").nth(1).click();
  await page.locator(".loc-input").fill("XX-XYZ");
  await page.locator(".loc-opt-custom").click();

  // The Custom service card surfaces (no catalog card, no cargo-too-large state).
  const card = page.locator(".service-card.is-custom");
  await expect(card).toBeVisible();
  await expect(page.locator(".svc-custom-badge")).toContainText(/your own rate/i);

  // Before a rate is set: no quote, no copy block.
  await expect(page.locator(".copy-block:not(.is-empty)")).toHaveCount(0);

  // Set a per-m³ rate → the card prices it and the copy block reveals.
  await card.getByLabel(/Custom rate per m³/i).fill("800");
  await expect(card.locator(".svc-reward-v")).not.toHaveText("—");
  await expect(page.locator(".copy-block:not(.is-empty)")).toBeVisible();

  // Recipient empty = public contract: no Shipper row, neutral hint instead.
  await expect(page.locator(".copy-public-hint")).toBeVisible();
  await expect(page.locator(".copy-row").filter({ hasText: "Shipper" })).toHaveCount(0);

  // Fill a recipient → the Shipper row appears with that exact string.
  await card.getByLabel(/Recipient/i).fill("ADFU Kum N Go Transport Group");
  const shipper = page.locator(".copy-row").filter({ hasText: "Shipper" });
  await expect(shipper).toBeVisible();
  await expect(shipper).toContainText("ADFU Kum N Go Transport Group");

  // The card rate persists across reload under its own key (cargo persists too).
  await page.reload();
  await expect(page.locator(".service-card.is-custom").getByLabel(/Custom rate per m³/i)).toHaveValue("800");
});

test("min-reward floor warning banner appears for tiny shipments", async ({ page }) => {
  // A small Tritanium paste → reward well below the 5M ADFU minimum.
  // Paste first so the RoutePicker becomes visible (it's hidden until there's content).
  await page.locator("textarea").fill("Tritanium\t100");
  // Wait for RoutePicker to appear after paste
  await expect(page.locator(".loc-btn").first()).toBeVisible();

  // Set origin = C-J6MT (alliance staging) and destination = Jita 4-4.
  await page.locator(".loc-btn").first().click();
  await page.locator(".loc-opt").filter({ hasText: "C-J6MT" }).first().click();
  await page.locator(".loc-btn").nth(1).click();
  await page.locator(".loc-opt").filter({ hasText: "Jita 4-4" }).first().click();
  await expect(page.locator(".service-card").first()).toBeVisible();

  // The info banner should show — calculated reward is far below the 5M floor.
  const info = page.locator(".copy-info-warn");
  await expect(info).toBeVisible();
  await expect(info).toContainText(/minimum/i);
});
