import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test.beforeEach(async ({ app, screen, browser }) => {
  await app.open("/?file=src%2Fapp.ts");
  await expect(screen.getByRole("main", "Diff review workspace")).toBeVisible();
  await expect(
    browser.locator('[data-file-path="src/app.ts"][aria-current="location"]'),
  ).toBeVisible();
});

test("keyboard file search owns typing and navigates unusual paths", async ({
  screen,
  browser,
}) => {
  await browser.keyboard.press("/");
  const search = screen.getByRole("searchbox", "Search files");
  await search.pressSequentially("space # question?");
  await expect(search).toHaveValue("space # question?");
  await expect(screen.getByRole("dialog", "Diff settings")).toBeHidden();
  await search.press("Enter");
  await expect
    .poll(async () => new URL(await browser.url()).searchParams.get("file"))
    .toBe("docs/space # question?.md");
  await expect(browser.locator('[data-file-path="docs/space # question?.md"]')).toBeVisible();
});

test("filters can show zero matches and restore the review", async ({ screen, browser }) => {
  await screen.getByRole("button", /^Filter review, showing/).tap();
  await screen.getByRole("textbox", "Filter changed files by path").fill("does-not-exist");
  await expect(screen.getByText("No files match")).toBeVisible();
  await expect(browser.locator("[data-file-path]")).toHaveCount(0);
  await screen.getByRole("button", "Clear filters").tap();
  await screen.getByRole("button", "Close review filters").tap();
  await expect(
    screen.getByRole("button", /^Filter review, showing (\d+) of \1 files$/),
  ).toBeVisible();
  await expect(browser.locator('[data-file-path][aria-current="location"]')).toBeVisible();
});

test("viewed state survives reload and reset requires confirmation", async ({
  screen,
  browser,
}) => {
  const file = browser.locator('[data-file-path="src/app.ts"]');
  await file.getByRole("button", "Mark src/app.ts viewed").tap();
  await browser.reload();
  await expect(file.getByRole("button", "Mark src/app.ts unviewed")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await screen.getByRole("button", "Diff settings").tap();
  await screen.getByRole("button", "Reset review state").tap();
  const dialog = screen.getByRole("dialog", "Reset all review progress?");
  await dialog.getByRole("button", "Cancel").tap();
  await expect(file.getByRole("button", "Mark src/app.ts unviewed")).toBeVisible();
  await screen.getByRole("button", "Diff settings").tap();
  await screen.getByRole("button", "Reset review state").tap();
  await dialog.getByRole("button", "Reset review").tap();
  await expect(screen.getByRole("progressbar", /^0 of \d+ files viewed$/)).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
});

test("line notes submit by chord, edit, persist, and delete", async ({ screen, browser }) => {
  await browser.keyboard.press("c");
  const composer = screen.getByRole("textbox", /^Comment on /);
  await expect(composer).toBeFocused();
  await composer.pressSequentially("Contract note jsap");
  await composer.press("ControlOrMeta+Enter");
  const file = browser.locator('[data-file-path="src/app.ts"]');
  await expect(file.getByText("Contract note jsap")).toBeVisible();
  await file.getByRole("button", "Edit comment").tap();
  await composer.fill("Revised contract note");
  await composer.press("ControlOrMeta+Enter");
  await browser.reload();
  await expect(file.getByText("Revised contract note")).toBeVisible();
  await file.getByRole("button", "Delete comment").tap();
  await expect(file.getByText("Revised contract note")).toBeHidden();
});

test("file notes export exact valid JSON with repository and comment context", async ({
  screen,
  browser,
}) => {
  const file = browser.locator('[data-file-path="src/app.ts"]');
  await file.getByRole("button", "Add file-level note to src/app.ts").tap();
  await screen
    .getByRole("textbox", "File-level note for src/app.ts")
    .fill('Quote "newline"\nsecond line ✓');
  await screen.getByRole("button", "Add note").tap();
  let postedPacket = "";
  await browser.route("**/api/review-packet/download", async (route) => {
    postedPacket = route.request.postData ?? "";
    await route.continue();
  });
  const download = await browser.waitForDownload(() =>
    screen.getByRole("button", "Download review packet as JSON").tap(),
  );
  const packet = JSON.parse(
    await (
      await fetch(new URL("/api/review-packet/download", await browser.url()), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: postedPacket,
      })
    ).text(),
  );
  expect(download.suggestedFilename).toMatch(/^diffdeck-review-.+\.json$/);
  expect(packet.version).toBe(2);
  expect(JSON.stringify(packet)).toContain("src/app.ts");
  expect(packet.comments[0].body).toBe('Quote "newline"\nsecond line ✓');
  await screen.getByRole("tab", /^Notes/).tap();
  await screen.getByRole("button", "Clear 1 note").tap();
  await expect(screen.getByRole("button", "Confirm clear 1 note")).toBeVisible();
  await expect(screen.getByRole("button", "Copy 1 note for agent")).toBeVisible();
  await screen.getByRole("button", "Confirm clear 1 note").tap();
  await expect(screen.getByRole("button", "Copy 1 note for agent")).toBeHidden();
});

