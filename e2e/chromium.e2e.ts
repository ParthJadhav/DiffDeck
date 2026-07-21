import AxeBuilder from "@axe-core/playwright";
import { processPatch } from "@pierre/diffs";
import { expect, test } from "./test.js";

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

test("dynamic desktop-to-phone resize keeps a usable patch and explicit file picker", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ height: width === 1024 ? 768 : 900, width });
    await expect(
      page.getByRole("separator", { name: "Resize file tree and diff panels" }),
    ).toBeVisible();
    await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();
  }

  for (const width of [900, 768, 600, 375, 320]) {
    await page.setViewportSize({ height: width === 320 ? 568 : 812, width });
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }

  await page.getByRole("button", { name: "Files" }).click();
  await expect(
    page.getByRole("complementary", { name: "Changed files and review controls" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Flat file view" }).click();
  await page.getByRole("searchbox", { name: "Search files" }).fill("src/app.ts");
  await page.getByRole("button", { name: /^src\/app\.ts,/ }).click();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Files" })).toBeVisible();

  await page.setViewportSize({ height: 800, width: 1280 });
  await expect(
    page.getByRole("separator", { name: "Resize file tree and diff panels" }),
  ).toBeVisible();
  await page.setViewportSize({ height: 900, width: 600 });
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();
});

test("flat file mode keeps 23,000 files searchable and selected without DOM explosion", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  test.setTimeout(45_000);
  await page.waitForTimeout(500);
  const files = Array.from({ length: 23_000 }, (_, index) => {
    const padded = String(index).padStart(5, "0");
    return {
      additions: 1,
      changeType: "new",
      deletions: 0,
      diffId: `large-${padded}`,
      gitStatus: "added",
      path: `huge/group-${padded.slice(0, 2)}/item-${padded}.ts`,
    };
  });
  let fileDiffRequestCount = 0;
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
        files,
        preferences: { whitespaceMode: "normal" },
        repoRoot: "/fixture/large-count",
        snapshotId: "large-count-v1",
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/file-diff**", async (route) => {
    fileDiffRequestCount += 1;
    const path = new URL(route.request().url()).searchParams.get("path") ?? files[0]!.path;
    const fileDiff = processPatch(
      `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+export const item = true;\n`,
    ).files[0];
    await route.fulfill({
      body: JSON.stringify(fileDiff),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await page.getByRole("button", { name: "Flat file view" }).click();
  const search = page.getByRole("searchbox", { name: "Search files" });
  await search.fill("item-22999.ts");
  const targetPath = "huge/group-22/item-22999.ts";
  const target = page.getByRole("button", { name: new RegExp(`^${targetPath},`) });
  await expect(target).toBeVisible();
  await target.click();
  await expect(page.locator(`[data-file-path="${targetPath}"]`)).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("file")).toBe(targetPath);
  expect(await page.getByRole("button", { name: /item-\d{5}\.ts,/ }).count()).toBeLessThan(100);

  await page.keyboard.press("Control+K");
  const commandSearch = page.getByRole("combobox", {
    name: "Search DiffDeck commands and files",
  });
  await commandSearch.fill("item-21999.ts");
  const commandPath = "huge/group-21/item-21999.ts";
  expect(await page.locator("[cmdk-item]").count()).toBeLessThan(150);
  await page.getByText(commandPath, { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("file")).toBe(commandPath);
  expect(fileDiffRequestCount).toBeLessThan(200);
  expect(await page.locator("body *").count()).toBeLessThan(3_000);
});

test("200% zoom, reduced motion, and forced colors retain the primary path", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.setViewportSize({ height: 900, width: 640 });
  await expect(page.getByRole("button", { name: "Files", exact: true })).toBeVisible();
  await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Files", exact: true }).click();
  const reset = page.getByRole("button", { name: "Reset review state" });
  await reset.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(reset).toBeFocused();
  expect(await reset.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none",
  );
  await reset.click();
  const dialog = page.getByRole("dialog", { name: "Reset all review progress?" });
  await expect(dialog).toBeVisible();
  const duration = await dialog.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).animationDuration),
  );
  expect(duration).toBeLessThanOrEqual(0.01);
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("session and preference failures keep a clear recovery path", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const sessionPayload = await (await page.request.get("/api/session")).json();
  let releaseSlowSession!: () => void;
  const slowSessionGate = new Promise<void>((resolve) => {
    releaseSlowSession = resolve;
  });
  await page.route("**/api/session**", async (route) => {
    await slowSessionGate;
    await route.fulfill({ body: JSON.stringify(sessionPayload), contentType: "application/json" });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const loadingState = page.getByRole("status");
  await expect(loadingState).toContainText("Loading diff session");
  await expect(loadingState).toHaveAttribute("aria-busy", "true");
  releaseSlowSession();
  await expect(page.getByRole("main")).toBeVisible();
  await page.unroute("**/api/session**");

  await page.route("**/api/preferences", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ error: "Git could not rebuild this patch." }),
      contentType: "application/json",
      status: 500,
    });
  });
  await page.getByRole("button", { name: "Diff settings" }).click();
  await page
    .getByRole("combobox", { name: "Whitespace comparison mode" })
    .selectOption("ignore-all");
  await expect(page.getByText("Unable to change whitespace mode")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();
  await page.unroute("**/api/preferences");

  await page.route("**/api/session**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ error: "Repository is temporarily unavailable." }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.getByRole("button", { name: "Refresh diff" }).click();
  await expect(page.getByText("Unable to refresh the diff")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();

  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Repository is temporarily unavailable.");
  await page.unroute("**/api/session**");
  await page.getByRole("button", { name: "Retry session" }).click();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[data-file-path][aria-current="location"]')).toBeVisible();

  const expectedFailures = diagnostics.filter((message) => /status of (500|503)/.test(message));
  expect(expectedFailures).toHaveLength(3);
  diagnostics.splice(
    0,
    diagnostics.length,
    ...diagnostics.filter((message) => !expectedFailures.includes(message)),
  );
});

test("destructive confirmations are modal, scoped, cancellable, and restore focus", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const reset = page.getByRole("button", { name: "Reset review state" });
  await reset.click();
  const resetDialog = page.getByRole("dialog", { name: "Reset all review progress?" });
  await expect(resetDialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(resetDialog).toBeHidden();
  await expect(reset).toBeFocused();

  const selectedFile = page.locator('[data-file-path][aria-current="location"]').first();
  const fileActions = selectedFile.getByRole("button", { name: /^More actions for / });
  await fileActions.click();
  // The menu is portalled to the body, so its items are queried off the page.
  await page.getByRole("button", { name: "Revert whole file", exact: true }).click();
  const revertDialog = page.getByRole("dialog", { name: "Revert whole file?" });
  await expect(revertDialog).toContainText("permanently discards the displayed whole file");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(revertDialog).toBeHidden();
  await expect(fileActions).toBeFocused();
});

test("rich diff gutter control opens the line comment composer", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts");
  const file = page.locator('[data-file-path="src/app.ts"]');
  await expect(file).toBeVisible();

  const changedLineNumber = file
    .locator('diffs-container [data-line-type="change-addition"][data-column-number]')
    .first();
  await changedLineNumber.hover();

  const addComment = file.locator("diffs-container [data-utility-button]");
  await expect(addComment).toBeVisible();
  await addComment.click();

  const composer = file.getByRole("textbox", { name: /^Comment on additions line / });
  await expect(composer).toBeVisible();
  await composer.fill("Keep this contract explicit.");
  await file.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(file.getByText("Keep this contract explicit.", { exact: true })).toBeVisible();
});

