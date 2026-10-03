import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base } from "@e2e-dev/web";
import { expect } from "e2e";
import { createRepo, git, launchDiffdeck, writeRepoFile, type LiveServer } from "../e2e/harness.js";

const test = base.extend<{
  workspace: { repo: string; launch: (flags?: string[]) => Promise<LiveServer> };
}>({
  workspace: async ({ browser }, use) => {
    const fixture = createRepo(
      { "a.txt": "alpha one\nalpha two\n", "b.txt": "bravo one\nbravo two\n" },
      { "a.txt": "alpha one\nalpha two changed\n", "b.txt": "bravo CHANGED\nbravo two\n" },
    );
    const servers: LiveServer[] = [];
    try {
      await use({
        repo: fixture.repo,
        launch: async (flags = []) => {
          const server = await launchDiffdeck(fixture.repo, flags);
          servers.push(server);
          return server;
        },
      });
    } finally {
      await browser.goto("about:blank");
      for (const server of servers) await server.stop();
      fixture.cleanup();
    }
  },
});

test("write mode stages real contents and cancelled revert preserves the worktree", async ({
  workspace,
  screen,
  browser,
}) => {
  const server = await workspace.launch(["--write"]);
  await browser.goto(server.baseURL);
  const file = browser.locator('[data-file-path="a.txt"]');
  await file.getByRole("button", "More actions for a.txt").tap();
  await screen.getByRole("button", "Revert whole file").tap();
  await screen.getByRole("dialog", "Revert whole file?").getByRole("button", "Cancel").tap();
  expect(readFileSync(join(workspace.repo, "a.txt"), "utf8")).toContain("alpha two changed");
  await file.getByRole("button", "More actions for a.txt").tap();
  await screen.getByRole("button", "Stage whole file").tap();
  await expect(file).toHaveCount(0);
  expect(git(workspace.repo, "diff", "--cached")).toContain("alpha two changed");
  expect(git(workspace.repo, "diff")).not.toContain("alpha two changed");
  const b = browser.locator('[data-file-path="b.txt"]');
  await b.getByRole("button", "More actions for b.txt").tap();
  await screen.getByRole("button", "Revert whole file").tap();
  await screen
    .getByRole("dialog", "Revert whole file?")
    .getByRole("button", "Revert whole file")
    .tap();
  await expect(screen.getByRole("heading", "No diff to render")).toBeVisible();
  expect(readFileSync(join(workspace.repo, "b.txt"), "utf8")).toBe("bravo one\nbravo two\n");
});

test("cached reviews unstage without changing worktree contents", async ({
  workspace,
  screen,
  browser,
}) => {
  git(workspace.repo, "add", "a.txt");
  const server = await workspace.launch(["--write", "--cached"]);
  await browser.goto(server.baseURL);
  const file = browser.locator('[data-file-path="a.txt"]');
  await expect(browser.locator('[data-file-path="b.txt"]')).toHaveCount(0);
  await file.getByRole("button", "More actions for a.txt").tap();
  await screen.getByRole("button", "Unstage whole file").tap();
  await expect(screen.getByRole("heading", "No diff to render")).toBeVisible();
  expect(git(workspace.repo, "diff", "--cached")).toBe("");
  expect(readFileSync(join(workspace.repo, "a.txt"), "utf8")).toContain("alpha two changed");
});

test("untracked files appear only after intent-to-add, matching git diff scope", async ({
  workspace,
  screen,
  browser,
}) => {
  writeRepoFile(workspace.repo, "untracked.txt", "new file\n");
  const server = await workspace.launch();
  await browser.goto(server.baseURL);
  await expect(browser.locator('[data-file-path="a.txt"]')).toBeVisible();
  await expect(browser.locator('[data-file-path="untracked.txt"]')).toHaveCount(0);
  git(workspace.repo, "add", "-N", "untracked.txt");
  await screen.getByRole("button", "Refresh diff").tap();
  await expect(browser.locator('[data-file-path="untracked.txt"]')).toBeVisible();
});

test("repository changes after review reject staging unseen contents", async ({
  workspace,
  browser,
}) => {
  const server = await workspace.launch(["--write"]);
  await browser.goto(server.baseURL);
  await expect(browser.locator('[data-file-path="a.txt"]')).toBeVisible();
  const initial = await (await fetch(`${server.baseURL}/api/session`)).json();
  writeRepoFile(workspace.repo, "a.txt", "alpha one\nunreviewed secret change\n");
  const response = await fetch(`${server.baseURL}/api/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stage", path: "a.txt", snapshotId: initial.snapshotId }),
  });
  expect(response.status).toBe(409);
  expect(git(workspace.repo, "diff", "--cached")).toBe("");
  expect(git(workspace.repo, "diff")).toContain("unreviewed secret change");
});

test("cached revert of a staged rename restores both original index and worktree paths", async ({
  workspace,
  screen,
  browser,
}) => {
  git(workspace.repo, "restore", "a.txt", "b.txt");
  git(workspace.repo, "mv", "a.txt", "renamed.txt");
  const server = await workspace.launch(["--write", "--cached"]);
  await browser.goto(server.baseURL);
  const file = browser.locator('[data-file-path="renamed.txt"]');
  await file.getByRole("button", "More actions for renamed.txt").tap();
  await screen.getByRole("button", "Revert whole file").tap();
  await screen
    .getByRole("dialog", "Revert whole file?")
    .getByRole("button", "Revert whole file")
    .tap();
  await expect(screen.getByRole("heading", "No diff to render")).toBeVisible();
  expect(git(workspace.repo, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(workspace.repo, "a.txt"), "utf8")).toBe("alpha one\nalpha two\n");
});

test("manual and automatic watch refresh update the visible diff", async ({
  workspace,
  screen,
  browser,
}) => {
  const server = await workspace.launch(["--watch", "--watch-interval", "100"]);
  await browser.goto(`${server.baseURL}/?file=a.txt`);
  await expect(browser.locator('[data-file-path="a.txt"]')).toBeVisible();
  writeRepoFile(workspace.repo, "a.txt", "alpha one\nmanual refresh marker\n");
  await expect(screen.getByText("Repository changes detected")).toBeVisible();
  await screen.getByRole("button", "Refresh").tap();
  await expect(
    browser.locator('[data-file-path="a.txt"]').getByText("manual refresh marker"),
  ).toBeVisible();
  await screen.getByRole("button", "Diff settings").tap();
  await screen.getByRole("checkbox", "Auto refresh").check();
  await browser.keyboard.press("Escape");
  writeRepoFile(workspace.repo, "a.txt", "alpha one\nautomatic refresh marker\n");
  await expect(
    browser.locator('[data-file-path="a.txt"]').getByText("automatic refresh marker"),
  ).toBeVisible();
});

test("readonly and commit-range sessions refuse mutations", async ({
  workspace,
  screen,
  browser,
}) => {
  const readonly = await workspace.launch();
  const initial = await (await fetch(`${readonly.baseURL}/api/session`)).json();
  expect(
    (
      await fetch(`${readonly.baseURL}/api/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revert", path: "a.txt", snapshotId: initial.snapshotId }),
      })
    ).status,
  ).toBe(403);
  const range = await workspace.launch(["--write", "HEAD"]);
  await browser.goto(range.baseURL);
  await browser
    .locator('[data-file-path="a.txt"]')
    .getByRole("button", "More actions for a.txt")
    .tap();
  await expect(screen.getByRole("button", "Revert whole file")).toBeHidden();
  expect(git(workspace.repo, "diff")).toContain("alpha two changed");
});
