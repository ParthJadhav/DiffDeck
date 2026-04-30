import { processFile, processPatch, type FileContents, type FileDiffMetadata } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import type { DiffFileSummary, DiffSession } from "./types.js";

function runGit(repo: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr.length > 0 ? stderr : `git ${args.join(" ")} failed`);
  }

  return result.stdout;
}

export function resolveRepoRoot(startDirectory: string): string {
  return runGit(startDirectory, ["rev-parse", "--show-toplevel"]).trim();
}

export function getRawDiff(repoRoot: string, diffArgs: string[]): string {
  return runGit(repoRoot, [
    "diff",
    "--find-renames",
    "--submodule=diff",
    "--binary",
    "--no-color",
    "--no-ext-diff",
    ...diffArgs,
  ]);
}

function mapChangeTypeToGitStatus(type: FileDiffMetadata["type"]): GitStatus {
  switch (type) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    case "change":
    default:
      return "modified";
  }
}

function countChanges(fileDiff: FileDiffMetadata): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const hunk of fileDiff.hunks) {
    for (const block of hunk.hunkContent) {
      if (block.type === "change") {
        additions += block.additions;
        deletions += block.deletions;
      }
    }
  }

  return { additions, deletions };
}

function hasMergeConflictMarkers(contents: string): boolean {
  return /^<<<<<<< .+$/m.test(contents) && /^=======$/m.test(contents) && /^>>>>>>> .+$/m.test(contents);
}

function readWorktreeFile(repoRoot: string, path: string): string | null {
  const absolutePath = join(repoRoot, path);
  if (!existsSync(absolutePath)) return null;
  try {
    return readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
}

function readIndexFile(repoRoot: string, path: string): string | null {
  const result = spawnSync("git", ["-C", repoRoot, "show", `:${path}`], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

function createFileContents(name: string, contents: string): FileContents {
  return {
    name,
    contents,
    cacheKey: `cli-diff:contents:${name}`,
  };
}

function splitRawDiffFiles(rawDiff: string): string[] {
  return rawDiff
    .split(/(?=^diff --git)/gm)
    .map((fileDiff) => fileDiff.trimStart())
    .filter((fileDiff) => fileDiff.startsWith("diff --git"));
}

function hydrateFileDiff(
  repoRoot: string,
  rawFileDiff: string | undefined,
  partialFileDiff: FileDiffMetadata,
): FileDiffMetadata {
  if (rawFileDiff == null) return partialFileDiff;

  const oldPath = partialFileDiff.prevName ?? partialFileDiff.name;
  const newPath = partialFileDiff.name;
  const oldContents = partialFileDiff.type === "new" ? "" : readIndexFile(repoRoot, oldPath);
  const newContents = partialFileDiff.type === "deleted" ? "" : readWorktreeFile(repoRoot, newPath);

  if (oldContents == null || newContents == null) {
    return partialFileDiff;
  }

  try {
    return processFile(rawFileDiff, {
      cacheKey: partialFileDiff.cacheKey,
      isGitDiff: true,
      oldFile: createFileContents(oldPath, oldContents),
      newFile: createFileContents(newPath, newContents),
      throwOnError: true,
    }) ?? partialFileDiff;
  } catch {
    return partialFileDiff;
  }
}

function getUnmergedPaths(repoRoot: string): string[] {
  const result = spawnSync("git", ["-C", repoRoot, "diff", "--name-only", "--diff-filter=U"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function createSummary(fileDiff: FileDiffMetadata): DiffFileSummary {
  const { additions, deletions } = countChanges(fileDiff);

  return {
    path: fileDiff.name,
    prevPath: fileDiff.prevName,
    changeType: fileDiff.type,
    gitStatus: mapChangeTypeToGitStatus(fileDiff.type),
    additions,
    deletions,
  };
}

export function buildDiffSession(repoRoot: string, currentDirectory: string, diffArgs: string[]): DiffSession {
  const rawDiff = getRawDiff(repoRoot, diffArgs);
  const fileDiffs = new Map<string, FileDiffMetadata>();
  const files: DiffFileSummary[] = [];
  const unresolvedFiles = new Map<string, string>();
  const relativeDirectory = relative(repoRoot, currentDirectory);
  const currentDirectoryDisplay =
    relativeDirectory.length === 0 || relativeDirectory.startsWith("..") ? "." : relativeDirectory;

  if (rawDiff.trim().length > 0) {
    const parsedPatch = processPatch(rawDiff, "cli-diff", true);
    const rawFileDiffs = splitRawDiffFiles(rawDiff);
    const canHydrateFromWorktree = diffArgs.length === 0;
    for (const [index, partialFileDiff] of parsedPatch.files.entries()) {
      // Stable cacheKey lets the worker pool reuse highlighted output when
      // navigating back to a previously-viewed file within this session.
      const fileDiff = canHydrateFromWorktree
        ? hydrateFileDiff(repoRoot, rawFileDiffs[index], partialFileDiff)
        : partialFileDiff;
      fileDiff.cacheKey = `cli-diff:${fileDiff.name}`;
      fileDiffs.set(fileDiff.name, fileDiff);
      const summary = createSummary(fileDiff);
      const contents = readWorktreeFile(repoRoot, fileDiff.name);
      if (contents != null && hasMergeConflictMarkers(contents)) {
        summary.hasMergeConflicts = true;
        unresolvedFiles.set(fileDiff.name, contents);
      }
      files.push(summary);
    }
  }

  for (const path of getUnmergedPaths(repoRoot)) {
    const contents = readWorktreeFile(repoRoot, path);
    if (contents == null || !hasMergeConflictMarkers(contents)) continue;
    unresolvedFiles.set(path, contents);
    if (files.some((file) => file.path === path)) {
      for (const file of files) {
        if (file.path === path) file.hasMergeConflicts = true;
      }
      continue;
    }
    files.push({
      path,
      changeType: "change",
      gitStatus: "modified",
      additions: 0,
      deletions: 0,
      hasMergeConflicts: true,
    });
  }

  return {
    repoRoot,
    currentDirectory: currentDirectoryDisplay,
    diffArgs,
    files,
    fileDiffs,
    unresolvedFiles,
    rawDiff,
  };
}
