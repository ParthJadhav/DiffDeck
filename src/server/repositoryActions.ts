import { existsSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { getFileDiff } from "./git.js";
import type { DiffWhitespaceMode, ImageSideName, WriteAction } from "./protocol.js";
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
    // The client counts hunks on the diff it displays, so select from the
    // same diff, including its whitespace mode.
    let diff: string;
    try {
      diff = getFileDiff(session.repoRoot, session.diffArgs, path, whitespaceMode);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const patch = selectHunkPatch(diff, hunkIndex);
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

function selectHunkPatch(diff: string, hunkIndex: number): string | null {
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  const firstHunk = lines.findIndex((line) => line.startsWith("@@"));
  if (firstHunk === -1) return null;
  const starts = lines.flatMap((line, index) => (line.startsWith("@@") ? [index] : []));
  const start = starts[hunkIndex];
  if (start == null) return null;
  const end = starts[hunkIndex + 1] ?? lines.length;
  return `${[...lines.slice(0, firstHunk), ...lines.slice(start, end)].join("\n")}\n`;
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

const imageMimeByExtension: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export function getImageMime(path: string): string {
  return imageMimeByExtension[extname(path).toLowerCase()] ?? "application/octet-stream";
}
