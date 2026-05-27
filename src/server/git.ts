import { processFile, processPatch, type FileContents, type FileDiffMetadata } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { DiffdeckError } from "./errors.js";
import type { DiffBuildOptions, DiffFileSummary, DiffSession } from "./types.js";
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
  filePaths: Array<GitDiffHeaderPaths | undefined>;
};

type RawDiffFileContext = {
  index: number;
  startLine: number;
  endLine: number;
  header: string;
  oldPath?: string;
  newPath?: string;
};

type DiffLogger = (message: string) => void;

function runGit(repo: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
  });

  if (result.error) {
    throw new DiffdeckError(
      "Unable to run git.",
      [`repo: ${repo}`, `command: git ${args.join(" ")}`],
      result.error,
    );
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const message = stderr.length > 0 ? stderr : `git ${args.join(" ")} failed`;
    throw new DiffdeckError(message, [
      `repo: ${repo}`,
      `command: git ${args.join(" ")}`,
      `exit status: ${result.status ?? "unknown"}`,
      `signal: ${result.signal ?? "none"}`,
    ]);
  }

  return typeof result.stdout === "string" ? result.stdout : "";
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

function parseGitMetadataPath(rawPath: string, side?: "a" | "b"): string | null {
  if (rawPath === "/dev/null") return null;

  const tokenInput = rawPath.startsWith('"') ? rawPath : rawPath.split("\t", 1)[0];
  const token = parseGitPathToken(tokenInput, 0);
  if (token == null) return null;

  return side == null ? token.value : stripGitSidePrefix(token.value, side);
}

function parseGitFileMarkerPath(line: string, marker: "---" | "+++"): string | null {
  const prefix = `${marker} `;
  if (!line.startsWith(prefix)) return null;

  const side = marker === "---" ? "a" : "b";
  return parseGitMetadataPath(line.slice(prefix.length), side);
}

function setGitHeaderPath(
  filePaths: Array<GitDiffHeaderPaths | undefined>,
  index: number,
  side: "old" | "new",
  path: string | null,
): void {
  if (path == null) return;

  const existing = filePaths[index] ?? { oldPath: path, newPath: path };
  if (side === "old") {
    existing.oldPath = path;
  } else {
    existing.newPath = path;
  }
  filePaths[index] = existing;
}

function createLogger(options: DiffBuildOptions | undefined): DiffLogger | undefined {
  if (options?.debug !== true) return undefined;
  return options.log ?? ((message) => console.error(`[diffdeck:debug] ${message}`));
}

function summarizeDiffArgs(diffArgs: string[]): string {
  return diffArgs.length === 0 ? "(none)" : diffArgs.join(" ");
}

function countLines(value: string): number {
  if (value.length === 0) return 0;
  return value.split(/\r\n|\r|\n/).length;
}

function describeRawDiffFiles(
  rawDiff: string,
  filePaths: Array<GitDiffHeaderPaths | undefined> = [],
): RawDiffFileContext[] {
  const lines = rawDiff.split(/\r\n|\r|\n/);
  const contexts: RawDiffFileContext[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(DIFF_GIT_PREFIX)) continue;

    const previous = contexts.at(-1);
    if (previous != null) {
      previous.endLine = index;
    }

    const fileIndex = contexts.length;
    const parsed = filePaths[fileIndex] ?? parseGitDiffHeader(line) ?? undefined;
    contexts.push({
      index: fileIndex,
      startLine: index + 1,
      endLine: lines.length,
      header: line,
      oldPath: parsed?.oldPath,
      newPath: parsed?.newPath,
    });
  }

  return contexts;
}

function formatDiffFileContext(context: RawDiffFileContext): string {
  const path =
    context.newPath == null
      ? "path: unknown"
      : context.oldPath != null && context.oldPath !== context.newPath
        ? `path: ${context.oldPath} -> ${context.newPath}`
        : `path: ${context.newPath}`;

  return `file ${context.index + 1}: lines ${context.startLine}-${context.endLine}, ${path}`;
}

