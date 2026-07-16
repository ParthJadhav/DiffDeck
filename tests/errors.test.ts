import { describe, expect, test } from "bun:test";
import { DiffdeckError, formatCliError } from "../src/server/errors.js";

describe("CLI error formatting", () => {
  test("renders structured context, causes, and optional debug stacks", () => {
    const cause = new TypeError("invalid object");
    const error = new DiffdeckError(
      "Unable to parse patch",
      ["repo: /tmp/example", "arg: HEAD"],
      cause,
    );
    const normal = formatCliError(error);
    expect(normal).toContain("diffdeck failed: Unable to parse patch");
    expect(normal).toContain("Context:\n  repo: /tmp/example\n  arg: HEAD");
    expect(normal).toContain("Cause: TypeError: invalid object");
    expect(normal).not.toContain("Stack:");
    expect(formatCliError(error, true)).toContain("Stack:");
  });

  test("handles primitive errors and primitive causes", () => {
    expect(formatCliError("plain failure")).toBe("diffdeck failed: plain failure");
    const error = new Error("outer", { cause: "inner" });
    expect(formatCliError(error)).toContain("Cause: inner");
  });
});
