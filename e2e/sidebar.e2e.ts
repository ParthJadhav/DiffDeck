import { expect, test } from "./test.js";

const fileParam = (page: import("@playwright/test").Page) =>
  new URL(page.url()).searchParams.get("file");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("diffdeck-e2e-initialized") === "true") return;
    localStorage.clear();
    sessionStorage.setItem("diffdeck-e2e-initialized", "true");
  });
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();
});

test("the header states the diff, its size, and review progress", async ({ diagnostics, page }) => {
  void diagnostics;
  const sidebar = page.getByRole("complementary", { name: "Changed files and review controls" });
  await expect(sidebar.getByText("git diff", { exact: true })).toBeVisible();
  const progress = sidebar.getByRole("progressbar", { name: /^0 of \d+ files viewed$/ });
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await expect(sidebar.getByRole("tab", { name: /^Files/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("files are marked viewed from the list and the whole review agrees", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const sidebar = page.getByRole("complementary", { name: "Changed files and review controls" });
  await sidebar.getByRole("button", { name: "Mark assets/logo.png viewed" }).click();
  await expect(
    sidebar.getByRole("button", { name: "Mark assets/logo.png unviewed" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/^1 of \d+ files viewed$/)).toBeVisible();
  await expect(
    page
      .locator('[data-file-path="assets/logo.png"]')
      .getByRole("button", { name: "Mark assets/logo.png unviewed" }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: /^assets folder, 1 of 2 files viewed$/ }),
  ).toBeVisible();
  // Toggling viewed from the list is bookkeeping, not navigation.
  expect(fileParam(page)).toBe("assets/blob.bin");
});

test("slash focuses file search; Enter opens the first match; Escape clears", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.keyboard.press("/");
  const search = page.getByRole("searchbox", { name: "Search files" });
  await expect(search).toBeFocused();
  // "s", "a", "p", and "c" are all shortcuts; typing must win over every one.
  await page.keyboard.type("src/app.t", { delay: 25 });
  await expect(search).toHaveValue("src/app.t");
  await expect(search).toBeFocused();
  expect(fileParam(page)).toBe("assets/blob.bin");
  await expect(page.getByRole("dialog", { name: "Diff settings" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open accessible linear patch view" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^src\/app\.ts,/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^README\.md,/ })).toHaveCount(0);

  await page.keyboard.press("Enter");
  await expect.poll(() => fileParam(page)).toBe("src/app.ts");
  await expect(page.getByRole("button", { name: /^src\/app\.ts,/ })).toBeFocused();

  await search.focus();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: /^assets\/logo\.png,/ })).toBeVisible();
});

test("slash from the Notes tab hands the very next keystroke to search", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.getByRole("tab", { name: /^Notes/ }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // No delay: keys arrive back to back, before any animation frame.
  await page.keyboard.press("/");
  await page.keyboard.type("sap", { delay: 0 });
  await expect(page.getByRole("searchbox", { name: "Search files" })).toHaveValue("sap");
  await expect(page.getByRole("dialog", { name: "Diff settings" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open accessible linear patch view" }),
  ).toBeVisible();
  expect(fileParam(page)).toBe("assets/blob.bin");
});

test("arrow keys walk the list and fold folders; the selection stays revealed", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const current = page.getByRole("button", { name: /^assets\/blob\.bin,/ });
  await expect(current).toHaveAttribute("aria-current", "true");
  await current.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /^assets\/logo\.png,/ })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  const assets = page.getByRole("button", { name: /^assets folder,/ });
  await expect(assets).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(assets).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /^assets\/logo\.png,/ })).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(assets).toHaveAttribute("aria-expanded", "true");

  await assets.click();
  await expect(assets).toHaveAttribute("aria-expanded", "false");
  // Stepping into a collapsed folder reopens it so the current file is visible.
  await page.locator("main").click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("j");
  await expect.poll(() => fileParam(page)).toBe("assets/logo.png");
  await expect(assets).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^assets\/logo\.png,/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("notes get their own tab, grouped by file, and rows show note counts", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts");
  const file = page.locator('[data-file-path="src/app.ts"]');
  await expect(file).toBeVisible();
  const notesTab = page.getByRole("tab", { name: /^Notes/ });
  await notesTab.click();
  await expect(page.getByText("No notes yet")).toBeVisible();

  await file.getByRole("button", { name: "Add file-level note to src/app.ts" }).click();
  await page.getByRole("textbox", { name: "File-level note for src/app.ts" }).fill("Check naming");
  await page.getByRole("button", { name: "Add note" }).click();

  const group = page.getByRole("region", { name: "Notes in src/app.ts" });
  await expect(group.getByText("Check naming", { exact: true })).toBeVisible();
  await expect(notesTab).toContainText("1");
  await expect(page.getByRole("button", { name: "Copy 1 note for agent" })).toBeVisible();

  await page.getByRole("tab", { name: /^Files/ }).click();
  await expect(page.getByRole("button", { name: /^src\/app\.ts, .*1 note/ })).toBeVisible();

  await page.getByRole("tab", { name: /^Files/ }).press("ArrowRight");
  await expect(notesTab).toBeFocused();
  await expect(notesTab).toHaveAttribute("aria-selected", "true");
});

test("active review filters are stated in the list and clear in one click", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.getByRole("button", { name: /^Filter review, showing/ }).click();
  await page.getByRole("textbox", { name: "Filter changed files by path" }).fill("src/");
  await page.getByRole("button", { name: "Close review filters" }).click();
  await expect(page.getByText(/^Showing 1 of \d+ · 1 filter$/)).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Files 1\/\d+/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText(/^Showing \d+ of \d+ · 1 filter$/)).toHaveCount(0);
});