test("clipboard rejection leaves review notes available for download", async ({
  screen,
  browser,
}) => {
  await browser
    .locator('[data-file-path="src/app.ts"]')
    .getByRole("button", "Add file-level note to src/app.ts")
    .tap();
  await screen.getByRole("textbox", "File-level note for src/app.ts").fill("Preserve this handoff");
  await screen.getByRole("button", "Add note").tap();
  await browser.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("permission denied")),
    });
    return true;
  });
  await screen.getByRole("button", "Copy 1 note for agent").tap();
  await expect(screen.getByText(/Unable to copy/).first()).toBeVisible();
  let postedPacket = "";
  await browser.route("**/api/review-packet/download", async (route) => {
    postedPacket = route.request.postData ?? "";
    await route.continue();
  });
  const download = await browser.waitForDownload(() =>
    screen.getByRole("button", "Download review packet as JSON").tap(),
  );
  expect(download.suggestedFilename).toMatch(/\.json$/);
  expect(new URLSearchParams(postedPacket).get("packet")).toContain("Preserve this handoff");
});

test("cancelling a note edit restores focus to its card and preserves the saved body", async ({
  screen,
  browser,
}) => {
  for (const body of ["Other note", "Saved note"]) {
    await browser
      .locator('[data-file-path="src/app.ts"]')
      .getByRole("button", "Add file-level note to src/app.ts")
      .tap();
    await screen.getByRole("textbox", "File-level note for src/app.ts").fill(body);
    await screen.getByRole("button", "Add note").tap();
  }
  await screen.getByRole("tab", /^Notes/).tap();
  const note = browser.locator("[data-note-id]").filter({ hasText: "Saved note" });
  const id = await note.getAttribute("data-note-id");
  expect(id).not.toBeNull();
  await note.getByRole("button", "Edit note in src/app.ts").tap();
  const editor = screen.getByRole("textbox", "Edit note for src/app.ts");
  await editor.fill("Cancelled edit");
  await browser.evaluate(() => {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape")
        document.documentElement.dataset.noteEscapePrevented = String(event.defaultPrevented);
    });
    return true;
  });
  await editor.press("Escape");
  await expect(editor).toBeHidden();
  expect(
    await browser.evaluate(() => document.activeElement?.getAttribute("data-note-id") ?? null),
  ).toBe(id);
  expect(
    await browser.evaluate(() => document.documentElement.dataset.noteEscapePrevented ?? null),
  ).toBe("true");
  await expect(
    screen.getByRole("region", "Notes in src/app.ts").getByText("Saved note"),
  ).toBeVisible();
  await expect(screen.getByText("Cancelled edit")).toBeHidden();
  await note.getByRole("button", "Edit note in src/app.ts").tap();
  await editor.fill("Updated saved note");
  await editor.press("ControlOrMeta+Enter");
  await expect(editor).toBeHidden();
  expect(
    await browser.evaluate(() => document.activeElement?.getAttribute("data-note-id") ?? null),
  ).toBe(id);
  await expect(
    browser.locator(`[data-note-id="${id}"]`).getByText("Updated saved note"),
  ).toBeVisible();
  await expect(screen.getByText("Other note", { exact: true })).toBeVisible();
});

