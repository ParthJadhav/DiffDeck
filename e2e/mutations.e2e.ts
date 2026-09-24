import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createConflictRepo, createRepo, git, launchDiffdeck, writeRepoFile } from "./harness.js";
import { expect, test } from "./test.js";

// Each test runs against its own server and disposable repository so that real
// write, watch, and reconciliation flows never leak state into other tests.
// Navigating to about:blank before stopping the server keeps browser
// diagnostics clean of connection-refused noise from the SSE stream.

test("write actions stage and revert whole files against the real repository", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const fixture = createRepo(
    { "a.txt": "alpha one\nalpha two\n", "b.txt": "bravo one\nbravo two\n" },
    { "a.txt": "alpha one\nalpha two changed\n", "b.txt": "bravo CHANGED\nbravo two\n" },
  );
  const server = await launchDiffdeck(fixture.repo, ["--write"]);
  try {
    await page.goto(`${server.baseURL}/`);
    await expect(page.getByRole("main")).toBeVisible();
    const fileA = page.locator('[data-file-path="a.txt"]');
    await expect(fileA).toBeVisible();

    await fileA.getByRole("button", { name: "More actions for a.txt" }).click();
    await page.getByRole("button", { name: "Stage whole file", exact: true }).click();
    await expect(page.getByText(/^Staged /).first()).toBeVisible();
    await expect(page.locator('[data-file-path="a.txt"]')).toHaveCount(0);
    expect(git(fixture.repo, "diff", "--cached", "--name-only")).toContain("a.txt");
    expect(git(fixture.repo, "diff", "--name-only")).not.toContain("a.txt");

    const fileB = page.locator('[data-file-path="b.txt"]');
    await fileB.getByRole("button", { name: "More actions for b.txt" }).click();
    await page.getByRole("button", { name: "Revert whole file", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Revert whole file?" });
    await dialog.getByRole("button", { name: "Revert whole file" }).click();
    await expect(page.getByText(/^Reverted /).first()).toBeVisible();
    await expect(page.locator('[data-file-path="b.txt"]')).toHaveCount(0);
    expect(readFileSync(join(fixture.repo, "b.txt"), "utf8")).toBe("bravo one\nbravo two\n");
    await expect(page.getByRole("heading", { name: "No diff to render" })).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await server.stop();
    fixture.cleanup();
  }
});

test("hunk expansion reveals context and hunk-scoped staging targets one hunk", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const baseline = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`);
  const changed = [...baseline];
  changed[2] = "line 3 changed";
  changed[36] = "line 37 changed";
  const fixture = createRepo(
    { "multi.txt": `${baseline.join("\n")}\n` },
    { "multi.txt": `${changed.join("\n")}\n` },
  );
  const server = await launchDiffdeck(fixture.repo, ["--write"]);
  try {
    await page.goto(`${server.baseURL}/?file=multi.txt`);
    const file = page.locator('[data-file-path="multi.txt"]');
    await expect(file).toBeVisible();
    await expect(file.getByText("line 3 changed", { exact: true })).toBeVisible();

    const rows = file.locator("diffs-container [data-line-type]");
    const rowsBefore = await rows.count();
    await file
      .getByRole("button", { name: /Expand unchanged lines/ })
      .first()
      .click();
    await expect.poll(() => rows.count()).toBeGreaterThan(rowsBefore);

    await file.getByRole("button", { name: "More actions for multi.txt" }).click();
    await page
      .getByRole("combobox", { name: "Action scope for multi.txt" })
      .selectOption({ label: "Hunk 2" });
    await page.getByRole("button", { name: "Stage hunk 2", exact: true }).click();
    await expect(page.getByText(/^Staged /).first()).toBeVisible();

    await expect(page.locator('[data-file-path="multi.txt"]')).toBeVisible();
    expect(git(fixture.repo, "diff", "--cached")).toContain("line 37 changed");
    expect(git(fixture.repo, "diff")).toContain("line 3 changed");
    expect(git(fixture.repo, "diff")).not.toContain("line 37 changed");
  } finally {
    await page.goto("about:blank");
    await server.stop();
    fixture.cleanup();
  }
});

test("watch events offer manual refresh and honor the auto-refresh setting", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const fixture = createRepo(
    { "watch-a.txt": "one\ntwo\n", "watch-b.txt": "ten\ntwenty\n" },
    { "watch-a.txt": "one\ntwo changed\n" },
  );
  const server = await launchDiffdeck(fixture.repo, ["--watch", "--watch-interval", "200"]);
  try {
    await page.goto(`${server.baseURL}/?file=watch-a.txt`);
    await expect(page.locator('[data-file-path="watch-a.txt"]')).toBeVisible();
    await expect(page.locator('[data-file-path="watch-b.txt"]')).toHaveCount(0);

    writeRepoFile(fixture.repo, "watch-b.txt", "ten CHANGED\ntwenty\n");
    await expect(page.getByText("Repository changes detected")).toBeVisible();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator('[data-file-path="watch-b.txt"]')).toBeVisible();

    await page.keyboard.press("s");
    const dialog = page.getByRole("dialog", { name: "Diff settings" });
    await dialog.getByRole("checkbox", { name: "Auto refresh" }).check();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    writeRepoFile(fixture.repo, "watch-a.txt", "one\ntwo changed\nthree added\n");
    await expect(page.getByText("Diff refreshed after a repository change.")).toBeVisible();
    await expect(
      page.locator('[data-file-path="watch-a.txt"]').getByText("three added", { exact: true }),
    ).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await server.stop();
    fixture.cleanup();
  }
});

test("notes reconcile to stale and resolved states and the re-review summary clears them", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const noteBaseline = Array.from({ length: 12 }, (_, index) => `alpha ${index + 1}`);
  const noteChanged = [...noteBaseline];
  noteChanged[4] = "alpha five CHANGED";
  const resolvedBaseline = Array.from({ length: 8 }, (_, index) => `row ${index + 1}`);
  const resolvedChanged = [...resolvedBaseline];
  resolvedChanged[3] = "row four CHANGED";
  const fixture = createRepo(
    {
      "note.txt": `${noteBaseline.join("\n")}\n`,
      "resolved.txt": `${resolvedBaseline.join("\n")}\n`,
    },
    {
      "note.txt": `${noteChanged.join("\n")}\n`,
      "resolved.txt": `${resolvedChanged.join("\n")}\n`,
    },
  );
  const server = await launchDiffdeck(fixture.repo);
  try {
    const addLineNote = async (path: string, body: string) => {
      await page.goto(`${server.baseURL}/?file=${encodeURIComponent(path)}`);
      const file = page.locator(`[data-file-path="${path}"]`);
      await expect(file).toBeVisible();
      await file
        .locator('diffs-container [data-line-type="change-addition"][data-column-number]')
        .first()
        .hover();
      await file.locator("diffs-container [data-utility-button]").click();
      await file.getByRole("textbox", { name: /^Comment on additions line / }).fill(body);
      await file.getByRole("button", { name: "Comment", exact: true }).click();
      await expect(file.getByText(body, { exact: true })).toBeVisible();
    };
    await addLineNote("note.txt", "Track alpha");
    await addLineNote("resolved.txt", "Resolve me");

    // The commented content becomes ambiguous in note.txt (two identical
    // additions) and disappears entirely from resolved.txt.
    const ambiguous = [...noteChanged];
    ambiguous[8] = "alpha five CHANGED";
    writeRepoFile(fixture.repo, "note.txt", `${ambiguous.join("\n")}\n`);
    const resolvedNext = [...resolvedBaseline];
    resolvedNext[6] = "row seven CHANGED";
    writeRepoFile(fixture.repo, "resolved.txt", `${resolvedNext.join("\n")}\n`);

    await page.getByRole("button", { name: "Refresh diff" }).click();
    // Stale notes flag the Notes tab so the reviewer knows to look there.
    await expect(page.getByRole("img", { name: "1 stale" })).toBeVisible();
    await page.getByRole("tab", { name: /^Notes/ }).click();
    const summary = page.getByRole("region", { name: "Re-review summary" });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("1 stale · 1 resolved");

    await page.getByRole("button", { name: "Reopen note in note.txt" }).click();
    await expect(summary).toContainText("0 stale · 1 resolved");

    await summary.getByRole("button", { name: "Clear resolved" }).click();
    await expect(summary).toBeHidden();
    await expect(page.getByText("Resolve me", { exact: true })).toBeHidden();
    await expect(page.getByText("Track alpha", { exact: true }).first()).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await server.stop();
    fixture.cleanup();
  }
});

test("the terminal packet reaches CLI stdout and a missing editor explains itself", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const fixture = createRepo({ "t.txt": "one\n" }, { "t.txt": "one\ntwo\n" });
  const server = await launchDiffdeck(fixture.repo);
  try {
    await page.goto(`${server.baseURL}/?file=t.txt`);
    const file = page.locator('[data-file-path="t.txt"]');
    await expect(file).toBeVisible();

    // The shortcut runs first while focus is still on the document body; the
    // file-actions menu suppresses shortcuts once it has been opened.
    await page.keyboard.press("o");
    await expect(page.getByText("No editor is configured")).toBeVisible();
    await file.getByRole("button", { name: "More actions for t.txt" }).click();
    await expect(page.getByRole("button", { name: "Open t.txt in editor" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await file.getByRole("button", { name: "Add file-level note to t.txt" }).click();
    await page.getByRole("textbox", { name: "File-level note for t.txt" }).fill("Ship it");
    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByRole("button", { name: "Send review packet to terminal" }).click();
    await expect(page.locator(".app-comment-action-badge")).toHaveAttribute(
      "data-status",
      "copied",
    );
    await expect.poll(() => server.output()).toContain("DIFFDECK REVIEW PACKET BEGIN");
    await expect.poll(() => server.output()).toContain("Ship it");
    expect(server.output()).toContain("DIFFDECK REVIEW PACKET END");
  } finally {
    await page.goto("about:blank");
    await server.stop();
    fixture.cleanup();
  }
});

test("cached diffs expose staged renames and the unstage write action", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const fixture = createRepo({ "old-name.txt": "renamed contents\n" });
  git(fixture.repo, "mv", "old-name.txt", "new-name.txt");
  writeRepoFile(fixture.repo, "new-name.txt", "renamed contents\nplus a new line\n");
  git(fixture.repo, "add", "new-name.txt");
  const server = await launchDiffdeck(fixture.repo, ["--write", "--cached"]);
  try {
    await page.goto(`${server.baseURL}/`);
    const file = page.locator('[data-file-path="new-name.txt"]');
    await expect(file).toBeVisible();
    await expect(file.getByText("plus a new line", { exact: true })).toBeVisible();

    await file.getByRole("button", { name: "More actions for new-name.txt" }).click();
    await page.getByRole("button", { name: "Unstage whole file", exact: true }).click();
    await expect(page.getByText(/^Unstaged /).first()).toBeVisible();
    await expect(page.locator('[data-file-path="new-name.txt"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No diff to render" })).toBeVisible();
    expect(git(fixture.repo, "diff", "--cached", "--name-only").trim()).toBe("");
  } finally {
    await page.goto("about:blank");
    await server.stop();
    fixture.cleanup();
  }
});

test("merge conflicts render the unresolved file and gate the accessible patch", async ({
  diagnostics,
  page,
}) => {
  void diagnostics;
  const fixture = createConflictRepo();
  const server = await launchDiffdeck(fixture.repo);
  try {
    await page.goto(`${server.baseURL}/`);
    const file = page.locator('[data-file-path="conflict.txt"]');
    await expect(file).toBeVisible();
    await expect(file.getByText(/<<<<<<</).first()).toBeVisible();
    await expect(file.getByText(/>>>>>>>/).first()).toBeVisible();

    await page.keyboard.press("a");
    const patch = page.getByRole("main", { name: /^Accessible patch for/ });
    await expect(patch).toBeVisible();
    await expect(patch.getByText(/conflict/i).first()).toBeVisible();
    await patch.getByRole("button", { name: "Return to rich diff" }).click();
    await expect(page.getByRole("main", { name: "Diff review workspace" })).toBeVisible();
    // The rich card refetches the unresolved file on return; let it land so
    // teardown navigation does not abort it mid-flight.
    await expect(file.getByText(/<<<<<<</).first()).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await server.stop();
    fixture.cleanup();
  }
});