test("accessible patch supports keyboard change navigation and the shared note model", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[data-file-path="src/app.ts"]')).toBeVisible();
  await page.getByRole("button", { name: "Open accessible linear patch view" }).click();
  const patch = page.getByRole("main", { name: /Accessible patch for/ });
  await expect(patch).toBeVisible();
  await expect(page.getByRole("button", { name: /Next changed line/ })).toBeEnabled();
  const before = page.url();
  await patch.press("]");
  await expect.poll(() => page.url()).not.toBe(before);

  const firstComment = page.getByRole("button", { name: /^Comment/ }).first();
  await firstComment.click();
  await page.getByPlaceholder("What should change?").fill("Accessible review note");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("button", { name: "Rich diff", exact: true }).click();
  await expect(
    page
      .locator('[data-file-path="src/app.ts"]')
      .getByText("Accessible review note", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open accessible linear patch view" }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => impact === "critical" || impact === "serious"),
  ).toEqual([]);
});

test("file utilities and the notes hub preserve an exact review handoff", async ({
  context,
  diagnostics,
  page,
}) => {
  void diagnostics;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4187",
  });
  await page.goto("/?file=src%2Fapp.ts");
  const file = page.locator('[data-file-path="src/app.ts"]');
  await expect(file).toBeVisible();

  // Copy actions live behind the per-file overflow menu, which portals its
  // items to the body and closes on select.
  const fileActions = file.getByRole("button", { name: "More actions for src/app.ts" });
  await fileActions.click();
  await page.getByRole("button", { name: "Copy path for src/app.ts" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("src/app.ts");
  await fileActions.click();
  await page.getByRole("button", { name: "Copy link to src/app.ts" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("file=src%2Fapp.ts");
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("permission denied")),
    });
  });
  await fileActions.click();
  await page.getByRole("button", { name: "Copy path for src/app.ts" }).click();
  await expect(page.getByText("Unable to copy file path", { exact: true })).toBeVisible();

  await file.getByRole("button", { name: "Add file-level note to src/app.ts" }).click();
  await page
    .getByRole("textbox", { name: "File-level note for src/app.ts" })
    .fill("Review API shape");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByText("Review notes", { exact: true }).click();
  await expect(page.getByText("Review API shape", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit note in src/app.ts" }).click();
  const editor = page.getByRole("textbox", { name: "Edit note for src/app.ts" });
  await editor.fill("Review the public API shape");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByText("Preview exact packet", { exact: true }).click();
  await expect(page.getByLabel("Exact markdown review packet")).toContainText(
    "Review the public API shape",
  );
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(page.getByLabel("Exact json review packet")).toContainText('"scope": "file"');
  await page.getByRole("button", { name: "Jump to note in src/app.ts" }).click();
  await expect(file).toBeVisible();
  await page.getByRole("button", { name: "Delete note in src/app.ts" }).click();
  await expect(page.getByText("Review the public API shape", { exact: true })).toBeHidden();
});

