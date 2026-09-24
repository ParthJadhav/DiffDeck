import { describe, expect, test } from "bun:test";
import { buildHeader, describeDiffScope } from "../src/client/lib/diff.js";

describe("diff scope", () => {
  test("names the common invocations and declines to guess the rest", () => {
    expect(describeDiffScope([])).toBe("unstaged changes");
    expect(describeDiffScope(["--cached"])).toBe("staged changes");
    expect(describeDiffScope(["--staged"])).toBe("staged changes");
    expect(describeDiffScope(["HEAD"])).toBe("all uncommitted changes");
    expect(describeDiffScope(["main...feature"])).toBeNull();
    expect(describeDiffScope(["HEAD", "--", "src"])).toBeNull();
  });

  test("renders the exact command", () => {
    expect(buildHeader([])).toBe("git diff");
    expect(buildHeader(["--cached"])).toBe("git diff --cached");
  });
});