function createLineWindow(rawDiff: string, lineNumber: number, radius = 3): string[] {
  const lines = rawDiff.split(/\r\n|\r|\n/);
  const start = Math.max(lineNumber - radius, 1);
  const end = Math.min(lineNumber + radius, lines.length);
  const width = String(end).length;
  const windowLines: string[] = [];

  for (let line = start; line <= end; line += 1) {
    windowLines.push(`${String(line).padStart(width, " ")} | ${lines[line - 1]}`);
  }

  return windowLines;
}

function isUndefinedTrimError(error: unknown): boolean {
  return error instanceof Error && /undefined.*trim|trim.*undefined/i.test(error.message);
}

function buildParseErrorDetails(
  error: unknown,
  repoRoot: string,
  currentDirectory: string,
  diffArgs: string[],
  rawDiff: string,
  normalizedDiff: ParserNormalizedDiff,
): string[] {
  const rawContexts = describeRawDiffFiles(rawDiff, normalizedDiff.filePaths);
  const suspiciousHeader =
    rawContexts.find((context) => context.newPath == null || context.header.includes('"')) ??
    rawContexts[0];
  const details = [
    `repo: ${repoRoot}`,
    `working directory: ${currentDirectory}`,
    `git diff args: ${summarizeDiffArgs(diffArgs)}`,
    `raw diff: ${rawDiff.length} characters, ${countLines(rawDiff)} lines, ${rawContexts.length} file(s)`,
    `parser input: ${normalizedDiff.rawDiff.length} characters, ${countLines(
      normalizedDiff.rawDiff,
    )} lines`,
  ];

  if (isUndefinedTrimError(error)) {
    details.push(
      "likely cause: an unusual git diff header reached the upstream patch parser without a filename group; that parser then called .trim() on the missing filename",
    );
  }

  for (const context of rawContexts.slice(0, 5)) {
    details.push(formatDiffFileContext(context));
  }

  if (rawContexts.length > 5) {
    details.push(`... ${rawContexts.length - 5} more file(s) omitted`);
  }

  if (suspiciousHeader != null) {
    details.push("nearest raw diff lines:");
    details.push(...createLineWindow(rawDiff, suspiciousHeader.startLine));
  }

  return details;
}

