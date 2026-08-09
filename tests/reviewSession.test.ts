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
  updateReviewAnnotations,
  updateReviewPathSet,
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
const LARGE_FILE_COUNT = 23_000;

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
    state.fileCommentDrafts["src/a.ts"] = "file-level draft";
    state.fileOrder = "size";
    state.fileViewMode = "list";
    state.reviewMode = "focus";
    state.reviewSurface = "accessible";
    state.annotationsByFile["src/a.ts"] = [
      {
        side: "additions",
        lineNumber: 2,
        metadata: { id: "draft", body: "half typed", kind: "comment-form" },
      },
    ];
    expect(parseReviewSession(serializeReviewSession(state), first)).toEqual(state);
  });

  test("reconciles 23,000 persisted viewed and collapsed paths in deterministic order", () => {
    const files = Array.from({ length: LARGE_FILE_COUNT }, (_, index) => {
      const padded = String(index).padStart(5, "0");
      return {
        diffId: `diff-${padded}`,
        path: `src/group-${padded.slice(0, 2)}/file-${padded}.ts`,
      };
    });
    const snapshot: ReviewSessionSnapshot = {
      diffArgs: ["--cached"],
      files,
      repoRoot: "/large-repo",
      snapshotId: "large-before",
    };
    const paths = files.map((item) => item.path);
    const changedPath = paths[Math.floor(LARGE_FILE_COUNT / 2)]!;
    const state = createReviewSession(snapshot);
    state.collapsedPaths = reverseCopy(paths.filter((path) => path !== changedPath));
    state.collapsedPaths.push(paths[0]!, "removed.ts");
    state.viewedPaths = reverseCopy(paths);
    state.viewedPaths.push(paths[0]!, "removed.ts");

    const reconciled = parseReviewSession(
      serializeReviewSession(state),
      {
        ...snapshot,
        files: files.map((item) =>
          item.path === changedPath ? { ...item, diffId: `${item.diffId}-changed` } : item,
        ),
        snapshotId: "large-after",
      },
      [changedPath],
    );

    expect(reconciled.collapsedPaths).toEqual(paths);
    expect(reconciled.viewedPaths).toEqual(paths.filter((path) => path !== changedPath));
  });

  test("migrates version 1 through 4 persistence without losing review progress", () => {
    const state = createReviewSession(first);
    state.viewedPaths = ["src/a.ts"];
    const legacy = JSON.stringify({ ...state, reviewMode: undefined, version: 1 });
    expect(parseReviewSession(legacy, first)).toMatchObject({
      fileCommentDrafts: {},
      fileOrder: "path",
      fileViewMode: "tree",
      reviewMode: "all",
      reviewSurface: "rich",
      version: 5,
      viewedPaths: ["src/a.ts"],
    });
    expect(parseReviewSession(JSON.stringify({ ...state, version: 2 }), first).version).toBe(5);
    expect(parseReviewSession(JSON.stringify({ ...state, version: 3 }), first)).toMatchObject({
      fileOrder: "path",
      fileViewMode: "tree",
      version: 5,
    });
    expect(parseReviewSession(JSON.stringify({ ...state, version: 4 }), first)).toMatchObject({
      reviewSurface: "rich",
      version: 5,
    });
  });

  test("falls back safely for corrupt and old persistence", () => {
    expect(parseReviewSession(null, first)).toEqual(createReviewSession(first));
    expect(parseReviewSession("not json", first)).toEqual(createReviewSession(first));
    expect(parseReviewSession(JSON.stringify({ version: 0 }), first)).toEqual(
      createReviewSession(first),
    );
  });

  test("sanitizes malformed persisted collections and normalizes current paths", () => {
    const state = createReviewSession(first);
    const malformed = JSON.stringify({
      ...state,
      annotationsByFile: {
        "src/a.ts": [
          null,
          { side: "elsewhere", lineNumber: 1, metadata: {} },
          {
            side: "deletions",
            lineNumber: 3,
            metadata: { id: "valid", body: "Keep", kind: "comment" },
          },
        ],
        "src/b.ts": "not-an-array",
      },
      collapsedPaths: ["src/a.ts", 4, "removed.ts"],
      commentExports: [null, { id: "invalid" }, comment("src/a.ts")],
      fileCommentDrafts: { "src/a.ts": "draft", "src/b.ts": 3 },
      fileIdentities: [],
      filters: {
        binary: true,
        extensions: ["ts", 2, "ts"],
        path: 9,
        statuses: "modified",
      },
      selectedPath: "removed.ts",
      viewedPaths: ["src/a.ts", "removed.ts"],
    });
    expect(parseReviewSession(malformed, first)).toMatchObject({
      annotationsByFile: { "src/a.ts": [{ lineNumber: 3, side: "deletions" }] },
      collapsedPaths: ["src/a.ts"],
      commentExports: [comment("src/a.ts")],
      fileCommentDrafts: { "src/a.ts": "draft" },
      fileIdentities: {},
      filters: { binary: true, extensions: ["ts"], path: "", statuses: [] },
      selectedPath: "src/a.ts",
      viewedPaths: ["src/a.ts"],
    });
  });

  test("updates path sets and annotation maps without needless object churn", () => {
    expect(updateReviewPathSet(["z.ts"], "a.ts", true)).toEqual(["a.ts", "z.ts"]);
    expect(updateReviewPathSet(["a.ts", "z.ts"], "a.ts", false)).toEqual(["z.ts"]);

    const annotation = {
      side: "additions" as const,
      lineNumber: 1,
      metadata: { id: "note", body: "Body", kind: "comment" as const },
    };
    const original = { "src/a.ts": [annotation] };
    expect(updateReviewAnnotations(original, "src/a.ts", (current) => current)).toBe(original);
    expect(updateReviewAnnotations({}, "missing.ts", () => [])).toEqual({});
    expect(updateReviewAnnotations(original, "src/a.ts", () => [])).toEqual({});
    expect(updateReviewAnnotations({}, "src/a.ts", () => [annotation])).toEqual({
      "src/a.ts": [annotation],
    });
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
    state.fileCommentDrafts["src/a.ts"] = "Remember the module boundary";
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
    expect(next.fileCommentDrafts).toEqual({
      "src/renamed.ts": "Remember the module boundary",
    });
  });

  test("keeps file-level notes open across content refresh and reopens stale file notes", () => {
    const state = createReviewSession(first);
    state.commentExports = [
      {
        ...comment("src/a.ts"),
        contextLines: [],
        lineNumber: 0,
        scope: "file",
        status: "open",
      },
    ];
    const refreshed = reconcileReviewSession(state, {
      ...first,
      snapshotId: "snapshot-2",
      files: [
        { path: "src/a.ts", diffId: "a2" },
        { path: "src/b.ts", diffId: "b1" },
      ],
    });
    expect(refreshed.commentExports[0]).toMatchObject({ scope: "file", status: "open" });
    const stale = { ...refreshed.commentExports[0]!, status: "stale" as const };
    expect(
      reconcileCommentAnchors(
        [stale],
        { "src/a.ts": fullDiff("src/a.ts", ["next\n"]) },
        "snapshot-3",
      )[0],
    ).toMatchObject({ scope: "file", status: "open", snapshotId: "snapshot-3" });
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
    expect(reconcileAnnotationsToComments(annotations, result)).toBe(annotations);
  });

  test("re-anchors comments inside partial hunks on either side", () => {
    const partial = {
      name: "src/a.ts",
      type: "change",
      isPartial: true,
      additionLines: ["context\n", "new target\n"],
      deletionLines: ["context\n", "old target\n"],
      hunks: [
        {
          additionStart: 20,
          additionCount: 2,
          additionLineIndex: 0,
          deletionStart: 10,
          deletionCount: 2,
          deletionLineIndex: 0,
        },
      ],
    } as FileDiffMetadata;
    const additions = { ...comment("src/a.ts", "new target"), status: "stale" as const };
    const deletions = {
      ...comment("src/a.ts", "old target"),
      id: "old",
      side: "deletions" as const,
      status: "stale" as const,
    };
    expect(
      reconcileCommentAnchors([additions, deletions], { "src/a.ts": partial }, "next"),
    ).toEqual([
      { ...additions, lineNumber: 21, snapshotId: "next", status: "open" },
      { ...deletions, lineNumber: 11, snapshotId: "next", status: "open" },
    ]);
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

function reverseCopy<T>(values: readonly T[]): T[] {
  const result: T[] = [];
  for (let index = values.length - 1; index >= 0; index -= 1) result.push(values[index]!);
  return result;
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
