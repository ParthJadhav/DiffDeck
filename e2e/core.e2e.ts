import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./test.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();
});

test("loads the review shell and navigates files truthfully", async ({ diagnostics, page }) => {
  void diagnostics;
  const previous = page.getByRole("button", { name: "Previous visible file" });
  const next = page.getByRole("button", { name: "Next visible file" });

  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  const firstUrl = page.url();
  await next.click();
  await expect(previous).toBeEnabled();
  await expect.poll(() => page.url()).not.toBe(firstUrl);
  await expect(page.getByRole("main")).toBeVisible();
});

test("has no serious automated accessibility violations", async ({
  browserName,
  diagnostics,
  page,
}) => {
  void diagnostics;
  test.skip(browserName !== "chromium", "Axe runs once; engine core paths run in every project.");
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter(
    ({ impact }) => impact === "critical" || impact === "serious",
  );
  expect(blockers).toEqual([]);
});
