import { describe, expect, test } from "bun:test";
import {
  buildFlatRows,
  buildTreeRows,
  collapsedAncestors,
  type FileListRow,
  formatLineCount,
  searchFiles,
} from "../src/client/lib/fileListRows.js";
import { orderDiffFiles } from "../src/client/lib/fileOrder.js";
import type { DiffFileSummary } from "../src/client/types.js";

const files = orderDiffFiles(
  [
    file("src/components/Button.tsx"),
    file("src/components/Card.tsx"),
    file("src/index.ts"),
    file("packages/core/lib/deep/only.ts"),
    file("README.md"),
  ],
  "path",
);

function describeRows(rows: readonly FileListRow[]): string[] {
  return rows.map((row) =>
    row.kind === "directory"
      ? `${"  ".repeat(row.depth)}${row.label}/ ${row.viewedCount}/${row.fileCount}${row.collapsed ? " (collapsed)" : ""}`
      : `${"  ".repeat(row.depth)}${row.file.path.slice(row.file.path.lastIndexOf("/") + 1)}`,
  );
}

describe("file list rows", () => {
  test("groups files under folders in tree path order with viewed rollups", () => {
    const rows = buildTreeRows(files, new Set(), new Set(["src/components/Card.tsx"]));
    expect(describeRows(rows)).toEqual([
      "packages/core/lib/deep/ 0/1",
      "  only.ts",
      "src/ 1/3",
      "  components/ 1/2",
      "    Button.tsx",
      "    Card.tsx",
      "  index.ts",
      "README.md",
    ]);
  });

  test("the file rows match the order j/k steps through", () => {
    const rows = buildTreeRows(files, new Set(), new Set());
    const filePaths = rows.flatMap((row) => (row.kind === "file" ? [row.file.path] : []));
    expect(filePaths).toEqual(files.map((item) => item.path));
  });

  test("collapsing a folder hides its descendants but keeps its counts", () => {
    const rows = buildTreeRows(files, new Set(["src"]), new Set(["src/index.ts"]));
    expect(describeRows(rows)).toEqual([
      "packages/core/lib/deep/ 0/1",
      "  only.ts",
      "src/ 1/3 (collapsed)",
      "README.md",
    ]);
  });

  test("compressed folder chains collapse by their deepest path", () => {
    const rows = buildTreeRows(files, new Set(["packages/core/lib/deep"]), new Set());
    expect(rows[0]).toMatchObject({ collapsed: true, id: "packages/core/lib/deep" });
    expect(rows[1]).toMatchObject({ id: "src", kind: "directory" });
  });

  test("finds the collapsed folders hiding a selected file", () => {
    const collapsed = new Set(["src", "src/components", "packages/core/lib/deep"]);
    expect(collapsedAncestors(collapsed, "src/components/Card.tsx")).toEqual([
      "src",
      "src/components",
    ]);
    expect(collapsedAncestors(collapsed, "srcfoo/x.ts")).toEqual([]);
  });

  test("flat rows follow the given review order", () => {
    const reversed = files.map((_, index) => files[files.length - 1 - index]!);
    expect(
      buildFlatRows(reversed).map((row) => (row.kind === "file" ? row.file.path : "")),
    ).toEqual(reversed.map((item) => item.path));
  });

  test("search matches any part of the path, case-insensitively", () => {
    expect(searchFiles(files, "  COMPONENTS/b ").map((item) => item.path)).toEqual([
      "src/components/Button.tsx",
    ]);
    expect(searchFiles(files, "")).toBe(files);
  });

  test("formats line counts compactly", () => {
    expect(formatLineCount(999)).toBe("999");
    expect(formatLineCount(1250)).toBe("1.2k");
    expect(formatLineCount(12_091)).toBe("12k");
  });

  test("builds rows for 23,000 files quickly", () => {
    const many = orderDiffFiles(
      Array.from({ length: 23_000 }, (_, index) =>
        file(`huge/group-${Math.floor(index / 1000)}/item-${index}.ts`),
      ),
      "path",
    );
    const started = performance.now();
    const rows = buildTreeRows(many, new Set(), new Set());
    expect(performance.now() - started).toBeLessThan(500);
    expect(rows.filter((row) => row.kind === "file")).toHaveLength(23_000);
    expect(rows[0]).toMatchObject({ fileCount: 23_000, label: "huge" });
  });
});

function file(path: string): DiffFileSummary {
  return {
    additions: 1,
    changeType: "change",
    deletions: 0,
    diffId: `diff:${path}`,
    gitStatus: "modified",
    path,
  };
}