test("settings persist layout, theme, whitespace, and focused review", async ({
  screen,
  browser,
}) => {
  await screen.getByRole("button", "Focus selected file").tap();
  await expect(browser.locator("[data-file-path]")).toHaveCount(1);
  await screen.getByRole("button", "Diff settings").tap();
  const dialog = screen.getByRole("dialog", "Diff settings");
  await dialog.getByRole("button", "Dark").tap();
  await dialog.getByRole("button", "Unified").tap();
  await dialog.getByRole("checkbox", "Line nums").uncheck();
  await dialog
    .getByRole("combobox", "Whitespace comparison mode")
    .selectOption({ value: "ignore-eol" });
  await expect(dialog.getByRole("combobox", "Whitespace comparison mode")).toHaveValue(
    "ignore-eol",
  );
  await browser.reload();
  await expect(screen.getByRole("button", "Show all visible files")).toBeVisible();
  await expect
    .poll(() => browser.evaluate(() => document.documentElement.classList.contains("dark")))
    .toBe(true);
  await screen.getByRole("button", "Diff settings").tap();
  await expect(dialog.getByRole("button", "Unified")).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("checkbox", "Line nums")).not.toBeChecked();
  await expect(dialog.getByRole("combobox", "Whitespace comparison mode")).toHaveValue(
    "ignore-eol",
  );
});

test("session failure has retry recovery and refresh failure preserves existing review", async ({
  app,
  screen,
  browser,
}) => {
  await browser.route("**/api/session**", async (route) => {
    await route.fulfill({ status: 503, json: { error: "Repository temporarily unavailable" } });
  });
  await screen.getByRole("button", "Refresh diff").tap();
  await expect(screen.getByText("Unable to refresh the diff")).toBeVisible();
  await expect(browser.locator('[data-file-path="src/app.ts"]')).toBeVisible();
  await browser.reload();
  await expect(screen.getByRole("alert")).toContainText("Repository temporarily unavailable");
  await browser.unroute("**/api/session**");
  await screen.getByRole("button", "Retry session").tap();
  await expect(screen.getByRole("main", "Diff review workspace")).toBeVisible();
  expect((await fetch(new URL("/api/session", app.baseUrl))).status).toBe(200);
});

test("phone file drawer navigates and accessible view shares saved notes", async ({
  app,
  screen,
  browser,
}) => {
  await browser.setViewport({ width: 375, height: 812 });
  await screen.getByRole("button", "Files").tap();
  await screen.getByRole("button", "Open accessible linear patch view").tap();
  await screen.getByRole("button", "Review").tap();
  const patch = screen.getByRole("main", /^Accessible patch for src\/app\.ts/);
  await expect(patch).toBeVisible();
  await patch.getByRole("button", "Comment").first().tap();
  await screen.getByPlaceholder("What should change?").fill("Phone line note");
  await screen.getByRole("button", "Add note").tap();
  await screen.getByRole("button", "Rich diff").tap();
  await expect(
    browser.locator('[data-file-path="src/app.ts"]').getByText("Phone line note"),
  ).toBeVisible();
  expect(
    await browser.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await app.screenshot("phone-review-note");
});

test("hunk navigation hands immediate typing to the comment composer", async ({
  screen,
  browser,
}) => {
  await browser.keyboard.press("n");
  await expect
    .poll(async () => new URL(await browser.url()).searchParams.get("line"))
    .not.toBeNull();
  await browser.keyboard.press("c");
  // No focus readiness wait: the shortcut must transfer ownership before the
  // very next character, including letters which are global shortcuts.
  await browser.keyboard.type("hunk note jsap");
  const composer = screen.getByRole("textbox", /^Comment on /);
  await expect(composer).toHaveValue("hunk note jsap");
  await expect(composer).toBeFocused();
  await expect(screen.getByRole("dialog", "Diff settings")).toBeHidden();
});
