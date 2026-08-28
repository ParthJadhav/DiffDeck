import type { Page } from "@playwright/test";
import { expect, test } from "./test.js";

// Keyboard ownership: typing always wins over shortcuts, overlays own the
// keyboard while open, and every composer has an explicit way to hand the
// keyboard back (Escape) or finish (Cmd/Ctrl+Enter).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("diffdeck-e2e-initialized") === "true") return;
    localStorage.clear();
    sessionStorage.setItem("diffdeck-e2e-initialized", "true");
  });
  await page.goto("/?file=src%2Fapp.ts");
  await expect(
    page.locator('[data-file-path="src/app.ts"][aria-current="location"]'),
  ).toBeVisible();
});

const deepActiveElement = (page: Page) =>
  page.evaluate(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement != null) active = active.shadowRoot.activeElement;
    return active == null
      ? null
      : {
          ariaLabel: active.getAttribute("aria-label"),
          commentId: active.getAttribute("data-comment-id"),
          noteId: active.getAttribute("data-note-id"),
          tag: active.tagName.toLowerCase(),
        };
  });

const fileParam = (page: Page) => new URL(page.url()).searchParams.get("file");

async function openGutterComposer(page: Page) {
  const file = page.locator('[data-file-path="src/app.ts"]');
  const lineNumber = file
    .locator('diffs-container [data-line-type="change-addition"][data-column-number]')
    .first();
  // The diff renders asynchronously; boundingBox() does not wait, so settle
  // visibility first (slower CI runners hit this).
  await expect(lineNumber).toBeVisible();
  await lineNumber.hover();
  const utility = file.locator("diffs-container [data-utility-button]").first();
  await expect(utility).toBeVisible();
  const utilityBox = await utility.boundingBox();
  if (utilityBox == null) throw new Error("gutter utility button did not appear");
  await page.mouse.click(utilityBox.x + utilityBox.width / 2, utilityBox.y + utilityBox.height / 2);
  return file.getByRole("textbox", { name: /^Comment on additions line / });
}

test("typing right after the gutter click lands in the composer, not in shortcuts", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const composer = await openGutterComposer(page);
  // Every one of these letters is a global shortcut when nothing owns the keyboard.
  await page.keyboard.type("gutter note js xvc", { delay: 10 });
  await expect(composer).toHaveValue("gutter note js xvc");
  await expect(composer).toBeFocused();
  expect(fileParam(page)).toBe("src/app.ts");
  await expect(page.getByRole("dialog", { name: "Diff settings" })).toBeHidden();
  await expect(page.getByRole("main", { name: "Diff review workspace" })).toBeVisible();
});

test("hunk navigation followed by c keeps focus in the new composer", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.keyboard.press("n");
  await expect.poll(() => new URL(page.url()).searchParams.get("line")).not.toBeNull();
  await page.keyboard.press("c");
  await page.keyboard.type("hunk note js", { delay: 10 });
  const composer = page.getByRole("textbox", { name: /^Comment on / });
  await expect(composer).toHaveValue("hunk note js");
  await expect(composer).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Diff settings" })).toBeHidden();
  expect(fileParam(page)).toBe("src/app.ts");
});

test("a deep-linked line does not pull focus out of a composer", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.goto("/?file=src%2Fapp.ts&line=2&side=additions");
  await expect(
    page
      .locator('[data-file-path="src/app.ts"] diffs-container [data-line-type="change-addition"]')
      .first(),
  ).toBeVisible();
  await page.keyboard.press("c");
  await page.keyboard.type("deep note js", { delay: 10 });
  const composer = page.getByRole("textbox", { name: /^Comment on / });
  await expect(composer).toHaveValue("deep note js");
  await expect(composer).toBeFocused();
  expect(fileParam(page)).toBe("src/app.ts");
});

test("Escape leaves the composer with the draft intact and shortcuts resume", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.keyboard.press("c");
  const composer = page.getByRole("textbox", { name: /^Comment on / });
  await composer.fill("keep this draft");
  await page.keyboard.press("Escape");
  await expect(composer).toBeVisible();
  await expect(composer).toHaveValue("keep this draft");
  await expect(composer).not.toBeFocused();
  expect((await deepActiveElement(page))?.commentId).not.toBeNull();

  await page.keyboard.press("s");
  const settings = page.getByRole("dialog", { name: "Diff settings" });
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
});

