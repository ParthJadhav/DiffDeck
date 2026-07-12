import { describe, expect, test } from "bun:test";
import type { FileDiffMetadata } from "@pierre/diffs";
import {
  createReviewSession,
  createReviewSessionIdentity,
  parseReviewSession,
  reconcileAnnotationsToComments,
  reconcileCommentAnchors,
  reconcileReviewSession,
  serializeReviewSession,
  type ReviewSessionSnapshot,
} from "../src/client/lib/reviewSession.js";

const first: ReviewSessionSnapshot = {
  diffArgs: ["--cached"],
  files: [
    { path: "src/a.ts", diffId: "a1" },
    { path: "src/b.ts", diffId: "b1" },
  ],
  repoRoot: "/repo",
  snapshotId: "snapshot-1",
};

describe("ReviewSession", () => {
  test("uses repository and diff arguments as the durable identity", () => {
    expect(createReviewSessionIdentity(first)).toBe(
      createReviewSessionIdentity({ ...first, snapshotId: "later", files: [] }),
    );
  });

  test("round trips persisted review progress, drafts, and filters", () => {
    const state = createReviewSession(first, ["src/b.ts"]);
    state.viewedPaths = ["src/a.ts"];
    state.filters.path = "src";
    state.annotationsByFile["src/a.ts"] = [
      {
        side: "additions",
        lineNumber: 2,
        metadata: { id: "draft", body: "half typed", kind: "comment-form" },
      },
    ];
    expect(parseReviewSession(serializeReviewSession(state), first)).toEqual(state);
  });

  test("falls back safely for corrupt and old persistence", () => {
    expect(parseReviewSession("not json", first)).toEqual(createReviewSession(first));
    expect(parseReviewSession(JSON.stringify({ version: 0 }), first)).toEqual(
      createReviewSession(first),
    );
  });

  test("retains unchanged progress and invalidates only changed files", () => {
    const state = createReviewSession(first);
    state.viewedPaths = ["src/a.ts", "src/b.ts"];
    state.commentExports = [comment("src/a.ts"), comment("src/b.ts")];
    const next = reconcileReviewSession(state, {
      ...first,
      snapshotId: "snapshot-2",
      files: [
        { path: "src/a.ts", diffId: "a2" },
        { path: "src/b.ts", diffId: "b1" },
      ],
    });
    expect(next.viewedPaths).toEqual(["src/b.ts"]);
    expect(next.commentExports.map((item) => item.status)).toEqual(["stale", undefined]);
  });

  test("falls back to the first file after a selected file is deleted or renamed", () => {
    const state = createReviewSession(first);
    state.selectedPath = "src/a.ts";
    const next = reconcileReviewSession(state, {
      ...first,
      snapshotId: "snapshot-2",
      files: [{ path: "src/b.ts", diffId: "b1" }],
    });
    expect(next.selectedPath).toBe("src/b.ts");
  });

  test("moves selected state, annotations, and anchors across a detected rename", () => {
    const state = createReviewSession(first);
    state.selectedPath = "src/a.ts";
    state.annotationsByFile["src/a.ts"] = [
      {
        side: "additions",
        lineNumber: 1,
        metadata: { body: "rename", id: "rename", kind: "comment" },
      },
    ];
    state.commentExports = [comment("src/a.ts")];
    const next = reconcileReviewSession(state, {
      ...first,
      snapshotId: "snapshot-rename",
      files: [{ path: "src/renamed.ts", prevPath: "src/a.ts", diffId: "renamed" }],
    });
    expect(next.selectedPath).toBe("src/renamed.ts");
    expect(next.annotationsByFile["src/renamed.ts"]).toHaveLength(1);
    expect(next.commentExports[0]).toMatchObject({
      filePath: "src/renamed.ts",
      status: "stale",
    });
  });

  test("re-anchors unique shifted content, resolves removed content, and keeps ambiguity stale", () => {
    const shifted = { ...comment("src/a.ts"), status: "stale" as const };
    const resolved = { ...comment("src/b.ts", "gone"), id: "resolved", status: "stale" as const };
    const ambiguous = {
      ...comment("src/c.ts", "repeat"),
      id: "ambiguous",
      status: "stale" as const,
    };
    const result = reconcileCommentAnchors(
      [shifted, resolved, ambiguous],
      {
        "src/a.ts": fullDiff("src/a.ts", ["zero\n", "target\n"]),
        "src/b.ts": fullDiff("src/b.ts", ["replacement\n"]),
        "src/c.ts": fullDiff("src/c.ts", ["repeat\n", "repeat\n"]),
      },
      "snapshot-2",
    );
    expect(result[0]).toMatchObject({ lineNumber: 2, status: "open", snapshotId: "snapshot-2" });
    expect(result[1]?.status).toBe("resolved");
    expect(result[2]?.status).toBe("stale");
    const annotations = reconcileAnnotationsToComments(
      {
        "src/a.ts": [
          {
            side: "additions",
            lineNumber: 1,
            metadata: { body: "Review this", id: "src/a.ts", kind: "comment" },
          },
        ],
      },
      result,
    );
    expect(annotations["src/a.ts"]?.[0]?.lineNumber).toBe(2);
  });
});

function comment(filePath: string, content = "target") {
  return {
    body: "Review this",
    contextLines: [{ content, lineNumber: 1, target: true }],
    filePath,
    id: filePath,
    lineNumber: 1,
    side: "additions" as const,
  };
}

function fullDiff(name: string, additionLines: string[]): FileDiffMetadata {
  return {
    name,
    type: "change",
    hunks: [],
    additionLines,
    deletionLines: [],
    isPartial: false,
  } as FileDiffMetadata;
}
