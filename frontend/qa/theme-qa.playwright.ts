import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:3001";
const OUT_DIR = path.join(process.cwd(), "qa-screenshots");

const ACCENT_LABELS = {
  blue: "Ocean Blue",
  emerald: "Emerald",
  violet: "Violet",
  amber: "Amber",
} as const;

function ensureOutputDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function navigate(page: Parameters<typeof test>[0]["page"], route: string) {
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
}

async function screenshot(page: Parameters<typeof test>[0]["page"], name: string) {
  await page.screenshot({
    path: path.join(OUT_DIR, name),
    fullPage: true,
  });
}

async function setThemeAndAccent(
  page: Parameters<typeof test>[0]["page"],
  theme: "dark" | "light",
  accent: keyof typeof ACCENT_LABELS
) {
  await navigate(page, "/settings");
  await page.getByRole("button", { name: new RegExp(`^${theme}\\b`, "i") }).click();
  await page.getByTitle(ACCENT_LABELS[accent]).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute("data-accent", accent);
}

async function openInventoryPanel(page: Parameters<typeof test>[0]["page"]) {
  await navigate(page, "/materials");
  const row = page.locator("table tbody tr").first();
  if (await row.count()) {
    await row.click();
  } else {
    const card = page.locator(".sm\\:hidden .rounded-lg").first();
    if (await card.count()) await card.click();
  }
  await page.waitForTimeout(250);
}

async function openSupplierPanel(page: Parameters<typeof test>[0]["page"]) {
  await navigate(page, "/scorecard?tab=suppliers");
  const row = page.locator("table tbody tr").first();
  if (await row.count()) {
    await row.click();
  } else {
    const card = page.locator(".sm\\:hidden .rounded-lg").first();
    if (await card.count()) await card.click();
  }
  await page.waitForTimeout(250);
}

test("theme and accent QA walkthrough", async ({ page }) => {
  test.setTimeout(5 * 60 * 1000);
  ensureOutputDir();
  const consoleIssues: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleIssues.push(`[console:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleIssues.push(`[pageerror] ${error.message}`);
  });

  // Reset persisted settings and verify dark default.
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    localStorage.removeItem("bakerypilot.theme");
    localStorage.removeItem("bakerypilot.accent");
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");

  // Dark mode checks.
  await page.setViewportSize({ width: 1440, height: 900 });
  await navigate(page, "/");
  await screenshot(page, "dark-desktop-home.png");

  await page.getByRole("button", { name: /Notifications/ }).click();
  await screenshot(page, "dark-desktop-notifications-dropdown.png");

  await page.getByRole("button", { name: "User menu" }).click();
  await screenshot(page, "dark-desktop-user-menu.png");

  await openInventoryPanel(page);
  await screenshot(page, "dark-desktop-inventory-detail-panel.png");

  await page.setViewportSize({ width: 768, height: 1024 });
  await navigate(page, "/");
  await screenshot(page, "dark-tablet-home.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await screenshot(page, "dark-mobile-sidebar-drawer.png");

  // Switch to light mode via Settings controls (behavior validation).
  await page.setViewportSize({ width: 1440, height: 900 });
  await setThemeAndAccent(page, "light", "emerald");
  await screenshot(page, "light-desktop-settings-theme-accent-selected.png");

  // Persistence check.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "emerald");

  // Light mode checks across pages and overlays.
  await navigate(page, "/");
  await screenshot(page, "light-desktop-home.png");

  await page.getByRole("button", { name: /Notifications/ }).click();
  await screenshot(page, "light-desktop-notifications-dropdown.png");

  await page.getByRole("button", { name: "User menu" }).click();
  await screenshot(page, "light-desktop-user-menu.png");

  await page.getByTitle("Copilot").click();
  await page.waitForTimeout(350);
  await screenshot(page, "light-desktop-copilot-popup.png");

  await openInventoryPanel(page);
  await screenshot(page, "light-desktop-inventory-detail-panel.png");

  await openSupplierPanel(page);
  await screenshot(page, "light-desktop-supplier-detail-panel.png");

  await navigate(page, "/schedule");
  await screenshot(page, "light-desktop-schedule.png");

  await navigate(page, "/facilities");
  await screenshot(page, "light-desktop-flowsight.png");

  await page.setViewportSize({ width: 768, height: 1024 });
  await navigate(page, "/materials");
  await screenshot(page, "light-tablet-materials.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await screenshot(page, "light-mobile-sidebar-drawer.png");

  await navigate(page, "/materials");
  await screenshot(page, "light-mobile-materials-cards.png");

  fs.writeFileSync(path.join(OUT_DIR, "browser-console.log"), `${consoleIssues.join("\n")}\n`, "utf8");
});
