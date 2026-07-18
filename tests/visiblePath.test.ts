import { describe, expect, test } from "bun:test";
import { chooseVisiblePath } from "../src/client/lib/visiblePath.js";

describe("visible file ownership", () => {
  const candidates = [
    { path: "a.ts", top: -80 },
    { path: "b.ts", top: 8 },
    { path: "c.ts", top: 180 },
  ];

  test("does not replace a pinned deep link before its card becomes visible", () => {
    expect(chooseVisiblePath(candidates, "target.ts")).toBeNull();
    expect(chooseVisiblePath([...candidates, { path: "target.ts", top: 20 }], "target.ts")).toBe(
      "target.ts",
    );
  });

  test("tracks the closest visible file after user scrolling releases the pin", () => {
    expect(chooseVisiblePath(candidates, null)).toBe("b.ts");
    expect(chooseVisiblePath([{ path: "c.ts", top: 180 }], null)).toBe("c.ts");
    expect(chooseVisiblePath([], null)).toBeNull();
  });
});
