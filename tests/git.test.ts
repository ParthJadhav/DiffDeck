import { afterEach, describe, expect, test } from "bun:test";
import { processPatch } from "@pierre/diffs";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildDiffSession,
  buildDiffSessionFromRawDiff,
  getRawDiff,
  getRawDiffAsync,
  resolveRepoRoot,
} from "../src/server/git.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

function runGit(repo: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }

  return result.stdout;
}

async function createRepoWithQuotedPathDiff(path: string): Promise<string> {
  const repo = mkdtempSync(join(tmpdir(), "diffdeck-quoted-path-"));
  tempRepos.push(repo);

  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "test@example.com"]);
  runGit(repo, ["config", "user.name", "Test"]);

  const absolutePath = join(repo, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, "one\n-- old content\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-qm", "initial"]);

  writeFileSync(absolutePath, "one\n++ new content\n");
  return repo;
}

async function createRepoWithModifiedFile(path: string): Promise<string> {
  const repo = mkdtempSync(join(tmpdir(), "diffdeck-modified-path-"));
  tempRepos.push(repo);

  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "test@example.com"]);
  runGit(repo, ["config", "user.name", "Test"]);

  const absolutePath = join(repo, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, "old\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-qm", "initial"]);

  writeFileSync(absolutePath, "new\n");
  return repo;
}