function logRawDiffContext(
  logger: DiffLogger | undefined,
  rawDiff: string,
  normalizedDiff: ParserNormalizedDiff,
): void {
  if (logger == null) return;

  const contexts = describeRawDiffFiles(rawDiff, normalizedDiff.filePaths);
  logger(`raw diff has ${countLines(rawDiff)} line(s), ${rawDiff.length} character(s)`);
  logger(`normalized parser input has ${countLines(normalizedDiff.rawDiff)} line(s)`);

  for (const context of contexts) {
    logger(formatDiffFileContext(context));
    logger(`  header: ${context.header}`);
  }
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
  const filePaths: Array<GitDiffHeaderPaths | undefined> = [];
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

      if (body.startsWith(DIFF_GIT_PREFIX)) {
        currentFileIndex = filePaths.length;
        inFileHeader = true;
        filePaths.push(undefined);
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
        setGitHeaderPath(filePaths, currentFileIndex, "old", parseGitFileMarkerPath(body, "---"));
        return `--- a/${oldPlaceholder}${ending}`;
      }
      if (body.startsWith("+++ ") && body !== "+++ /dev/null") {
        setGitHeaderPath(filePaths, currentFileIndex, "new", parseGitFileMarkerPath(body, "+++"));
        return `+++ b/${newPlaceholder}${ending}`;
      }
      if (body.startsWith("rename from ")) {
        const oldPath = parseGitMetadataPath(body.slice("rename from ".length));
        setGitHeaderPath(filePaths, currentFileIndex, "old", oldPath);
        return `rename from ${oldPlaceholder}${ending}`;
      }
      if (body.startsWith("rename to ")) {
        const newPath = parseGitMetadataPath(body.slice("rename to ".length));
        setGitHeaderPath(filePaths, currentFileIndex, "new", newPath);
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
  logger: DiffLogger | undefined,
): FileDiffMetadata {
  if (rawFileDiff == null) {
    logger?.(`hydrate ${partialFileDiff.name}: skipped — no raw file diff`);
    return partialFileDiff;
  }

  const oldPath = gitHeaderPaths?.oldPath ?? partialFileDiff.prevName ?? partialFileDiff.name;
  const newPath = gitHeaderPaths?.newPath ?? partialFileDiff.name;
  const oldContents = partialFileDiff.type === "new" ? "" : readIndexFile(repoRoot, oldPath);
  const newContents = partialFileDiff.type === "deleted" ? "" : readWorktreeFile(repoRoot, newPath);

  if (oldContents == null) {
    logger?.(
      `hydrate ${newPath}: failed — readIndexFile returned null for "${oldPath}" (git show :${oldPath})`,
    );
    return partialFileDiff;
  }
  if (newContents == null) {
    logger?.(`hydrate ${newPath}: failed — readWorktreeFile returned null for "${newPath}"`);
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
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger?.(
      `hydrate ${newPath}: processFile threw — ${message} (oldLen=${oldContents.length}, newLen=${newContents.length})`,
    );
    return partialFileDiff;
  }
}

function getUnmergedPaths(repoRoot: string): string[] {
  const result = spawnSync("git", ["-C", repoRoot, "diff", "--name-only", "--diff-filter=U"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).flatMap((path) => {
    const trimmed = path.trim();
    return trimmed.length === 0 ? [] : [trimmed];
  });
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
  options?: DiffBuildOptions,
): DiffSession {
  const logger = createLogger(options);
  logger?.(`repo root: ${repoRoot}`);
  logger?.(`working directory: ${currentDirectory}`);
  logger?.(`git diff args: ${summarizeDiffArgs(diffArgs)}`);

  const rawDiff = getRawDiff(repoRoot, diffArgs);
  const fileDiffs = new Map<string, FileDiffMetadata>();
  const files: DiffFileSummary[] = [];
  const unresolvedFiles = new Map<string, string>();
  const relativeDirectory = relative(repoRoot, currentDirectory);
  const currentDirectoryDisplay =
    relativeDirectory.length === 0 || relativeDirectory.startsWith("..") ? "." : relativeDirectory;

  if (rawDiff.trim().length > 0) {
    const normalizedDiff = normalizeRawGitDiffForParser(rawDiff);
    logRawDiffContext(logger, rawDiff, normalizedDiff);
    let parsedPatch: ReturnType<typeof processPatch>;
    try {
      parsedPatch = processPatch(normalizedDiff.rawDiff, "diffdeck", true);
    } catch (error) {
      throw new DiffdeckError(
        "Failed to parse git diff output.",
        buildParseErrorDetails(
          error,
          repoRoot,
          currentDirectory,
          diffArgs,
          rawDiff,
          normalizedDiff,
        ),
        error,
      );
    }
    const rawFileDiffs = splitRawDiffFiles(rawDiff);
    const parserRawFileDiffs = splitRawDiffFiles(normalizedDiff.rawDiff);
    const canHydrateFromWorktree = diffArgs.length === 0;
    logger?.(`upstream parser returned ${parsedPatch.files.length} file(s)`);
    for (const [index, partialFileDiff] of parsedPatch.files.entries()) {
      const rawFileDiff = rawFileDiffs[index];
      const parserRawFileDiff = parserRawFileDiffs[index];
      const gitHeaderPaths = normalizedDiff.filePaths[index];
      logger?.(
        `processing parsed file ${index + 1}: ${gitHeaderPaths?.oldPath ?? "unknown"} -> ${
          gitHeaderPaths?.newPath ?? partialFileDiff.name
        }`,
      );
      applyGitHeaderPaths(partialFileDiff, gitHeaderPaths);
      const binary = isBinaryFileDiff(rawFileDiff);
      const fileDiff =
        canHydrateFromWorktree && !binary
          ? hydrateFileDiff(repoRoot, parserRawFileDiff, partialFileDiff, gitHeaderPaths, logger)
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
