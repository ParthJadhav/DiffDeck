import type { DiffFileSummary } from "../types.js";
import type { ReviewFilters } from "./reviewSession.js";

const DEPENDENCY_NAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

export function filterDiffFiles(
  files: readonly DiffFileSummary[],
  filters: ReviewFilters,
  viewedPaths: ReadonlySet<string>,
): DiffFileSummary[] {
  return files.filter((file) => matchesDiffFilters(file, filters, viewedPaths));
}

export function matchesDiffFilters(
  file: DiffFileSummary,
  filters: ReviewFilters,
  viewedPaths: ReadonlySet<string>,
): boolean {
  const lowerPath = file.path.toLowerCase();
  const name = lowerPath.slice(lowerPath.lastIndexOf("/") + 1);
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const dependency = DEPENDENCY_NAMES.has(name);
  const lock = name.endsWith(".lock") || name.endsWith("-lock.json") || name === "bun.lockb";
  const generated =
    /(^|\/)(dist|build|coverage|vendor)\//.test(lowerPath) ||
    /(?:\.min\.(?:js|css)|\.generated\.|\.snap$)/.test(lowerPath);
  const size = classifyChangeSize(file.additions + file.deletions);

  if (filters.path.length > 0 && !lowerPath.includes(filters.path.toLowerCase())) return false;
  if (filters.extensions.length > 0 && !filters.extensions.includes(extension)) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(file.gitStatus)) return false;
  if (filters.changeSizes.length > 0 && !filters.changeSizes.includes(size)) return false;
  if (filters.hideViewed && viewedPaths.has(file.path)) return false;
  if (filters.hideDeleted && file.gitStatus === "deleted") return false;
  if (filters.hideGenerated && generated) return false;
  if (filters.hideLock && lock) return false;
  if (filters.binary && file.isBinary !== true) return false;
  if (filters.conflicts && file.hasMergeConflicts !== true) return false;
  if (filters.dependency && !dependency) return false;
  return true;
}

export function classifyChangeSize(lines: number): "small" | "medium" | "large" {
  if (lines < 80) return "small";
  if (lines < 800) return "medium";
  return "large";
}

export function isDependencyPath(path: string): boolean {
  const name = path.toLowerCase().slice(path.lastIndexOf("/") + 1);
  return DEPENDENCY_NAMES.has(name);
}
