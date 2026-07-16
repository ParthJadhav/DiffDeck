import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createFixtureRepository } from "./fixture-factory.mjs";

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function verify(profile, check) {
  const fixture = createFixtureRepository(profile);
  try {
    check(fixture);
  } finally {
    fixture.cleanup();
  }
}

verify("unborn", ({ repo }) => {
  if (git(repo, "status", "--porcelain").length !== 0) throw new Error("Unborn fixture is dirty.");
});
verify("empty", ({ repo }) => {
  if (git(repo, "diff", "HEAD").length !== 0) throw new Error("Empty fixture has a diff.");
});
verify("review", ({ repo }) => {
  if (git(repo, "diff").length === 0 || git(repo, "diff", "--cached").length === 0) {
    throw new Error("Review fixture must contain mixed staged and worktree changes.");
  }
});
verify("conflict", ({ repo }) => {
  if (git(repo, "diff", "--diff-filter=U", "--name-only").trim() !== "conflict.txt") {
    throw new Error("Conflict fixture has no unresolved path.");
  }
});
verify("edge", ({ repo, tools }) => {
  const status = git(repo, "status", "--porcelain=v1", "-z");
  if (!status.includes("unicode/こんにちは-💥.txt") || !status.includes("line\nwith-newline.txt")) {
    throw new Error("Edge fixture lost unusual paths.");
  }
  if (!Object.values(tools).every((path) => existsSync(path))) {
    throw new Error("Edge fixture is missing executable adapters.");
  }
});
verify("huge-count", ({ repo }) => {
  const paths = git(repo, "status", "--porcelain=v1", "-z").split("\0").filter(Boolean);
  if (paths.length !== 23_000) throw new Error(`Expected 23,000 paths, received ${paths.length}.`);
});

console.log("Verified disposable unborn, empty, mixed, conflict, edge, and 23,000-file fixtures.");
