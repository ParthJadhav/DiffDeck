import type { DiffFileSummary } from "../../server/protocol.js";
import { sanitizeStringArray } from "./strings.js";

export interface ReviewFilters {
  binary: boolean;
  conflicts: boolean;
  dependency: boolean;
  extensions: string[];
  changeSizes: string[];
  hideDeleted: boolean;
  hideGenerated: boolean;
  hideLock: boolean;
  hideViewed: boolean;
  path: string;
  statuses: string[];
}

export const emptyReviewFilters: ReviewFilters = {
  binary: false,
  conflicts: false,
  dependency: false,
  extensions: [],
  changeSizes: [],
  hideDeleted: false,
  hideGenerated: false,
  hideLock: false,
  hideViewed: false,
  path: "",
  statuses: [],
};

export function sanitizeReviewFilters(value: unknown): ReviewFilters {
  if (value == null || typeof value !== "object") return { ...emptyReviewFilters };
  const candidate = value as Partial<ReviewFilters>;
  return {
    binary: candidate.binary === true,
    conflicts: candidate.conflicts === true,
    dependency: candidate.dependency === true,
    extensions: sanitizeStringArray(candidate.extensions),
    changeSizes: sanitizeStringArray(candidate.changeSizes),
    hideDeleted: candidate.hideDeleted === true,
    hideGenerated: candidate.hideGenerated === true,
    hideLock: candidate.hideLock === true,
    hideViewed: candidate.hideViewed === true,
    path: typeof candidate.path === "string" ? candidate.path : "",
    statuses: sanitizeStringArray(candidate.statuses),
  };
}

export function countActiveFilters(filters: ReviewFilters): number {
  return [
    filters.binary,
    filters.conflicts,
    filters.dependency,
    filters.hideDeleted,
    filters.hideGenerated,
    filters.hideLock,
    filters.hideViewed,
    filters.path.length > 0,
    filters.extensions.length > 0,
    filters.statuses.length > 0,
    filters.changeSizes.length > 0,
  ].filter(Boolean).length;
}

const DEPENDENCY_NAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

function fileName(path: string): string {
  const lowerPath = path.toLowerCase();
  return lowerPath.slice(lowerPath.lastIndexOf("/") + 1);
}

/** Files at or above this many changed lines count as large and start collapsed. */
const LARGE_CHANGE_LINES = 800;

export function isLargeChange(file: DiffFileSummary): boolean {
  return file.additions + file.deletions >= LARGE_CHANGE_LINES;
}

/** Binary and conflicted files have no text diff to fetch. */
export function hasTextDiff(file: DiffFileSummary): boolean {
  return file.hasMergeConflicts !== true && file.isBinary !== true;
}

export function isDependencyPath(path: string): boolean {
  return DEPENDENCY_NAMES.has(fileName(path));
}

export function filterDiffFiles(
  files: readonly DiffFileSummary[],
  filters: ReviewFilters,
  viewedPaths: ReadonlySet<string>,
): DiffFileSummary[] {
  return files.filter((file) => matchesDiffFilters(file, filters, viewedPaths));
}

function matchesDiffFilters(
  file: DiffFileSummary,
  filters: ReviewFilters,
  viewedPaths: ReadonlySet<string>,
): boolean {
  const lowerPath = file.path.toLowerCase();
  const name = fileName(file.path);
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const lock = name.endsWith(".lock") || name.endsWith("-lock.json") || name === "bun.lockb";
  const generated =
    /(^|\/)(dist|build|coverage|vendor)\//.test(lowerPath) ||
    /(?:\.min\.(?:js|css)|\.generated\.|\.snap$)/.test(lowerPath);
  const size = classifyChangeSize(file);

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
  if (filters.dependency && !isDependencyPath(file.path)) return false;
  return true;
}

function classifyChangeSize(file: DiffFileSummary): "small" | "medium" | "large" {
  if (isLargeChange(file)) return "large";
  return file.additions + file.deletions < 80 ? "small" : "medium";
}
