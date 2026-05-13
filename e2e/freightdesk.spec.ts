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
  await expect(page.locator(".service-card")).toHaveCount(1); // alliance-only
  await expect(page.locator(".copy-block:not(.is-empty)")).toBeVisible();
  await expect(page.locator(".copy-row")).toHaveCount(4);
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
