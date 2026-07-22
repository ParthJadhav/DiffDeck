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

test("command palette lists, filters, and executes review commands", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts");
  await expect(page.locator('[data-file-path="src/app.ts"]')).toBeVisible();

  await page.keyboard.press("?");
  const palette = page.getByRole("combobox", { name: "Search DiffDeck commands and files" });
  await expect(palette).toBeVisible();
  await expect(page.getByRole("option", { name: /^Next visible file/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /^Toggle viewed/ })).toBeVisible();

  await palette.fill("zzz-no-such-command");
  await expect(page.getByText("No matching command.")).toBeVisible();
  await palette.fill("");

  await page.getByRole("option", { name: /^Next visible file/ }).click();
  await expect(palette).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get("file")).not.toBe("src/app.ts");

  await page.keyboard.press("Control+K");
  await page.getByRole("option", { name: /^Open settings/ }).click();
  const settings = page.getByRole("dialog", { name: "Diff settings" });
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  await page.keyboard.press("?");
  await page.getByRole("option", { name: /^Open accessible linear patch view/ }).click();
  await expect(page.getByRole("main", { name: /^Accessible patch for/ })).toBeVisible();
  await page.keyboard.press("?");
  await page.getByRole("option", { name: /^Return to rich diff view/ }).click();
  await expect(page.getByRole("main", { name: "Diff review workspace" })).toBeVisible();
});

test("global shortcuts drive files, hunks, surfaces, and composers", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts");
  await expect(
    page.locator('[data-file-path="src/app.ts"][aria-current="location"]'),
  ).toBeVisible();

  await page.keyboard.press("j");
  await expect.poll(() => new URL(page.url()).searchParams.get("file")).not.toBe("src/app.ts");
  await page.keyboard.press("k");
  await expect.poll(() => new URL(page.url()).searchParams.get("file")).toBe("src/app.ts");

  // Collapse while the selection is deterministically on src/app.ts; hunk
  // navigation below may legitimately move the selection to another file.
  await page.keyboard.press("x");
  await expect(page.getByRole("button", { name: "Expand src/app.ts" })).toBeVisible();
  await page.keyboard.press("x");
  await expect(page.getByRole("button", { name: "Collapse src/app.ts" })).toBeVisible();

  await page.keyboard.press("n");
  await expect.poll(() => new URL(page.url()).searchParams.get("line")).not.toBeNull();

  await page.keyboard.press("a");
  await expect(page.getByRole("main", { name: /^Accessible patch for/ })).toBeVisible();
  await page.keyboard.press("a");
  await expect(page.getByRole("main", { name: "Diff review workspace" })).toBeVisible();

  await page.keyboard.press("f");
  await expect(page.getByRole("button", { name: "Show all visible files" })).toBeVisible();
  await expect(page.locator("[data-file-path]")).toHaveCount(1);
  await page.keyboard.press("f");
  await expect(page.getByRole("button", { name: "Focus selected file" })).toBeVisible();

  await page.keyboard.press("c");
  const composer = page.getByRole("textbox", { name: /^Comment on / });
  await expect(composer).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(composer).toBeHidden();

  await page.keyboard.press("s");
  const settings = page.getByRole("dialog", { name: "Diff settings" });
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
});

