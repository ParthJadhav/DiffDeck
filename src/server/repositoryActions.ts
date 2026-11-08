import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { getFileDiff } from "./git.js";
import {
  imageMimeType,
  type DiffWhitespaceMode,
  type ImageSideName,
  type WriteAction,
} from "./protocol.js";
import type { DiffSession } from "./types.js";

type WriteDiffMode = "worktree" | "cached" | "readonly";
type ActionResult = { ok: true } | { ok: false; error: string };

export function resolveAuthorizedPath(repoRoot: string, path: string): string | null {
  const root = resolve(repoRoot);
  const target = resolve(root, path);
  if (!isWithinRoot(root, target)) return null;
  if (!existsSync(target)) return target;

  try {
    return isWithinRoot(realpathSync(root), realpathSync(target)) ? target : null;
  } catch {
    return null;
  }
}

function isWithinRoot(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

export function getAvailableWriteActions(diffArgs: readonly string[]): WriteAction[] {
  const mode = getWriteDiffMode(diffArgs);
  if (mode === "worktree") return ["stage", "revert"];
  if (mode === "cached") return ["unstage", "revert"];
  return [];
}

function getWriteDiffMode(diffArgs: readonly string[]): WriteDiffMode {
  const separator = diffArgs.indexOf("--");
  const diffOptions = separator === -1 ? diffArgs : diffArgs.slice(0, separator);
  const positional = diffOptions.filter((argument) => !argument.startsWith("-"));
  const incompatible = diffOptions.some(
    (argument) =>
      argument === "-R" ||
      argument === "--reverse" ||
      argument === "--no-index" ||
      argument === "--merge-base" ||
      argument === "--output" ||
      argument.startsWith("--output="),
  );
  if (positional.length > 0 || incompatible) return "readonly";
  return diffOptions.includes("--cached") || diffOptions.includes("--staged")
    ? "cached"
    : "worktree";
}

export function applyWriteAction(
  session: DiffSession,
  whitespaceMode: DiffWhitespaceMode,
  action: WriteAction,
  path: string,
  hunkIndex: unknown,
): ActionResult {
  const mode = getWriteDiffMode(session.diffArgs);
  if (!getAvailableWriteActions(session.diffArgs).includes(action)) {
    return {
      ok: false,
      error:
        mode === "readonly"
          ? "Write actions are unavailable for commit and range diffs."
          : `${capitalize(action)} is unavailable in ${mode === "cached" ? "a cached" : "a working-tree"} review.`,
    };
  }

  if (
    hunkIndex !== undefined &&
    (typeof hunkIndex !== "number" || !Number.isInteger(hunkIndex) || hunkIndex < 0)
  ) {
    return { ok: false, error: "The requested hunk index is invalid." };
  }

  if (typeof hunkIndex === "number") {
    let patch: string | null;
    try {
      patch = selectHunkPatch(session, path, whitespaceMode, hunkIndex);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (patch == null) return { ok: false, error: "The requested hunk no longer exists." };
    const applyArgs = ["-C", session.repoRoot, "apply"];
    if (mode === "worktree" && action === "stage") applyArgs.push("--cached");
    if (mode === "cached" && action === "unstage") applyArgs.push("--cached", "--reverse");
    if (mode === "cached" && action === "revert") applyArgs.push("--index", "--reverse");
    if (mode === "worktree" && action === "revert") applyArgs.push("--reverse");
    const applied = spawnSync("git", applyArgs, { input: patch, encoding: "utf8" });
    return applied.status === 0
      ? { ok: true }
      : { ok: false, error: applied.stderr || "Git rejected the selected hunk." };
  }
  // Renamed files occupy two index entries; acting on only the new path
  // would leave the old path's staged deletion dangling.
  const summary = session.files.find((file) => file.path === path);
  const paths =
    summary?.prevPath != null && summary.prevPath !== path ? [path, summary.prevPath] : [path];
  const args =
    action === "stage"
      ? ["add", "--", ...paths]
      : action === "unstage"
        ? ["restore", "--staged", "--", ...paths]
        : mode === "cached"
          ? ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...paths]
          : ["restore", "--worktree", "--", path];
  const result = spawnSync("git", ["-C", session.repoRoot, ...args], { encoding: "utf8" });
  return result.status === 0
    ? { ok: true }
    : { ok: false, error: result.stderr || `Unable to ${action} ${path}.` };
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

type ParsedPatch = {
  header: string[];
  hunks: Array<{ lines: string[]; oldStart: number; oldEnd: number }>;
};

// Lines keep their "\r": a CRLF file's patch must carry it for `git apply`
// to match context and to write the added lines byte for byte.
function parsePatch(diff: string): ParsedPatch {
  const lines = diff.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.filter((line) => line.startsWith("diff --git ")).length > 1) {
    throw new Error("The selected hunk could not be isolated to a single file.");
  }
  const firstHunk = lines.findIndex((line) => line.startsWith("@@"));
  if (firstHunk === -1) return { header: lines, hunks: [] };
  const hunks: ParsedPatch["hunks"] = [];
  for (let index = firstHunk; index < lines.length; index += 1) {
    const match = lines[index]!.match(/^@@ -(\d+)(?:,(\d+))? /);
    if (match != null) {
      const oldStart = Number(match[1]);
      const oldCount = match[2] == null ? 1 : Number(match[2]);
      hunks.push({ lines: [], oldStart, oldEnd: oldStart + Math.max(oldCount, 1) });
    }
    hunks.at(-1)!.lines.push(lines[index]!);
  }
  return { header: lines.slice(0, firstHunk), hunks };
}

/**
 * The patch for the hunk the reviewer clicked. The client counts hunks on the
 * diff it displays, which may ignore whitespace; that filtered diff cannot be
 * applied when its context hides a whitespace change. So the hunk is located
 * on the displayed diff and the patch is taken from the exact diff's hunks
 * covering the same original lines.
 */
function selectHunkPatch(
  session: DiffSession,
  path: string,
  whitespaceMode: DiffWhitespaceMode,
  hunkIndex: number,
): string | null {
  // A renamed file's hunks only exist when both sides are in the pathspec;
  // with the new path alone git reports a whole-file addition.
  const prevPath = session.files.find((file) => file.path === path)?.prevPath;
  const paths = prevPath != null && prevPath !== path ? [prevPath, path] : [path];
  const exact = parsePatch(getFileDiff(session.repoRoot, session.diffArgs, paths, "normal"));
  const displayed =
    whitespaceMode === "normal"
      ? exact
      : parsePatch(getFileDiff(session.repoRoot, session.diffArgs, paths, whitespaceMode));
  const target = displayed.hunks[hunkIndex];
  if (target == null) return null;
  if (displayed === exact) return `${[...exact.header, ...target.lines].join("\n")}\n`;
  const overlaps = (a: ParsedPatch["hunks"][number], b: ParsedPatch["hunks"][number]) =>
    a.oldStart < b.oldEnd && b.oldStart < a.oldEnd;
  const hunks = exact.hunks.filter((hunk) => overlaps(hunk, target));
  if (hunks.length === 0) return null;
  // Whitespace-only changes can merge two displayed hunks into one exact hunk;
  // applying it would also write the hunk the reviewer did not click.
  const others = displayed.hunks.filter((hunk) => hunk !== target);
  if (hunks.some((hunk) => others.some((other) => overlaps(hunk, other)))) {
    throw new Error(
      "This hunk shares lines with another hunk once whitespace changes are included. Show all whitespace changes to act on it.",
    );
  }
  return `${[...exact.header, ...hunks.flatMap((hunk) => hunk.lines)].join("\n")}\n`;
}

export function readImageSide(
  session: DiffSession,
  whitespaceMode: DiffWhitespaceMode,
  path: string,
  side: ImageSideName,
): Buffer | null {
  let diff: string;
  try {
    diff = getFileDiff(session.repoRoot, session.diffArgs, path, whitespaceMode);
  } catch {
    return null;
  }

  const indexLine = diff.match(/^index\s+([0-9a-f]+)\.\.([0-9a-f]+)(?:\s|$)/im);
  const objectId = side === "old" ? indexLine?.[1] : indexLine?.[2];
  if (objectId == null) return null;

  if (!/^0+$/.test(objectId)) {
    const result = spawnSync("git", ["-C", session.repoRoot, "cat-file", "blob", objectId], {
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (result.status === 0 && Buffer.isBuffer(result.stdout)) return result.stdout;
  }
  if (side === "old") return null;

  // New-side content may exist only in the worktree: binary patches carry a
  // computed object id that is not necessarily in the object database.
  const target = resolveAuthorizedPath(session.repoRoot, path);
  return target != null && existsSync(target) ? readFileSync(target) : null;
}

export function getImageMime(path: string): string {
  return imageMimeType(path) ?? "application/octet-stream";
}
