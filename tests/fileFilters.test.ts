import { describe, expect, test } from "bun:test";
import { filterDiffFiles, isDependencyPath } from "../src/client/lib/fileFilters.js";
import { emptyReviewFilters } from "../src/client/lib/reviewSession.js";
import type { DiffFileSummary } from "../src/client/types.js";

const files: DiffFileSummary[] = [
  file("src/app.ts", "modified", 10),
  file("dist/app.min.js", "modified", 900),
  file("yarn.lock", "modified", 200),
  { ...file("image.png", "added", 0), isBinary: true },
  { ...file("conflict.ts", "modified", 4), hasMergeConflicts: true },
];

describe("file filters", () => {
  test("composes path, extension, viewed, generated, lock, binary, conflict, dependency and size", () => {
    expect(
      filterDiffFiles(
        files,
        { ...emptyReviewFilters, hideGenerated: true, hideLock: true },
        new Set(),
      ).map((f) => f.path),
    ).toEqual(["src/app.ts", "image.png", "conflict.ts"]);
    expect(
      filterDiffFiles(files, { ...emptyReviewFilters, binary: true }, new Set()).map((f) => f.path),
    ).toEqual(["image.png"]);
    expect(
      filterDiffFiles(files, { ...emptyReviewFilters, conflicts: true }, new Set()).map(
        (f) => f.path,
      ),
    ).toEqual(["conflict.ts"]);
    expect(
      filterDiffFiles(files, { ...emptyReviewFilters, dependency: true }, new Set()).map(
        (f) => f.path,
      ),
    ).toEqual(["yarn.lock"]);
    expect(
      filterDiffFiles(
        files,
        { ...emptyReviewFilters, extensions: ["ts"], hideViewed: true },
        new Set(["src/app.ts"]),
      ).map((f) => f.path),
    ).toEqual(["conflict.ts"]);
    expect(
      filterDiffFiles(files, { ...emptyReviewFilters, changeSizes: ["large"] }, new Set()).map(
        (f) => f.path,
      ),
    ).toEqual(["dist/app.min.js"]);
  });

  test("recognizes dependency manifests by basename without case sensitivity", () => {
    expect(isDependencyPath("packages/app/Package.JSON")).toBe(true);
    expect(isDependencyPath("packages/app/package.json.backup")).toBe(false);
  });
});

function file(
  path: string,
  gitStatus: DiffFileSummary["gitStatus"],
  lines: number,
): DiffFileSummary {
  return { additions: lines, changeType: "change", deletions: 0, diffId: path, gitStatus, path };
}
