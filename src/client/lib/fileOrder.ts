import { prepareFileTreeInput } from "@pierre/trees";
import { fileTreeShapeOptions } from "./constants.js";
import type { FileOrder } from "./reviewSession.js";
import type { DiffFileSummary } from "../types.js";

const statusPriority: Record<string, number> = {
  modified: 1,
  added: 2,
  deleted: 3,
  renamed: 4,
  copied: 5,
  untracked: 6,
  ignored: 7,
};

export function orderDiffFiles(
  files: readonly DiffFileSummary[],
  order: FileOrder,
): DiffFileSummary[] {
  if (order === "path") return orderByTreePath(files);

  const ordered: DiffFileSummary[] = [];
  const compare = (left: DiffFileSummary, right: DiffFileSummary) => {
    if (order === "size") {
      const sizeDifference = right.additions + right.deletions - (left.additions + left.deletions);
      if (sizeDifference !== 0) return sizeDifference;
    } else {
      const leftPriority = left.hasMergeConflicts ? 0 : (statusPriority[left.gitStatus] ?? 99);
      const rightPriority = right.hasMergeConflicts ? 0 : (statusPriority[right.gitStatus] ?? 99);
      const statusDifference = leftPriority - rightPriority;
      if (statusDifference !== 0) return statusDifference;
    }
    return left.path.localeCompare(right.path);
  };
  for (const file of files) {
    const index = ordered.findIndex((current) => compare(file, current) < 0);
    if (index === -1) ordered.push(file);
    else ordered.splice(index, 0, file);
  }
  return ordered;
}

function orderByTreePath(files: readonly DiffFileSummary[]): DiffFileSummary[] {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const prepared = prepareFileTreeInput(
    files.map((file) => file.path),
    fileTreeShapeOptions,
  );
  const ordered: DiffFileSummary[] = [];
  const orderedPaths = new Set<string>();
  for (const path of prepared.paths) {
    const file = filesByPath.get(path);
    if (file != null) {
      ordered.push(file);
      orderedPaths.add(path);
    }
  }
  for (const file of files) {
    if (!orderedPaths.has(file.path)) ordered.push(file);
  }
  return ordered;
}
