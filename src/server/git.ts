import { processFile, processPatch, type FileContents, type FileDiffMetadata } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import type { DiffFileSummary, DiffSession } from "./types.js";
import { buildCacheKey } from "./cacheKey.js";

// Node's spawnSync defaults maxBuffer to 1 MB, which is easily exceeded by
// real-world diffs (huge lockfiles, generated code, binary patches). Allow up
// to 512 MB so a single oversized file doesn't break the whole session.
const GIT_MAX_BUFFER = 512 * 1024 * 1024;
const DIFF_GIT_PREFIX = "diff --git ";
const PARSER_PATH_PREFIX = ".diffdeck-parser-path";

type GitDiffHeaderPaths = {
  oldPath: string;
  newPath: string;
};

type GitPathToken = {
  value: string;
  end: number;
};

type ParserNormalizedDiff = {
  rawDiff: string;
  filePaths: GitDiffHeaderPaths[];
};

function runGit(repo: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
  });

  if (result.error) {
    throw result.error;
  }

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
  // core.quotePath=false keeps non-ASCII paths as raw UTF-8 instead of C-style
  // octal escapes wrapped in quotes. Git still quotes control characters such
  // as tabs and newlines; those headers are normalized before processPatch.
  return runGit(repoRoot, [
    "-c",
    "core.quotePath=false",
    "diff",
    "--find-renames",
    "--submodule=diff",
    "--binary",
    "--no-color",
    "--no-ext-diff",
    ...diffArgs,
  ]);
}

function decodeGitQuotedPathToken(input: string, startIndex: number): GitPathToken | null {
  if (input[startIndex] !== '"') return null;

  let value = "";
  let index = startIndex + 1;
  while (index < input.length) {
    const char = input[index];
    index++;

    if (char === '"') {
      return { value, end: index };
    }

    if (char !== "\\") {
      value += char;
      continue;
    }

    if (index >= input.length) {
      value += "\\";
      break;
    }

    const escaped = input[index];
    index++;
    switch (escaped) {
      case "a":
        value += "\x07";
        break;
      case "b":
        value += "\b";
        break;
      case "f":
        value += "\f";
        break;
      case "n":
        value += "\n";
        break;
      case "r":
        value += "\r";
        break;
      case "t":
        value += "\t";
        break;
      case "v":
        value += "\v";
        break;
      case "\\":
      case '"':
        value += escaped;
        break;
      default:
        if (escaped >= "0" && escaped <= "7") {
          let octal = escaped;
          for (let count = 0; count < 2 && index < input.length; count++) {
            const next = input[index];
            if (next < "0" || next > "7") break;
            octal += next;
            index++;
          }
          value += String.fromCharCode(Number.parseInt(octal, 8));
        } else {
          value += escaped;
        }
    }
  }

  return null;
}