describe("buildDiffSession", () => {
  test("normalizes quoted git path headers before parsing", async () => {
    const weirdPath = "dir/weird\ttab\\slash\nline.txt";
    const repo = await createRepoWithQuotedPathDiff(weirdPath);
    const rawDiff = runGit(repo, [
      "-c",
      "core.quotePath=false",
      "diff",
      "--find-renames",
      "--submodule=diff",
      "--binary",
      "--no-color",
      "--no-ext-diff",
    ]);

    expect(rawDiff).toContain('"a/dir/weird\\ttab\\\\slash\\nline.txt"');
    const upstream = processPatch(rawDiff, "upstream-repro", true);
    expect(upstream.files[0]?.name).not.toBe(weirdPath);

    const session = buildDiffSession(repo, repo, []);
    expect(session.files).toHaveLength(1);
    expect(session.files[0]).toMatchObject({
      path: weirdPath,
      changeType: "change",
      gitStatus: "modified",
      additions: 1,
      deletions: 1,
    });
    expect(session.fileDiffs.get(weirdPath)?.name).toBe(weirdPath);
  });

  test("normalizes mixed quoted and unquoted rename headers", async () => {
    const repo = mkdtempSync(join(tmpdir(), "diffdeck-mixed-quoted-rename-"));
    tempRepos.push(repo);

    runGit(repo, ["init", "-q"]);
    runGit(repo, ["config", "user.email", "test@example.com"]);
    runGit(repo, ["config", "user.name", "Test"]);

    writeFileSync(join(repo, "plain.txt"), "same content\n");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-qm", "initial"]);
    runGit(repo, ["mv", "plain.txt", "weird\ttab.txt"]);

    const rawDiff = runGit(repo, [
      "-c",
      "core.quotePath=false",
      "diff",
      "--cached",
      "--find-renames",
      "--submodule=diff",
      "--binary",
      "--no-color",
      "--no-ext-diff",
    ]);

    expect(rawDiff).toContain('diff --git a/plain.txt "b/weird\\ttab.txt"');
    const upstream = processPatch(rawDiff, "upstream-repro", true);
    expect(upstream.files[0]?.name).not.toBe("weird\ttab.txt");

    const session = buildDiffSession(repo, repo, ["--cached"]);
    expect(session.files).toHaveLength(1);
    expect(session.files[0]).toMatchObject({
      path: "weird\ttab.txt",
      prevPath: "plain.txt",
      changeType: "rename-pure",
      gitStatus: "renamed",
      additions: 0,
      deletions: 0,
    });
    expect(session.fileDiffs.get("weird\ttab.txt")?.prevName).toBe("plain.txt");
  });

  test("uses file marker paths when unquoted diff headers contain b/ inside the path", async () => {
    const weirdPath = "folder b/name.txt";
    const repo = await createRepoWithModifiedFile(weirdPath);
    const rawDiff = runGit(repo, [
      "-c",
      "core.quotePath=false",
      "diff",
      "--find-renames",
      "--submodule=diff",
      "--binary",
      "--no-color",
      "--no-ext-diff",
    ]);

    expect(rawDiff).toContain("diff --git a/folder b/name.txt b/folder b/name.txt");

    const session = buildDiffSession(repo, repo, []);
    expect(session.files).toHaveLength(1);
    expect(session.files[0]).toMatchObject({
      path: weirdPath,
      changeType: "change",
      gitStatus: "modified",
      additions: 1,
      deletions: 1,
    });
    expect(session.fileDiffs.get(weirdPath)?.name).toBe(weirdPath);
  });

  test("debug mode logs line-numbered raw diff context", async () => {
    const repo = await createRepoWithModifiedFile("src/example.txt");
    const logs: string[] = [];

    const session = buildDiffSession(repo, repo, [], {
      debug: true,
      log: (message) => logs.push(message),
    });

    expect(session.files).toHaveLength(1);
    expect(logs.some((line) => line.includes("file 1: lines 1-"))).toBe(true);
    expect(logs.some((line) => line.includes("header: diff --git a/src/example.txt"))).toBe(true);
  });

  test("builds worktree, cached, commit, and symmetric range sessions consistently", async () => {
    const repo = await createRepoWithModifiedFile("nested/example.txt");
    expect(resolveRepoRoot(join(repo, "nested"))).toBe(realpathSync(repo));
    expect(await getRawDiffAsync(repo, [])).toBe(getRawDiff(repo, []));

    const worktree = buildDiffSession(repo, join(repo, "nested"), []);
    expect(worktree.currentDirectory).toBe("nested");
    expect(worktree.files.map((file) => file.path)).toEqual(["nested/example.txt"]);

    runGit(repo, ["add", "nested/example.txt"]);
    const cached = buildDiffSession(repo, repo, ["--cached"]);
    expect(cached.files).toHaveLength(1);
    runGit(repo, ["commit", "-qm", "update"]);

    for (const args of [["HEAD~1", "HEAD"], ["HEAD~1...HEAD"]]) {
      const range = buildDiffSession(repo, repo, args);
      expect(range.files[0]).toMatchObject({
        additions: 1,
        deletions: 1,
        path: "nested/example.txt",
      });
      expect(range.snapshotId).not.toBe(worktree.snapshotId);
    }
  });

  test("classifies binary changes and unresolved merge conflicts", () => {
    const binaryRepo = mkdtempSync(join(tmpdir(), "diffdeck-binary-"));
    tempRepos.push(binaryRepo);
    runGit(binaryRepo, ["init", "-q", "-b", "main"]);
    runGit(binaryRepo, ["config", "user.email", "test@example.com"]);
    runGit(binaryRepo, ["config", "user.name", "Test"]);
    writeFileSync(join(binaryRepo, "asset.bin"), Buffer.from([0, 1, 2, 3]));
    runGit(binaryRepo, ["add", "."]);
    runGit(binaryRepo, ["commit", "-qm", "initial"]);
    writeFileSync(join(binaryRepo, "asset.bin"), Buffer.from([0, 1, 9, 3]));
    expect(buildDiffSession(binaryRepo, binaryRepo, []).files[0]).toMatchObject({
      isBinary: true,
      path: "asset.bin",
    });

    const conflictRepo = mkdtempSync(join(tmpdir(), "diffdeck-conflict-"));
    tempRepos.push(conflictRepo);
    runGit(conflictRepo, ["init", "-q", "-b", "main"]);
    runGit(conflictRepo, ["config", "user.email", "test@example.com"]);
    runGit(conflictRepo, ["config", "user.name", "Test"]);
    writeFileSync(join(conflictRepo, "conflict.txt"), "base\n");
    writeFileSync(join(conflictRepo, "normal.txt"), "before\n");
    runGit(conflictRepo, ["add", "."]);
    runGit(conflictRepo, ["commit", "-qm", "base"]);
    runGit(conflictRepo, ["checkout", "-qb", "incoming"]);
    writeFileSync(join(conflictRepo, "conflict.txt"), "incoming\n");
    runGit(conflictRepo, ["commit", "-qam", "incoming"]);
    runGit(conflictRepo, ["checkout", "-q", "main"]);
    writeFileSync(join(conflictRepo, "conflict.txt"), "current\n");
    runGit(conflictRepo, ["commit", "-qam", "current"]);
    const merge = spawnSync("git", ["-C", conflictRepo, "merge", "incoming"], {
      encoding: "utf8",
    });
    expect(merge.status).not.toBe(0);
    writeFileSync(join(conflictRepo, "normal.txt"), "after\n");
    const conflict = buildDiffSession(conflictRepo, conflictRepo, []);
    expect(conflict.files.find((file) => file.path === "conflict.txt")).toMatchObject({
      hasMergeConflicts: true,
      path: "conflict.txt",
    });
    expect(conflict.files.find((file) => file.path === "normal.txt")).toMatchObject({
      additions: 1,
      deletions: 1,
    });
    expect(conflict.unresolvedFiles.get("conflict.txt")).toContain("<<<<<<< HEAD");
  });

  test("coalesces file-to-symlink type changes without reading the symlink target", () => {
    const root = mkdtempSync(join(tmpdir(), "diffdeck-symlink-type-change-"));
    tempRepos.push(root);
    const repo = join(root, "repo");
    runGit(root, ["init", "-q", "-b", "main", repo]);
    runGit(repo, ["config", "user.email", "test@example.com"]);
    runGit(repo, ["config", "user.name", "Test"]);
    writeFileSync(join(repo, "type-change"), "ordinary file\n");
    writeFileSync(join(root, "outside-secret.txt"), "must never enter the diff\n");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-qm", "baseline"]);
    rmSync(join(repo, "type-change"));
    symlinkSync("../outside-secret.txt", join(repo, "type-change"));

    const session = buildDiffSession(repo, repo, []);
    expect(session.files.filter((file) => file.path === "type-change")).toEqual([
      expect.objectContaining({
        additions: 1,
        changeType: "change",
        deletions: 1,
        gitStatus: "modified",
      }),
    ]);
    const fileDiff = session.fileDiffs.get("type-change");
    expect(fileDiff?.deletionLines.join("")).toContain("ordinary file");
    expect(fileDiff?.additionLines.join("")).toContain("../outside-secret.txt");
    expect(fileDiff?.additionLines.join("")).not.toContain("must never enter the diff");
  });

  test("returns an empty session for a clean repository and reports invalid repositories", async () => {
    const repo = mkdtempSync(join(tmpdir(), "diffdeck-clean-"));
    tempRepos.push(repo);
    runGit(repo, ["init", "-q", "-b", "main"]);
    runGit(repo, ["config", "user.email", "test@example.com"]);
    runGit(repo, ["config", "user.name", "Test"]);
    writeFileSync(join(repo, "README.md"), "clean\n");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-qm", "initial"]);
    expect(buildDiffSession(repo, repo, []).files).toEqual([]);
    expect(() => resolveRepoRoot(join(repo, "missing"))).toThrow("cannot change to");
    await expect(getRawDiffAsync(join(repo, "missing"), [])).rejects.toThrow("cannot change to");
  });

  test("reports bounded raw context when upstream parsing fails", () => {
    const repo = mkdtempSync(join(tmpdir(), "diffdeck-malformed-patch-"));
    tempRepos.push(repo);
    runGit(repo, ["init", "-q", "-b", "main"]);
    const malformed = [
      "diff --git a/file.txt b/file.txt",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ malformed",
      "+oops",
      "",
    ].join("\n");

    try {
      buildDiffSessionFromRawDiff(repo, repo, ["HEAD~1...HEAD"], malformed);
      throw new Error("Expected malformed patch parsing to fail.");
    } catch (error) {
      expect(error).toMatchObject({ message: "Failed to parse git diff output." });
      const details = (error as { details?: string[] }).details ?? [];
      expect(details).toContain("git diff args: HEAD~1...HEAD");
      expect(details.some((line) => line.includes("raw diff:"))).toBe(true);
      expect(details.some((line) => line.includes("file 1: lines"))).toBe(true);
      expect(details).toContain("nearest raw diff lines:");
      expect(details.some((line) => line.includes("diff --git a/file.txt"))).toBe(true);
    }
  });

  test("keeps partial metadata when worktree hydration inputs disappear", () => {
    const repo = mkdtempSync(join(tmpdir(), "diffdeck-missing-hydration-"));
    tempRepos.push(repo);
    runGit(repo, ["init", "-q", "-b", "main"]);
    const logs: string[] = [];
    const rawDiff = [
      "diff --git a/missing-index.txt b/missing-index.txt",
      "index 1111111..2222222 100644",
      "--- a/missing-index.txt",
      "+++ b/missing-index.txt",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/missing-worktree.txt b/missing-worktree.txt",
      "new file mode 100644",
      "index 0000000..3333333",
      "--- /dev/null",
      "+++ b/missing-worktree.txt",
      "@@ -0,0 +1 @@",
      "+new",
      "",
    ].join("\n");

    const session = buildDiffSessionFromRawDiff(repo, repo, [], rawDiff, {
      debug: true,
      log: (message) => logs.push(message),
    });
    expect(session.files.map((file) => file.path)).toEqual([
      "missing-index.txt",
      "missing-worktree.txt",
    ]);
    expect(logs.some((line) => line.includes("readIndexFile returned null"))).toBe(true);
    expect(logs.some((line) => line.includes("readWorktreeFile returned null"))).toBe(true);
  });
});
