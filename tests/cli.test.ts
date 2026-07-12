import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isCliEntrypoint, parseCliArgs } from "../src/server/cli.js";

describe("CLI parsing", () => {
  test("tracks an explicitly supplied default port", () => {
    expect(parseCliArgs(["--port", "4321"]).portExplicit).toBe(true);
    expect(parseCliArgs([]).portExplicit).toBe(false);
  });

  test("validates the complete TCP port range", () => {
    expect(parseCliArgs(["--port", "65535"]).port).toBe(65_535);
    expect(() => parseCliArgs(["--port", "65536"])).toThrow("Invalid port");
  });

  test("rejects summary-only Git modes", () => {
    expect(() => parseCliArgs(["--stat"])).toThrow("summary-only");
    expect(() => parseCliArgs(["--name-only"])).toThrow("summary-only");
  });

  test("parses workflow, editor, structural, and write flags", () => {
    expect(
      parseCliArgs([
        "--watch",
        "--watch-interval",
        "200",
        "--editor",
        "code",
        "--structural",
        "--write",
      ]),
    ).toMatchObject({
      watch: true,
      watchInterval: 200,
      editor: "code",
      structural: true,
      write: true,
    });
  });

  test("recognizes an npm bin symlink as the CLI entrypoint", () => {
    const directory = mkdtempSync(join(tmpdir(), "diffdeck-cli-entrypoint-"));
    try {
      const modulePath = join(directory, "cli.js");
      const binPath = join(directory, "diffdeck");
      writeFileSync(modulePath, "");
      symlinkSync(modulePath, binPath);
      expect(isCliEntrypoint(binPath, modulePath)).toBe(true);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
