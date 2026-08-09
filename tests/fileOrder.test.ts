import { describe, expect, test } from "bun:test";
import { orderDiffFiles } from "../src/client/lib/fileOrder.js";
import type { DiffFileSummary } from "../src/client/types.js";

const files = [
  file("z/deleted.ts", "deleted", 1, 1),
  file("a/small.ts", "modified", 2, 1),
  file("a/large.ts", "added", 20, 10),
  file("conflict.ts", "modified", 5, 5, true),
];
const LARGE_FILE_COUNT = 23_000;

describe("file ordering", () => {
  test("keeps deterministic tree path order", () => {
    expect(orderDiffFiles(files, "path").map((item) => item.path)).toEqual([
      "a/large.ts",
      "a/small.ts",
      "z/deleted.ts",
      "conflict.ts",
    ]);
  });

  test("orders by review-relevant status with a path tie-breaker", () => {
    expect(orderDiffFiles(files, "status").map((item) => item.path)).toEqual([
      "conflict.ts",
      "a/small.ts",
      "a/large.ts",
      "z/deleted.ts",
    ]);
  });

  test("orders largest changes first with a path tie-breaker", () => {
    expect(orderDiffFiles(files, "size").map((item) => item.path)).toEqual([
      "a/large.ts",
      "conflict.ts",
      "a/small.ts",
      "z/deleted.ts",
    ]);
  });

  test("orders 23,000 files by size and status without mutating the source", () => {
    const statuses: DiffFileSummary["gitStatus"][] = [
      "modified",
      "added",
      "deleted",
      "renamed",
      "copied",
      "untracked",
      "ignored",
    ];
    const largeFiles = Array.from({ length: LARGE_FILE_COUNT }, (_, index) => {
      const ordinal = LARGE_FILE_COUNT - index;
      return file(
        `src/group-${String(ordinal % 97).padStart(2, "0")}/file-${String(ordinal).padStart(5, "0")}.ts`,
        statuses[index % statuses.length]!,
        (index * 37) % 997,
        (index * 17) % 211,
        index % 1_009 === 0,
      );
    });
    const originalPaths = largeFiles.map((item) => item.path);

    const sizeOrdered = orderDiffFiles(largeFiles, "size");
    const statusOrdered = orderDiffFiles(largeFiles, "status");

    expect(largeFiles.every((item, index) => item.path === originalPaths[index])).toBe(true);
    expect(sizeOrdered).toHaveLength(LARGE_FILE_COUNT);
    expect(statusOrdered).toHaveLength(LARGE_FILE_COUNT);
    expect(
      isOrdered(sizeOrdered, (left, right) => {
        const sizeDifference =
          right.additions + right.deletions - (left.additions + left.deletions);
        return sizeDifference || left.path.localeCompare(right.path);
      }),
    ).toBe(true);
    expect(
      isOrdered(statusOrdered, (left, right) => {
        const priority: Record<string, number> = {
          modified: 1,
          added: 2,
          deleted: 3,
          renamed: 4,
          copied: 5,
          untracked: 6,
          ignored: 7,
        };
        const leftPriority = left.hasMergeConflicts ? 0 : (priority[left.gitStatus] ?? 99);
        const rightPriority = right.hasMergeConflicts ? 0 : (priority[right.gitStatus] ?? 99);
        return leftPriority - rightPriority || left.path.localeCompare(right.path);
      }),
    ).toBe(true);
  });
});

function isOrdered(
  values: readonly DiffFileSummary[],
  compare: (left: DiffFileSummary, right: DiffFileSummary) => number,
): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (compare(values[index - 1]!, values[index]!) > 0) return false;
  }
  return true;
}

function file(
  path: string,
  gitStatus: DiffFileSummary["gitStatus"],
  additions: number,
  deletions: number,
  hasMergeConflicts = false,
): DiffFileSummary {
  return {
    additions,
    changeType: "change",
    deletions,
    diffId: path,
    gitStatus,
    hasMergeConflicts,
    path,
  };
}
