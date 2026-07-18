import { describe, expect, test } from "bun:test";
import { orderDiffFiles } from "../src/client/lib/fileOrder.js";
import type { DiffFileSummary } from "../src/client/types.js";

const files = [
  file("z/deleted.ts", "deleted", 1, 1),
  file("a/small.ts", "modified", 2, 1),
  file("a/large.ts", "added", 20, 10),
  file("conflict.ts", "modified", 5, 5, true),
];

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
});

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