test("Cmd/Ctrl+Enter submits the composer and focus stays on the saved note", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.keyboard.press("c");
  const composer = page.getByRole("textbox", { name: /^Comment on / });
  await composer.fill("submitted with the chord");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(composer).toBeHidden();
  const file = page.locator('[data-file-path="src/app.ts"]');
  await expect(file.getByText("submitted with the chord", { exact: true })).toBeVisible();
  expect((await deepActiveElement(page))?.commentId).not.toBeNull();

  await file.getByRole("button", { name: "Edit comment" }).click();
  const editor = file.getByRole("textbox", { name: /^Comment on / });
  await expect(editor).toBeFocused();
  // Editing places the caret at the end, so typing appends.
  await page.keyboard.type(" and edited");
  await expect(editor).toHaveValue("submitted with the chord and edited");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(
    file.getByText("submitted with the chord and edited", { exact: true }),
  ).toBeVisible();
});

test("cancelling a new composer keeps focus in the workspace", async ({ diagnostics, page }) => {
  void diagnostics;
  await page.keyboard.press("c");
  const composer = page.getByRole("textbox", { name: /^Comment on / });
  await expect(composer).toBeFocused();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(composer).toBeHidden();
  await expect.poll(async () => (await deepActiveElement(page))?.tag).not.toBe("body");
});

test("shortcuts stay quiet behind a modal dialog and inside popovers", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.getByRole("button", { name: "Reset review state" }).click();
  const confirmation = page.getByRole("dialog", { name: "Reset all review progress?" });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("s");
  expect(fileParam(page)).toBe("src/app.ts");
  await expect(page.getByRole("dialog", { name: "Diff settings" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();

  await page.keyboard.press("s");
  const settings = page.getByRole("dialog", { name: "Diff settings" });
  await expect(settings).toBeVisible();
  await settings.getByRole("checkbox", { name: "Line nums" }).focus();
  await page.keyboard.press("j");
  await page.keyboard.press("a");
  expect(fileParam(page)).toBe("src/app.ts");
  await expect(page.getByRole("main", { name: "Diff review workspace" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
});

test("holding a toggle key fires it once; composition keys are never shortcuts", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const file = page.locator('[data-file-path="src/app.ts"]');
  await page.keyboard.down("v");
  await page.waitForTimeout(600);
  await page.keyboard.up("v");
  await expect(file.getByRole("button", { name: "Mark src/app.ts unviewed" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.evaluate(() => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        isComposing: true,
        key: "j",
      }),
    );
  });
  expect(fileParam(page)).toBe("src/app.ts");
});

test("file-level and review-note editors honour the chord, Escape, and caret placement", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const file = page.locator('[data-file-path="src/app.ts"]');
  await file
    .getByRole("button", { name: "Add file-level note to src/app.ts" })
    .click({ force: true });
  const fileNote = page.getByRole("textbox", { name: "File-level note for src/app.ts" });
  await expect(fileNote).toBeFocused();
  await page.keyboard.type("file note jk", { delay: 10 });
  await expect(fileNote).toHaveValue("file note jk");
  expect(fileParam(page)).toBe("src/app.ts");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(fileNote).toBeHidden();
  await expect(page.getByText("Added file-level note")).toBeVisible();

  await page.getByText("Review notes", { exact: true }).click();
  await page.getByRole("button", { name: "Edit note in src/app.ts" }).click();
  const editor = page.getByRole("textbox", { name: "Edit note for src/app.ts" });
  await expect(editor).toBeFocused();
  await page.keyboard.type(" more", { delay: 10 });
  await expect(editor).toHaveValue("file note jk more");
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  expect((await deepActiveElement(page))?.noteId).not.toBeNull();

  await page.getByRole("button", { name: "Edit note in src/app.ts" }).click();
  await page.keyboard.type("!");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("file note jk!", { exact: true })).toBeVisible();
});

test("the accessible patch composer keeps typing and hands the keyboard back on Escape", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  await page.keyboard.press("a");
  await expect(page.getByRole("main", { name: /^Accessible patch for/ })).toBeVisible();
  await page
    .getByRole("button", { name: /^Comment$/ })
    .first()
    .click();
  const composer = page.getByRole("textbox", { name: /^Comment on (new|old) line/ });
  await expect(composer).toBeFocused();
  await page.keyboard.type("linear note ]a", { delay: 10 });
  await expect(composer).toHaveValue("linear note ]a");
  await expect(page.getByRole("main", { name: /^Accessible patch for/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(composer).toBeHidden();
  expect((await deepActiveElement(page))?.tag).toBe("li");

  await page
    .getByRole("button", { name: /^Comment$/ })
    .first()
    .click();
  await page.keyboard.type("saved linear note");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(
    page.getByRole("main").getByText("saved linear note", { exact: true }),
  ).toBeVisible();
});
