import type { AnnotationSide } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";

export interface HunkTarget {
  hunkIndex: number;
  line: number;
  side: AnnotationSide;
}

export interface HunkNavigation {
  next: HunkTarget | null;
  position: number;
  previous: HunkTarget | null;
  targets: readonly HunkTarget[];
  total: number;
}

export function getHunkTargets(fileDiff: FileDiffMetadata | null): HunkTarget[] {
  if (fileDiff == null) return [];
  return fileDiff.hunks.flatMap<HunkTarget>((hunk, hunkIndex) => {
    let additionLine = hunk.additionStart;
    let deletionLine = hunk.deletionStart;
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        additionLine += content.lines;
        deletionLine += content.lines;
        continue;
      }
      if (content.additions > 0) {
        return [{ hunkIndex, line: Math.max(1, additionLine), side: "additions" as const }];
      }
      if (content.deletions > 0) {
        return [{ hunkIndex, line: Math.max(1, deletionLine), side: "deletions" as const }];
      }
      additionLine += content.additions;
      deletionLine += content.deletions;
    }
    return [];
  });
}

export function getHunkNavigation(
  fileDiff: FileDiffMetadata | null,
  location: Pick<HunkTarget, "line" | "side"> | null,
): HunkNavigation {
  const targets = getHunkTargets(fileDiff);
  if (targets.length === 0) {
    return { next: null, position: 0, previous: null, targets, total: 0 };
  }

  const activeIndex =
    location == null
      ? -1
      : (fileDiff?.hunks.findIndex((hunk) => {
          const start = location.side === "additions" ? hunk.additionStart : hunk.deletionStart;
          const count = location.side === "additions" ? hunk.additionCount : hunk.deletionCount;
          return count > 0 && location.line >= start && location.line < start + count;
        }) ?? -1);

  if (activeIndex >= 0) {
    return {
      next: targets[activeIndex + 1] ?? null,
      position: activeIndex + 1,
      previous: targets[activeIndex - 1] ?? null,
      targets,
      total: targets.length,
    };
  }

  const nextIndex =
    location == null
      ? 0
      : targets.findIndex((target) => target.side === location.side && target.line > location.line);
  const resolvedNextIndex = nextIndex < 0 ? targets.length : nextIndex;
  return {
    next: targets[resolvedNextIndex] ?? null,
    position: 0,
    previous: targets[resolvedNextIndex - 1] ?? null,
    targets,
    total: targets.length,
  };
}
