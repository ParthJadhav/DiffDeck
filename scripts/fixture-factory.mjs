import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createSolidPng } from "./_make-png.mjs";

export const FIXTURE_PROFILES = ["review", "empty", "unborn", "conflict", "edge", "huge-count"];

export function createFixtureRepository(profile = "review", options = {}) {
  if (!FIXTURE_PROFILES.includes(profile)) throw new Error(`Unknown fixture profile: ${profile}`);
  const root = mkdtempSync(join(tmpdir(), `diffdeck-${profile}-`));
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  const fixture = {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    profile,
    refs: {},
    repo,
    root,
    tools: {},
  };
  try {
    initializeRepo(repo);
    if (profile === "review") createReviewProfile(fixture);
    if (profile === "empty") createEmptyProfile(fixture);
    if (profile === "conflict") createConflictProfile(fixture);
    if (profile === "edge") createEdgeProfile(fixture);
    if (profile === "huge-count") createHugeCountProfile(fixture, options.fileCount ?? 23_000);
    return fixture;
  } catch (error) {
    fixture.cleanup();
    throw error;
  }
}

function initializeRepo(repo) {
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "fixture@diffdeck.local");
  git(repo, "config", "user.name", "DiffDeck Fixture");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "core.quotePath", "true");
}

function createEmptyProfile(fixture) {
  write(fixture.repo, "README.md", "# Empty diff fixture\n");
  commitAll(fixture.repo, "initial empty state");
  fixture.refs.baseline = git(fixture.repo, "rev-parse", "HEAD").trim();
}

function createReviewProfile(fixture) {
  const { repo } = fixture;
  write(repo, "README.md", "# Fixture\n\nA deterministic review fixture.\n");
  write(
    repo,
    "src/app.ts",
    [
      "export function greet(name: string) {",
      "  return `Hello ${name}`;",
      "}",
      "",
      "export function sum(a: number, b: number) {",
      "  return a + b;",
      "}",
      "",
      "export const release = 1;",
      "",
    ].join("\n"),
  );
  write(repo, "src/old-name.ts", "export const moved = true;\n");
  write(
    repo,
    "package.json",
    '{\n  "name": "fixture",\n  "dependencies": { "react": "18.0.0" }\n}\n',
  );
  write(repo, "assets/blob.bin", Buffer.from([0, 1, 2, 3, 4, 5]));
  write(repo, "assets/logo.png", createSolidPng(32, 32, 210, 68, 68));
  write(repo, "docs/space # question?.md", "# Unusual path\n");
  commitAll(repo, "baseline");
  fixture.refs.baseline = git(repo, "rev-parse", "HEAD").trim();

  write(
    repo,
    "README.md",
    "# Fixture\n\nA deterministic review fixture for keyboard, responsive, and packet flows.\n",
  );
  write(
    repo,
    "src/app.ts",
    [
      "export function greet(name: string) {",
      "  return `Hello, ${name}!`;",
      "}",
      "",
      "export function sum(a: number, b: number) {",
      "  const total = a + b;",
      "  return total;",
      "}",
      "",
      "export const release = 2;",
      "",
    ].join("\n"),
  );
  git(repo, "mv", "src/old-name.ts", "src/new-name.ts");
  write(repo, "src/new-name.ts", "export const moved = true;\nexport const renamed = true;\n");
  write(
    repo,
    "package.json",
    '{\n  "name": "fixture",\n  "dependencies": { "react": "19.0.0" }\n}\n',
  );
  write(repo, "assets/blob.bin", Buffer.from([0, 1, 9, 3, 4, 5]));
  write(repo, "assets/logo.png", createSolidPng(32, 32, 48, 116, 210));
  write(repo, "docs/space # question?.md", "# Unusual path\n\nChanged safely.\n");
  for (let index = 0; index < 72; index += 1) {
    write(repo, `generated/item-${String(index).padStart(3, "0")}.txt`, `generated ${index}\n`);
  }
  write(
    repo,
    "large.txt",
    Array.from({ length: 1_200 }, (_, index) => `line ${index}`).join("\n") + "\n",
  );
  git(repo, "add", "src/new-name.ts", "package.json");
  write(
    repo,
    "package.json",
    '{\n  "name": "fixture",\n  "dependencies": { "react": "20.0.0" }\n}\n',
  );
  git(repo, "add", "-N", "generated", "large.txt");
}

function createConflictProfile(fixture) {
  const { repo } = fixture;
  write(repo, "conflict.txt", "base\n");
  commitAll(repo, "base");
  fixture.refs.baseline = git(repo, "rev-parse", "HEAD").trim();
  git(repo, "checkout", "-qb", "incoming");
  write(repo, "conflict.txt", "incoming\n");
  commitAll(repo, "incoming");
  git(repo, "checkout", "-q", "main");
  write(repo, "conflict.txt", "current\n");
  commitAll(repo, "current");
  try {
    git(repo, "merge", "incoming");
  } catch {
    // The unresolved index and conflict markers are the intended fixture state.
  }
}

