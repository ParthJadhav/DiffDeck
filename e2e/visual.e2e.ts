import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./test.js";

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  maxDiffPixelRatio: 0.03,
};

async function expectAccessible(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => impact === "critical" || impact === "serious"),
  ).toEqual([]);
}

async function openReview(page: import("@playwright/test").Page, path = "README.md") {
  await page.goto(`/?file=${encodeURIComponent(path)}`);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator(`[data-file-path="${path}"]`)).toBeVisible();
}

test("desktop light write-enabled review visual", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("diffdeck.settings.themeType", JSON.stringify("light"));
  });
  await openReview(page);
  await expect(page.getByRole("button", { name: /^More actions for / }).first()).toBeVisible();
  await expect(page).toHaveScreenshot("desktop-light-write.png", screenshotOptions);
});

test("dependency summary visual", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("diffdeck.settings.themeType", JSON.stringify("light"));
  });
  await openReview(page, "package.json");
  await expect(
    page.getByRole("region", { name: "Dependency changes for package.json" }),
  ).toBeVisible();
  await expect(page.getByText("19.0.0 → 20.0.0")).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("dependency-light.png", screenshotOptions);
});

test("image comparison visual", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("diffdeck.settings.themeType", JSON.stringify("light"));
  });
  await openReview(page, "assets/logo.png");
  const imageDiff = page.getByRole("region", { name: "Image diff for assets/logo.png" });
  await expect(imageDiff).toBeVisible();
  await expect(imageDiff.getByRole("img", { name: "Before version" })).toBeVisible();
  await expect(imageDiff.getByRole("img", { name: "After version" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("image-light.png", screenshotOptions);
});

test("dark review note visual", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("diffdeck.settings.themeType", JSON.stringify("dark"));
  });
  await openReview(page, "src/app.ts");
  await page.getByRole("button", { name: "Open accessible linear patch view" }).click();
  await page
    .getByRole("button", { name: /^Comment/ })
    .first()
    .click();
  await page.getByPlaceholder("What should change?").fill("Keep the greeting contract explicit.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(
    page.getByRole("main").getByText("Keep the greeting contract explicit.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Added review note", { exact: true })).toBeHidden({ timeout: 6_000 });
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("comment-dark.png", screenshotOptions);
});

test("narrow accessible patch visual", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.setViewportSize({ height: 812, width: 375 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("diffdeck.settings.themeType", JSON.stringify("dark"));
  });
  await openReview(page, "src/app.ts");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Open accessible linear patch view" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("main", { name: /Accessible patch for src\/app\.ts/ })).toBeVisible();
  await expect(page).toHaveScreenshot("phone-accessible-dark.png", screenshotOptions);
});

test("empty diff visual and recovery copy", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.route("**/api/session**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        capabilities: {
          editor: false,
          structural: false,
          watch: false,
          write: false,
          writeActions: [],
        },
        currentDirectory: ".",
        diffArgs: [],
        files: [],
        preferences: { whitespaceMode: "normal" },
        repoRoot: "/fixture/empty",
        snapshotId: "empty-v1",
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No diff to render" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("empty-light.png", screenshotOptions);
});

test("fatal session error visual has an actionable retry", async ({ diagnostics, page }) => {
  await page.route("**/api/session**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ error: "The repository was removed while DiffDeck was open." }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "The repository was removed while DiffDeck was open.",
  );
  await expect(page.getByRole("button", { name: "Retry session" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("fatal-error-light.png", screenshotOptions);
  const expectedFailures = diagnostics.filter((message) => /status of 503/.test(message));
  expect(expectedFailures).toHaveLength(1);
  diagnostics.splice(
    0,
    diagnostics.length,
    ...diagnostics.filter((message) => !expectedFailures.includes(message)),
  );
});