test("focus, file view, ordering, and whitespace preferences persist honestly", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts");
  await expect(page.locator('[data-file-path="src/app.ts"]')).toBeVisible();
  await page.getByRole("button", { name: "Focus selected file" }).click();
  await expect(page.getByRole("button", { name: "Show all visible files" })).toBeVisible();
  await expect(page.locator("[data-file-path]")).toHaveCount(1);

  const fileDiffPaths: string[] = [];
  const recordFileDiff = (request: import("@playwright/test").Request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/file-diff") fileDiffPaths.push(url.searchParams.get("path") ?? "");
  };
  page.on("request", recordFileDiff);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show all visible files" })).toBeVisible();
  await expect(page.locator('[data-file-path="src/app.ts"]')).toBeVisible();
  page.off("request", recordFileDiff);
  expect(fileDiffPaths.length).toBeGreaterThan(0);
  expect(new Set(fileDiffPaths)).toEqual(new Set(["src/app.ts"]));

  await page.getByRole("button", { name: "Show all visible files" }).click();
  await page.getByRole("button", { name: "Flat file view" }).click();
  await page.getByRole("combobox", { name: "Review file order" }).selectOption("status");
  await page.getByRole("button", { name: "Diff settings" }).click();
  const preferenceUpdated = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/preferences" && response.ok(),
  );
  await page
    .getByRole("combobox", { name: "Whitespace comparison mode" })
    .selectOption("ignore-eol");
  await preferenceUpdated;
  await expect(page.getByRole("combobox", { name: "Whitespace comparison mode" })).toHaveValue(
    "ignore-eol",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Flat file view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("combobox", { name: "Review file order" })).toHaveValue("status");
  await page.getByRole("button", { name: "Diff settings" }).click();
  await expect(page.getByRole("combobox", { name: "Whitespace comparison mode" })).toHaveValue(
    "ignore-eol",
  );
});