function createEdgeProfile(fixture) {
  const { repo, root } = fixture;
  const baselineFiles = {
    "-leading-dash.ts": "export const leading = 1;\n",
    "README.md": "# Edge fixture\n",
    "assets/delete.png": createSolidPng(16, 16, 50, 180, 80),
    "assets/logo.png": createSolidPng(32, 32, 220, 70, 70),
    "binary/invalid-utf8.bin": Buffer.from([0, 255, 254, 0, 128]),
    "copy-source.txt": "copy candidate\n",
    "crlf.txt": "one\r\ntwo\r\n",
    "delete-me.txt": "deleted later\n",
    "docs/space # question?.md": "special path\n",
    "line\twith-tab.txt": "tab path\n",
    "line\nwith-newline.txt": "newline path\n",
    "no-final-newline.txt": "before",
    "package.json": '{"dependencies":{"alpha":"1.0.0"}}\n',
    'quote"name.txt': "quoted path\n",
    "rename-me.txt": "renamed later\n",
    "type-change": "ordinary file\n",
    "unicode/こんにちは-💥.txt": "unicode path\n",
    "yarn.lock": 'alpha@^1.0.0:\n  version "1.0.0"\n',
  };
  for (const [path, contents] of Object.entries(baselineFiles)) write(repo, path, contents);
  write(repo, `${"nested/".repeat(12)}very-long-file-name-${"x".repeat(120)}.txt`, "long path\n");
  symlinkSync("README.md", join(repo, "internal-link"));

  const submoduleSource = join(root, "submodule-source");
  mkdirSync(submoduleSource, { recursive: true });
  initializeRepo(submoduleSource);
  write(submoduleSource, "module.txt", "submodule v1\n");
  commitAll(submoduleSource, "submodule baseline");
  git(
    repo,
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "-q",
    submoduleSource,
    "vendor/submodule",
  );
  commitAll(repo, "edge baseline");
  fixture.refs.baseline = git(repo, "rev-parse", "HEAD").trim();

  write(repo, "README.md", "# Edge fixture\n\nChanged.\n");
  write(repo, "-leading-dash.ts", "export const leading = 2;\n");
  write(repo, "crlf.txt", "one\ntwo changed\n");
  write(repo, "docs/space # question?.md", "special path changed\n");
  write(repo, "line\twith-tab.txt", "tab path changed\n");
  write(repo, "line\nwith-newline.txt", "newline path changed\n");
  write(repo, "no-final-newline.txt", "after");
  write(repo, "binary/invalid-utf8.bin", Buffer.from([0, 253, 252, 0, 129]));
  write(repo, "package.json", "{ malformed dependency manifest\n");
  write(repo, 'quote"name.txt', "quoted path changed\n");
  write(repo, "unicode/こんにちは-💥.txt", "unicode path changed\n");
  write(repo, "yarn.lock", 'alpha@^1.0.0:\n  version "2.0.0"\n');
  write(repo, "package-lock.json", '{"packages":{"":{"version":"2.0.0"}}}\n');
  write(repo, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(repo, "bun.lock", '{"lockfileVersion":1}\n');
  write(repo, "bun.lockb", Buffer.from([0, 66, 85, 78, 0]));
  write(repo, "huge-line.txt", `${"x".repeat(1_100_000)}\n`);
  write(
    repo,
    "huge-file.txt",
    Array.from({ length: 24_000 }, (_, index) => `large ${index}`).join("\n") + "\n",
  );
  write(repo, "assets/logo.png", createSolidPng(32, 32, 50, 100, 220));
  write(repo, "assets/added.webp", Buffer.from("RIFF0000WEBPVP8 ", "ascii"));
  rmSync(join(repo, "assets/delete.png"));
  rmSync(join(repo, "delete-me.txt"));
  git(repo, "mv", "rename-me.txt", "renamed.txt");
  rmSync(join(repo, "type-change"));
  symlinkSync("README.md", join(repo, "type-change"));
  write(repo, "copy-target.txt", "copy candidate\n");
  write(repo, "vendor/submodule/module.txt", "submodule dirty worktree\n");
  write(repo, "staged-then-modified.txt", "staged\n");
  git(
    repo,
    "add",
    "package-lock.json",
    "pnpm-lock.yaml",
    "bun.lock",
    "bun.lockb",
    "staged-then-modified.txt",
  );
  git(repo, "add", "-N", "assets/added.webp", "copy-target.txt", "huge-file.txt", "huge-line.txt");
  write(repo, "staged-then-modified.txt", "staged and then modified\n");

  const toolsDir = join(root, "tools");
  mkdirSync(toolsDir, { recursive: true });
  fixture.tools.success = executable(toolsDir, "success", "#!/bin/sh\necho fixture-success\n");
  fixture.tools.failure = executable(
    toolsDir,
    "failure",
    "#!/bin/sh\necho fixture-failure >&2\nexit 2\n",
  );
  fixture.tools.slow = executable(toolsDir, "slow", "#!/bin/sh\nsleep 5\n");
  fixture.tools.largeOutput = executable(
    toolsDir,
    "large-output",
    "#!/bin/sh\nyes x | head -c 700000\n",
  );
}

function createHugeCountProfile(fixture, fileCount) {
  if (!Number.isInteger(fileCount) || fileCount < 23_000) {
    throw new Error("The huge-count fixture requires at least 23,000 files.");
  }
  write(fixture.repo, "README.md", "# Huge file-count fixture\n");
  commitAll(fixture.repo, "baseline");
  fixture.refs.baseline = git(fixture.repo, "rev-parse", "HEAD").trim();
  for (let index = 0; index < fileCount; index += 1) {
    const padded = String(index).padStart(5, "0");
    write(fixture.repo, `huge/group-${padded.slice(0, 2)}/item-${padded}.txt`, `${padded}\n`);
  }
  git(fixture.repo, "add", "-N", "huge");
}

function commitAll(repo, message) {
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", message);
}

function executable(directory, name, contents) {
  const path = join(directory, name);
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
  return path;
}

function write(repo, path, contents) {
  const absolute = join(repo, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function git(repo, ...args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
