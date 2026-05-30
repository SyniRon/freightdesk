import { test, expect } from "@playwright/test";

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
