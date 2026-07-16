import { describe, expect, test } from "bun:test";
import { getReviewNavigation } from "../src/client/lib/reviewNavigation.js";

const files = [{ path: "a.ts" }, { path: "b.ts" }, { path: "c.ts" }, { path: "d.ts" }];

describe("review navigation", () => {
  test("reports honest boundaries for the selected visible file", () => {
    expect(getReviewNavigation(files, "a.ts", new Set())).toMatchObject({
      nextPath: "b.ts",
      position: 1,
      previousPath: null,
      total: 4,
    });
    expect(getReviewNavigation(files, "d.ts", new Set())).toMatchObject({
      nextPath: null,
      position: 4,
      previousPath: "c.ts",
    });
  });

  test("skips viewed files without wrapping at either boundary", () => {
    const viewed = new Set(["b.ts", "c.ts"]);
    expect(getReviewNavigation(files, "a.ts", viewed).nextUnviewedPath).toBe("d.ts");
    expect(getReviewNavigation(files, "d.ts", viewed).previousUnviewedPath).toBe("a.ts");
    expect(
      getReviewNavigation(files, "d.ts", new Set(files.map((file) => file.path))),
    ).toMatchObject({
      nextUnviewedPath: null,
      previousUnviewedPath: null,
    });
  });

  test("handles empty, filtered, and removed selections", () => {
    expect(getReviewNavigation([], null, new Set())).toEqual({
      nextPath: null,
      nextUnviewedPath: null,
      position: 0,
      previousPath: null,
      previousUnviewedPath: null,
      total: 0,
    });
    expect(getReviewNavigation([{ path: "filtered.ts" }], "removed.ts", new Set())).toMatchObject({
      nextPath: "filtered.ts",
      nextUnviewedPath: "filtered.ts",
      position: 0,
      previousPath: null,
    });
  });
});
