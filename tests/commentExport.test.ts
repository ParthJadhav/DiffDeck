import { describe, expect, test } from "bun:test";
import { processPatch, type FileContents, type FileDiffMetadata } from "@pierre/diffs";
import {
  buildCommentContext,
  formatCommentExport,
  type CommentExportRecord,
} from "../src/client/lib/commentExport.js";

const partialDiff = processPatch(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -10,3 +10,4 @@
 ten
-old
+new
+extra
 twelve
`).files[0] as FileDiffMetadata;

describe("comment context and export", () => {
  test("builds bounded context from full files and unresolved CRLF content", () => {
    const unresolved = {
      name: "conflict.ts",
      contents: "one\r\ntwo\r\nthree\r\nfour\r\nfive\r\n",
    } as FileContents;
    expect(
      buildCommentContext({
        fileDiff: null,
        lineNumber: 3,
        side: "additions",
        unresolvedFile: unresolved,
      }),
    ).toEqual([
      { content: "one", lineNumber: 1, target: false },
      { content: "two", lineNumber: 2, target: false },
      { content: "three", lineNumber: 3, target: true },
      { content: "four", lineNumber: 4, target: false },
      { content: "five", lineNumber: 5, target: false },
    ]);

    const fullDiff = {
      ...partialDiff,
      additionLines: ["one\n", "two\n", "three\n"],
      isPartial: false,
    } as FileDiffMetadata;
    expect(
      buildCommentContext({
        fileDiff: fullDiff,
        lineNumber: 2,
        side: "additions",
        unresolvedFile: null,
      }),
    ).toEqual([
      { content: "one", lineNumber: 1, target: false },
      { content: "two", lineNumber: 2, target: true },
      { content: "three", lineNumber: 3, target: false },
    ]);
    expect(
      buildCommentContext({
        fileDiff: fullDiff,
        lineNumber: 20,
        side: "additions",
        unresolvedFile: null,
      }),
    ).toEqual([]);
  });

  test("maps partial hunk line numbers on both sides and rejects absent anchors", () => {
    const additionContext = buildCommentContext({
      fileDiff: partialDiff,
      lineNumber: 12,
      side: "additions",
      unresolvedFile: null,
    });
    expect(additionContext.find((line) => line.target)).toEqual({
      content: "extra",
      lineNumber: 12,
      target: true,
    });
    expect(
      buildCommentContext({
        fileDiff: partialDiff,
        lineNumber: 11,
        side: "deletions",
        unresolvedFile: null,
      }).find((line) => line.target),
    ).toEqual({ content: "old", lineNumber: 11, target: true });
    expect(
      buildCommentContext({
        fileDiff: partialDiff,
        lineNumber: 99,
        side: "additions",
        unresolvedFile: null,
      }),
    ).toEqual([]);
    expect(
      buildCommentContext({
        fileDiff: null,
        lineNumber: 1,
        side: "additions",
        unresolvedFile: null,
      }),
    ).toEqual([]);
  });

  test("formats deterministic mixed line and file notes with safe fences", () => {
    expect(formatCommentExport([])).toBe("");
    const records: CommentExportRecord[] = [
      {
        body: "Use the shared parser.",
        contextLines: [
          { content: "before", lineNumber: 9, target: false },
          { content: "```ts", lineNumber: 10, target: true },
        ],
        filePath: "src/a.ts",
        id: "line",
        lineNumber: 10,
        scope: "line",
        side: "additions",
      },
      {
        body: "Explain the ownership boundary.",
        contextLines: [],
        filePath: "README",
        id: "file",
        lineNumber: 0,
        scope: "file",
        side: "deletions",
      },
      {
        body: "Restore context.",
        contextLines: [],
        filePath: "odd.name.💥",
        id: "unavailable",
        lineNumber: 4,
        side: "deletions",
      },
    ];
    const output = formatCommentExport(records);
    expect(output).toContain("1. src/a.ts:10 (new file)");
    expect(output).toContain("````ts\n   9 | before\n> 10 | ```ts\n````");
    expect(output).toContain("2. README (file-level note)");
    expect(output).toContain("(file-level note; no individual line selected)");
    expect(output).toContain("3. odd.name.💥:4 (old file)");
    expect(output).toContain("(context unavailable from the loaded diff)");
    expect(output.match(/\n---\n/g)).toHaveLength(2);
  });
});
