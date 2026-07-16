import { describe, expect, test } from "bun:test";
import { processPatch, type FileDiffMetadata } from "@pierre/diffs";
import { getHunkNavigation, getHunkTargets } from "../src/client/lib/hunkNavigation.js";

const fileDiff = processPatch(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 one
-old
+new
 three
@@ -10,2 +10,3 @@
 ten
+added
 eleven
@@ -20,2 +21,1 @@
-removed
 tail
`).files[0] as FileDiffMetadata;

describe("hunk navigation", () => {
  test("targets the first actual changed line in every hunk", () => {
    expect(getHunkTargets(fileDiff)).toEqual([
      { hunkIndex: 0, line: 2, side: "additions" },
      { hunkIndex: 1, line: 11, side: "additions" },
      { hunkIndex: 2, line: 20, side: "deletions" },
    ]);
  });

  test("uses honest boundaries and recognizes locations inside a hunk", () => {
    expect(getHunkNavigation(fileDiff, null)).toMatchObject({
      position: 0,
      previous: null,
      next: { hunkIndex: 0 },
      total: 3,
    });
    expect(getHunkNavigation(fileDiff, { line: 12, side: "additions" })).toMatchObject({
      position: 2,
      previous: { hunkIndex: 0 },
      next: { hunkIndex: 2 },
    });
    expect(getHunkNavigation(fileDiff, { line: 20, side: "deletions" })).toMatchObject({
      position: 3,
      next: null,
      previous: { hunkIndex: 1 },
    });
    expect(getHunkNavigation(fileDiff, { line: 999, side: "additions" })).toMatchObject({
      next: null,
      position: 0,
      previous: { hunkIndex: 2 },
    });
  });

  test("handles files without renderable hunks", () => {
    expect(getHunkNavigation(null, null)).toEqual({
      next: null,
      position: 0,
      previous: null,
      targets: [],
      total: 0,
    });
    const emptyChange = {
      ...fileDiff,
      hunks: [
        {
          ...fileDiff.hunks[0]!,
          additionStart: 0,
          deletionStart: 0,
          hunkContent: [
            {
              additionLineIndex: -1,
              additions: 0,
              deletionLineIndex: -1,
              deletions: 0,
              type: "change" as const,
            },
          ],
        },
      ],
    };
    expect(getHunkTargets(emptyChange)).toEqual([]);
  });
});
