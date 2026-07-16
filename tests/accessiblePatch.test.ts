import { describe, expect, test } from "bun:test";
import type { FileDiffMetadata } from "@pierre/diffs";
import { buildAccessiblePatchRows } from "../src/client/lib/accessiblePatch.js";

describe("accessible patch rows", () => {
  test("preserves unified patch order and side-specific line numbers", () => {
    const rows = buildAccessiblePatchRows({
      additionLines: ["same\n", "new one\n", "new two\n"],
      deletionLines: ["same\n", "old\n"],
      hunks: [
        {
          additionCount: 3,
          additionLineIndex: 0,
          additionLines: 2,
          additionStart: 10,
          collapsedBefore: 0,
          deletionCount: 2,
          deletionLineIndex: 0,
          deletionLines: 1,
          deletionStart: 8,
          hunkContent: [
            { additionLineIndex: 0, deletionLineIndex: 0, lines: 1, type: "context" },
            {
              additionLineIndex: 1,
              additions: 2,
              deletionLineIndex: 1,
              deletions: 1,
              type: "change",
            },
          ],
          hunkSpecs: "@@ -8,2 +10,3 @@",
          noEOFCRAdditions: false,
          noEOFCRDeletions: false,
          splitLineCount: 3,
          splitLineStart: 0,
          unifiedLineCount: 4,
          unifiedLineStart: 0,
        },
      ],
      isPartial: true,
      name: "example.ts",
      splitLineCount: 3,
      type: "change",
      unifiedLineCount: 4,
    } as FileDiffMetadata);

    expect(
      rows.map(({ content, kind, newLine, oldLine }) => ({ content, kind, newLine, oldLine })),
    ).toEqual([
      { content: "@@ -8,2 +10,3 @@", kind: "hunk", newLine: null, oldLine: null },
      { content: "same", kind: "context", newLine: 10, oldLine: 8 },
      { content: "old", kind: "deletion", newLine: null, oldLine: 9 },
      { content: "new one", kind: "addition", newLine: 11, oldLine: null },
      { content: "new two", kind: "addition", newLine: 12, oldLine: null },
    ]);
  });
});
