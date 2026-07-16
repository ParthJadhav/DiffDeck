import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getRawDiff } from "../src/server/git.js";
import { isDiffWhitespaceMode, withWhitespaceMode } from "../src/server/whitespace.js";

const repos: string[] = [];

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

function runGit(repo: string, args: string[]): void {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
}

function createRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "diffdeck-whitespace-"));
  repos.push(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "test@example.com"]);
  runGit(repo, ["config", "user.name", "Test"]);
  writeFileSync(join(repo, "example.txt"), "alpha\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-qm", "initial"]);
  return repo;
}

describe("whitespace modes", () => {
  test("maps only known UI modes to fixed Git flags", () => {
    expect(withWhitespaceMode(["--cached", "--", "*.ts"], "normal")).toEqual([
      "--cached",
      "--",
      "*.ts",
    ]);
    expect(withWhitespaceMode(["--cached"], "ignore-eol")).toEqual([
      "--ignore-space-at-eol",
      "--cached",
    ]);
    expect(withWhitespaceMode([], "ignore-space-change")).toEqual(["--ignore-space-change"]);
    expect(withWhitespaceMode([], "ignore-all")).toEqual(["--ignore-all-space"]);
    expect(withWhitespaceMode([], "ignore-blank-lines")).toEqual(["--ignore-blank-lines"]);
    expect(isDiffWhitespaceMode("ignore-all")).toBe(true);
    expect(isDiffWhitespaceMode("--ignore-all-space")).toBe(false);
  });

  test("changes Git output instead of visually hiding whitespace-only lines", () => {
    const repo = createRepo();
    writeFileSync(join(repo, "example.txt"), "alpha   \n");
    expect(getRawDiff(repo, withWhitespaceMode([], "normal"))).toContain("+alpha   ");
    expect(getRawDiff(repo, withWhitespaceMode([], "ignore-eol"))).toBe("");
    expect(getRawDiff(repo, withWhitespaceMode([], "ignore-all"))).toBe("");
  });
});
