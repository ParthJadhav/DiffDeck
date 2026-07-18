import { buildDiffSession } from "../dist/server/git.js";
import { createFixtureRepository } from "./fixture-factory.mjs";

function verify(profile, check) {
  const fixture = createFixtureRepository(profile);
  try {
    return check(fixture);
  } finally {
    fixture.cleanup();
  }
}

for (const profile of ["unborn", "empty"]) {
  verify(profile, ({ repo }) => {
    const session = buildDiffSession(repo, repo, []);
    if (session.files.length !== 0) throw new Error(`${profile} fixture unexpectedly has a diff.`);
  });
}

verify("review", ({ repo }) => {
  const worktree = buildDiffSession(repo, repo, []);
  const cached = buildDiffSession(repo, repo, ["--cached"]);
  if (worktree.files.length === 0 || cached.files.length === 0) {
    throw new Error("Mixed review fixture did not build both worktree and cached sessions.");
  }
});

verify("conflict", ({ repo }) => {
  const session = buildDiffSession(repo, repo, []);
  const conflict = session.files.find((file) => file.path === "conflict.txt");
  if (conflict?.hasMergeConflicts !== true || !session.unresolvedFiles.has("conflict.txt")) {
    throw new Error("Combined conflict output was not represented as an unresolved file.");
  }
});

const edge = verify("edge", ({ repo }) => {
  const started = performance.now();
  const session = buildDiffSession(repo, repo, []);
  const elapsed = performance.now() - started;
  const paths = session.files.map((file) => file.path);
  const required = [
    "huge-file.txt",
    "huge-line.txt",
    "line\nwith-newline.txt",
    "line\twith-tab.txt",
    'quote"name.txt',
    "unicode/こんにちは-💥.txt",
    "vendor/submodule/module.txt",
  ];
  for (const path of required) {
    if (!paths.includes(path)) throw new Error(`Built edge session lost ${JSON.stringify(path)}.`);
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("Built edge session contains duplicate file summaries.");
  }
  const typeChange = session.files.find((file) => file.path === "type-change");
  if (
    typeChange?.changeType !== "change" ||
    typeChange.additions !== 1 ||
    typeChange.deletions !== 1
  ) {
    throw new Error("File-to-symlink type change was not coalesced as one modified file.");
  }
  return { elapsed, files: session.files.length };
});

const hugeCount = verify("huge-count", ({ repo }) => {
  const started = performance.now();
  const session = buildDiffSession(repo, repo, []);
  const elapsed = performance.now() - started;
  const unique = new Set(session.files.map((file) => file.path)).size;
  if (session.files.length !== 23_000 || unique !== 23_000) {
    throw new Error(
      `Expected 23,000 unique parsed files, received ${session.files.length}/${unique}.`,
    );
  }
  if (elapsed > 30_000) {
    throw new Error(
      `23,000-file adapter build exceeded the 30 s guardrail (${elapsed.toFixed(0)} ms).`,
    );
  }
  return { elapsed, files: session.files.length };
});

console.log(
  `Verified built adapter: edge ${edge.files} files in ${edge.elapsed.toFixed(0)} ms; ` +
    `${hugeCount.files.toLocaleString()} files in ${hugeCount.elapsed.toFixed(0)} ms.`,
);