function stripGitSidePrefix(value: string, side: "a" | "b"): string {
  const prefix = `${side}/`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function parseQuotedGitDiffHeader(rest: string): GitDiffHeaderPaths | null {
  const oldToken = decodeGitQuotedPathToken(rest, 0);
  if (oldToken == null) return null;

  let index = oldToken.end;
  while (rest[index] === " ") index++;

  const newToken = parseGitPathToken(rest, index);
  if (newToken == null) return null;

  return {
    oldPath: stripGitSidePrefix(oldToken.value, "a"),
    newPath: stripGitSidePrefix(newToken.value, "b"),
  };
}

function parseGitPathToken(input: string, startIndex: number): GitPathToken | null {
  if (input[startIndex] === '"') {
    return decodeGitQuotedPathToken(input, startIndex);
  }

  const value = input.slice(startIndex);
  return value.length > 0 ? { value, end: input.length } : null;
}

function findUnquotedNewPathSeparator(rest: string): number {
  let index = 0;
  while (index < rest.length) {
    if (rest[index] === '"') {
      const token = decodeGitQuotedPathToken(rest, index);
      if (token == null) return -1;
      index = token.end;
      continue;
    }
    if (rest.startsWith(' "b/', index) || rest.startsWith(" b/", index)) {
      return index;
    }
    index++;
  }
  return -1;
}

function parseGitDiffHeader(line: string): GitDiffHeaderPaths | null {
  if (!line.startsWith(DIFF_GIT_PREFIX)) return null;

  const rest = line.slice(DIFF_GIT_PREFIX.length);
  if (rest.startsWith('"')) {
    return parseQuotedGitDiffHeader(rest);
  }

  const separatorIndex = findUnquotedNewPathSeparator(rest);
  if (separatorIndex === -1) return null;
  const oldPath = stripGitSidePrefix(rest.slice(0, separatorIndex), "a");
  const newToken = parseGitPathToken(rest, separatorIndex + 1);
  if (newToken == null) return null;
  return {
    oldPath,
    newPath: stripGitSidePrefix(newToken.value, "b"),
  };
}

function parserPlaceholderPath(fileIndex: number, side: "old" | "new"): string {
  return `${PARSER_PATH_PREFIX}/${fileIndex}-${side}`;
}

function splitLineEnding(line: string): { body: string; ending: string } {
  if (line.endsWith("\r\n")) return { body: line.slice(0, -2), ending: "\r\n" };
  if (line.endsWith("\n")) return { body: line.slice(0, -1), ending: "\n" };
  return { body: line, ending: "" };
}

function normalizeRawGitDiffForParser(rawDiff: string): ParserNormalizedDiff {
  const filePaths: GitDiffHeaderPaths[] = [];
  let currentFileIndex = -1;
  let inFileHeader = false;
  const rawDiffLines = rawDiff.split(/(?<=\n)/);
  const rawDiffForParser = rawDiffLines
    .map((line) => {
      const { body, ending } = splitLineEnding(line);
      const gitHeader = parseGitDiffHeader(body);
      if (gitHeader != null) {
        currentFileIndex = filePaths.length;
        inFileHeader = true;
        filePaths.push(gitHeader);
        return `${DIFF_GIT_PREFIX}a/${parserPlaceholderPath(
          currentFileIndex,
          "old",
        )} b/${parserPlaceholderPath(currentFileIndex, "new")}${ending}`;
      }

      if (body.startsWith("@@ ")) {
        inFileHeader = false;
      }

      if (currentFileIndex < 0 || !inFileHeader) return line;

      const oldPlaceholder = parserPlaceholderPath(currentFileIndex, "old");
      const newPlaceholder = parserPlaceholderPath(currentFileIndex, "new");
      if (body.startsWith("--- ") && body !== "--- /dev/null") {
        return `--- a/${oldPlaceholder}${ending}`;
      }
      if (body.startsWith("+++ ") && body !== "+++ /dev/null") {
        return `+++ b/${newPlaceholder}${ending}`;
      }
      if (body.startsWith("rename from ")) {
        return `rename from ${oldPlaceholder}${ending}`;
      }
      if (body.startsWith("rename to ")) {
        return `rename to ${newPlaceholder}${ending}`;
      }

      return line;
    })
    .join("");

  return { rawDiff: rawDiffForParser, filePaths };
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

function countChanges(fileDiff: FileDiffMetadata): {
  additions: number;
  deletions: number;
} {
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
  return (
    /^<<<<<<< .+$/m.test(contents) && /^=======$/m.test(contents) && /^>>>>>>> .+$/m.test(contents)
  );
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
    cacheKey: buildCacheKey("contents", name, contents),
  };
}

function isBinaryFileDiff(rawFileDiff: string | undefined): boolean {
  if (rawFileDiff == null) return false;
  return /^(?:GIT binary patch|Binary files .* differ)$/m.test(rawFileDiff);
}

function splitRawDiffFiles(rawDiff: string): string[] {
  return rawDiff
    .split(/(?=^diff --git)/gm)
    .map((fileDiff) => fileDiff.trimStart())
    .filter((fileDiff) => fileDiff.startsWith("diff --git"));
}

function applyGitHeaderPaths(
  fileDiff: FileDiffMetadata,
  gitHeaderPaths: GitDiffHeaderPaths | undefined,
): FileDiffMetadata {
  if (gitHeaderPaths == null) return fileDiff;

  fileDiff.name = gitHeaderPaths.newPath;
  if (fileDiff.type === "rename-pure" || fileDiff.type === "rename-changed") {
    fileDiff.prevName = gitHeaderPaths.oldPath;
  } else {
    delete fileDiff.prevName;
  }

  return fileDiff;
}

function hydrateFileDiff(
  repoRoot: string,
  rawFileDiff: string | undefined,
  partialFileDiff: FileDiffMetadata,
  gitHeaderPaths: GitDiffHeaderPaths | undefined,
): FileDiffMetadata {
  if (rawFileDiff == null) return partialFileDiff;

  const oldPath = gitHeaderPaths?.oldPath ?? partialFileDiff.prevName ?? partialFileDiff.name;
  const newPath = gitHeaderPaths?.newPath ?? partialFileDiff.name;
  const oldContents = partialFileDiff.type === "new" ? "" : readIndexFile(repoRoot, oldPath);
  const newContents = partialFileDiff.type === "deleted" ? "" : readWorktreeFile(repoRoot, newPath);

  if (oldContents == null || newContents == null) {
    return partialFileDiff;
  }

  try {
    return applyGitHeaderPaths(
      processFile(rawFileDiff, {
        cacheKey: partialFileDiff.cacheKey,
        isGitDiff: true,
        oldFile: createFileContents(oldPath, oldContents),
        newFile: createFileContents(newPath, newContents),
        throwOnError: true,
      }) ?? partialFileDiff,
      gitHeaderPaths,
    );
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

export function buildDiffSession(
  repoRoot: string,
  currentDirectory: string,
  diffArgs: string[],
): DiffSession {
  const rawDiff = getRawDiff(repoRoot, diffArgs);
  const fileDiffs = new Map<string, FileDiffMetadata>();
  const files: DiffFileSummary[] = [];
  const unresolvedFiles = new Map<string, string>();
  const relativeDirectory = relative(repoRoot, currentDirectory);
  const currentDirectoryDisplay =
    relativeDirectory.length === 0 || relativeDirectory.startsWith("..") ? "." : relativeDirectory;

  if (rawDiff.trim().length > 0) {
    const normalizedDiff = normalizeRawGitDiffForParser(rawDiff);
    const parsedPatch = processPatch(normalizedDiff.rawDiff, "diffdeck", true);
    const rawFileDiffs = splitRawDiffFiles(rawDiff);
    const parserRawFileDiffs = splitRawDiffFiles(normalizedDiff.rawDiff);
    const canHydrateFromWorktree = diffArgs.length === 0;
    for (const [index, partialFileDiff] of parsedPatch.files.entries()) {
      const rawFileDiff = rawFileDiffs[index];
      const parserRawFileDiff = parserRawFileDiffs[index];
      const gitHeaderPaths = normalizedDiff.filePaths[index];
      applyGitHeaderPaths(partialFileDiff, gitHeaderPaths);
      const binary = isBinaryFileDiff(rawFileDiff);
      const fileDiff =
        canHydrateFromWorktree && !binary
          ? hydrateFileDiff(repoRoot, parserRawFileDiff, partialFileDiff, gitHeaderPaths)
          : partialFileDiff;
      fileDiff.cacheKey = buildCacheKey("diff", fileDiff.name, rawFileDiff ?? rawDiff);
      fileDiffs.set(fileDiff.name, fileDiff);
      const summary = createSummary(fileDiff);
      if (binary) {
        summary.isBinary = true;
      }
      const contents = binary ? null : readWorktreeFile(repoRoot, fileDiff.name);
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