test("viewed lifecycle: mark, skip, persist, filter, and reset", async ({ diagnostics, page }) => {
  void diagnostics;
  // The tree orders directories first, so the review opens on assets/blob.bin.
  const first = page.locator('[data-file-path="assets/blob.bin"]');
  await expect(page.locator('[data-file-path][aria-current="location"]')).toHaveAttribute(
    "data-file-path",
    "assets/blob.bin",
  );

  await first.getByRole("button", { name: "Mark assets/blob.bin viewed" }).click();
  await expect(
    first.getByRole("button", { name: "Mark assets/blob.bin unviewed" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(first.getByRole("button", { name: "Expand assets/blob.bin" })).toBeVisible();
  await expect(page.getByLabel(/^1 of \d+ files viewed$/)).toBeVisible();

  await page.keyboard.press("Shift+J");
  await expect.poll(() => new URL(page.url()).searchParams.get("file")).not.toBe("assets/blob.bin");

  await page.reload();
  await expect(page.getByLabel(/^1 of \d+ files viewed$/)).toBeVisible();

  await page.getByRole("button", { name: /^Filter review, showing/ }).click();
  await page.getByRole("checkbox", { name: "Hide viewed" }).check();
  await expect(page.locator('[data-file-path="assets/blob.bin"]')).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Reset review state" }).click();
  await page.getByRole("button", { name: "Reset review", exact: true }).click();
  await expect(page.getByLabel(/^0 of \d+ files viewed$/)).toBeVisible();
  await expect(page.locator('[data-file-path="assets/blob.bin"]')).toBeVisible();
});

test("review filters narrow files truthfully and clear honestly", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.keyboard.press("/");
  await expect(page.getByRole("dialog", { name: "Filter review" })).toBeVisible();
  const pathFilter = page.getByRole("textbox", { name: "Filter changed files by path" });
  await expect(pathFilter).toBeFocused();

  await pathFilter.fill("src/");
  await expect(page.getByText(/^Showing 1 of \d+ changed files$/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Filter review, showing 1 of \d+ files, 1 active$/ }),
  ).toBeVisible();
  await expect(page.locator("[data-file-path]")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear path filter" }).click();

  await page.getByRole("textbox", { name: "Filter by file extensions" }).fill("md");
  await expect(page.getByText(/^Showing 2 of \d+ changed files$/)).toBeVisible();
  await expect(page.locator('[data-file-path="README.md"]')).toBeVisible();
  await page.getByRole("textbox", { name: "Filter by file extensions" }).fill("");

  await page.getByRole("checkbox", { name: "Dependencies" }).check();
  await expect(page.getByText(/^Showing 1 of \d+ changed files$/)).toBeVisible();
  await expect(page.locator('[data-file-path="package.json"]')).toBeVisible();
  await page.getByRole("checkbox", { name: "Dependencies" }).uncheck();

  await page.getByRole("combobox", { name: "Filter by Git status" }).selectOption({
    label: "Modified",
  });
  await expect(page.getByText(/^Showing 6 of \d+ changed files$/)).toBeVisible();
  await expect(page.locator('[data-file-path="src/app.ts"]')).toBeVisible();

  await page.getByRole("checkbox", { name: "Conflicts only" }).check();
  await expect(page.getByText(/^Showing 0 of \d+ changed files$/)).toBeVisible();
  await expect(page.getByText("No files match")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("checkbox", { name: "Conflicts only" })).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: /^Filter review, showing (\d+) of \1 files$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close review filters" }).click();
  await expect(page.getByRole("dialog", { name: "Filter review" })).toBeHidden();
});

test("comment lifecycle: edit, persist, delete, packet actions, clear all", async ({
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

  const changedLineNumber = file
    .locator('diffs-container [data-line-type="change-addition"][data-column-number]')
    .first();
  await changedLineNumber.hover();
  await file.locator("diffs-container [data-utility-button]").click();
  const composer = file.getByRole("textbox", { name: /^Comment on additions line / });
  await composer.fill("First pass note");
  await file.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(file.getByText("First pass note", { exact: true })).toBeVisible();

  await file.getByRole("button", { name: "Edit comment" }).click();
  const editor = file.getByRole("textbox", { name: /^Comment on additions line / });
  await expect(editor).toHaveValue("First pass note");
  await editor.fill("Edited pass note");
  await file.getByRole("button", { name: "Save", exact: true }).click();
  await expect(file.getByText("Edited pass note", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-file-path="src/app.ts"]')).toBeVisible();
  await expect(
    page.locator('[data-file-path="src/app.ts"]').getByText("Edited pass note", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Copy 1 comment with context" }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("Edited pass note");
  expect(clipboard).toContain("src/app.ts");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download review packet as JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^diffdeck-review-.+\.json$/);

  const terminalResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/review-packet" && response.status() === 202,
  );
  await page.getByRole("button", { name: "Send review packet to terminal" }).click();
  await terminalResponse;
  await expect(page.locator(".app-comment-action-badge")).toHaveAttribute("data-status", "copied");

  await page
    .locator('[data-file-path="src/app.ts"]')
    .getByRole("button", { name: "Delete comment" })
    .click();
  await expect(page.getByText("Edited pass note", { exact: true })).toBeHidden();
  await expect(page.getByRole("region", { name: "Comment actions" })).toBeHidden();

  await page
    .locator('[data-file-path="src/app.ts"]')
    .getByRole("button", { name: "Add file-level note to src/app.ts" })
    .click();
  await page
    .getByRole("textbox", { name: "File-level note for src/app.ts" })
    .fill("Sweep the whole module");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("button", { name: "Clear 1 comment" }).click();
  await page.getByRole("button", { name: "Confirm clear 1 comment" }).click();
  await expect(page.getByRole("button", { name: /^Copy \d+ comment/ })).toBeHidden();
});

test("deep links with line and side land on the requested change", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts&line=2&side=additions");
  await expect(
    page.locator('[data-file-path="src/app.ts"][aria-current="location"]'),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-file-path="src/app.ts"] diffs-container [data-line-type="change-addition"]')
      .first(),
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("file")).toBe("src/app.ts");
  await expect.poll(() => new URL(page.url()).searchParams.get("line")).toBe("2");
  await expect.poll(() => new URL(page.url()).searchParams.get("side")).toBe("additions");
});

test("image diff supports side-by-side, overlay, and swipe modes", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.goto("/?file=assets%2Flogo.png");
  const imageDiff = page.getByRole("region", { name: "Image diff for assets/logo.png" });
  await expect(imageDiff).toBeVisible();
  await expect(imageDiff.getByRole("img", { name: "Before version" })).toBeVisible();
  await expect(imageDiff.getByRole("img", { name: "After version" })).toBeVisible();

  const modeGroup = imageDiff.getByRole("group", { name: "Image comparison mode" });
  await expect(modeGroup.getByRole("button", { name: "Side by side" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await modeGroup.getByRole("button", { name: "Overlay" }).click();
  await expect(imageDiff.getByRole("slider", { name: "Overlay opacity" })).toBeVisible();

  await modeGroup.getByRole("button", { name: "Swipe" }).click();
  await expect(imageDiff.getByRole("slider", { name: "Swipe reveal percentage" })).toBeVisible();

  await modeGroup.getByRole("button", { name: "Side by side" }).click();
  await expect(imageDiff.getByRole("img", { name: "Before version" })).toBeVisible();
});

test("dependency summary toggles to the raw source diff and back", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.goto("/?file=package.json");
  const file = page.locator('[data-file-path="package.json"]');
  const summary = page.getByRole("region", { name: "Dependency changes for package.json" });
  await expect(summary).toBeVisible();
  await expect(page.getByText("19.0.0 → 20.0.0")).toBeVisible();

  await file.getByRole("button", { name: "Show source diff" }).click();
  await expect(summary).toBeHidden();
  await expect(file.locator("diffs-container")).toBeVisible();

  await file.getByRole("button", { name: "Show package summary" }).click();
  await expect(
    page.getByRole("region", { name: "Dependency changes for package.json" }),
  ).toBeVisible();
});

test("binary and unusual paths stay reviewable", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.goto("/?file=assets%2Fblob.bin");
  await expect(page.locator('[data-file-path="assets/blob.bin"]')).toBeVisible();
  await expect(page.getByText("Binary file not shown")).toBeVisible();

  await page.getByRole("button", { name: "Flat file view" }).click();
  const search = page.getByRole("searchbox", { name: "Search files" });
  await search.fill("space");
  await page.getByRole("button", { name: /^docs\/space # question\?\.md,/ }).click();
  await expect(page.locator('[data-file-path="docs/space # question?.md"]')).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("file"))
    .toBe("docs/space # question?.md");
});

test("diff settings apply theme, layout, and line numbers live", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts");
  await expect(page.locator('[data-file-path="src/app.ts"]')).toBeVisible();

  await page.getByRole("button", { name: "Diff settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Diff settings" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Dark", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
    .toBe(true);
  await dialog.getByRole("button", { name: "Light", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains("light")))
    .toBe(true);

  await dialog.getByRole("button", { name: "Unified", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Unified", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const lineNumbers = dialog.getByRole("checkbox", { name: "Line nums" });
  await lineNumbers.uncheck();
  await expect(lineNumbers).not.toBeChecked();
  await lineNumbers.check();
  await expect(lineNumbers).toBeChecked();

  await page.keyboard.press("Escape");
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains("light")))
    .toBe(true);
  await page.getByRole("button", { name: "Diff settings" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Diff settings" })
      .getByRole("button", { name: "Unified", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("auto-collapsed large files expand on demand", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.goto("/?file=large.txt");
  const file = page.locator('[data-file-path="large.txt"]');
  await expect(file).toBeVisible();
  await expect(file.getByRole("button", { name: "Expand large.txt" })).toBeVisible();

  await file.getByRole("button", { name: "Expand large.txt" }).click();
  await expect(file.getByText("line 0", { exact: true })).toBeVisible();

  await file.getByRole("button", { name: "Collapse large.txt" }).click();
  await expect(file.getByText("line 0", { exact: true })).toBeHidden();
});

test("heavy diffs fall back to lightweight rendering", async ({ diagnostics, page }) => {
  void diagnostics;
  const heavyPath = "heavy/big-module.ts";
  const heavyLines = Array.from(
    { length: 2_500 },
    (_, index) => `+export const v${index} = ${index};`,
  );
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
        files: [
          {
            additions: 2_500,
            changeType: "new",
            deletions: 0,
            diffId: "heavy-1",
            gitStatus: "added",
            path: heavyPath,
          },
        ],
        preferences: { whitespaceMode: "normal" },
        repoRoot: "/fixture/heavy",
        snapshotId: "heavy-v1",
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/file-diff**", async (route) => {
    const fileDiff = processPatch(
      `diff --git a/${heavyPath} b/${heavyPath}\nnew file mode 100644\n--- /dev/null\n+++ b/${heavyPath}\n@@ -0,0 +1,2500 @@\n${heavyLines.join("\n")}\n`,
    ).files[0];
    await route.fulfill({
      body: JSON.stringify(fileDiff),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const heavyFile = page.locator(`[data-file-path="${heavyPath}"]`);
  await expect(heavyFile).toBeVisible();
  // Files this large start auto-collapsed; the lightweight renderer appears
  // once the reviewer expands the card.
  await heavyFile.getByRole("button", { name: "Expand heavy/big-module.ts" }).click();
  await expect(page.getByLabel(/diff rows \(lightweight rendering\)/)).toBeVisible();
});

test("editor opens from the file menu and the o shortcut", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts");
  const file = page.locator('[data-file-path="src/app.ts"]');
  await expect(file).toBeVisible();

  // The shortcut runs first while focus is still on the document body; the
  // file-actions menu suppresses shortcuts once it has been opened.
  await page.keyboard.press("o");
  await expect(page.getByText("Opened selected file in editor.")).toBeVisible();

  await file.getByRole("button", { name: "More actions for src/app.ts" }).click();
  await page.getByRole("button", { name: "Open src/app.ts in editor" }).click();
  await expect(page.getByText(/^Opened src\/app\.ts/).first()).toBeVisible();
});
