import { afterEach, describe, expect, test } from "bun:test";
import { processPatch } from "@pierre/diffs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildDiffSession } from "../src/server/git.js";

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
    expect(() => processPatch(rawDiff, "upstream-repro", true)).toThrow();

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
    expect(() => processPatch(rawDiff, "upstream-repro", true)).toThrow();

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
});
