import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { isCliEntrypoint } from "../src/server/cli.js";
import {
  formatCliHelp,
  getCliInformationalOutput,
  parseCliArgs,
  readPackageVersion,
} from "../src/server/cliOptions.js";

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
    for (const option of [
      "--stat",
      "--numstat",
      "--shortstat",
      "--name-only",
      "--name-status",
      "--summary",
      "--raw",
      "--dirstat",
      "--no-patch",
      "-s",
      "--check",
    ]) {
      expect(() => parseCliArgs([option])).toThrow("summary-only");
    }
  });

  test("formats informational help and version without consuming pathspec values", () => {
    // Asserted against package.json rather than a literal: the contract is that
    // the CLI reports the packaged version, and hardcoding it here fails every
    // release bump for no real defect.
    const packageVersion = packageJson.version;
    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(formatCliHelp()).toContain("diffdeck --repo ../my-repo -- -- '*.ts'");
    expect(readPackageVersion()).toBe(packageVersion);
    expect(getCliInformationalOutput(["--help"])).toBe(formatCliHelp());
    expect(getCliInformationalOutput(["-v"])).toBe(packageVersion);
    expect(getCliInformationalOutput(["--version"])).toBe(packageVersion);
    expect(getCliInformationalOutput(["--", "--help"])).toBeNull();
    expect(getCliInformationalOutput(["HEAD~1", "HEAD"])).toBeNull();
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

  test("parses repository, host, debug, browser, and pathspec options", () => {
    expect(
      parseCliArgs([
        "--repo",
        "../repo",
        "--host",
        "::1",
        "--no-open",
        "--debug",
        "--",
        "--",
        "*.ts",
      ]),
    ).toMatchObject({
      debug: true,
      diffArgs: ["--", "*.ts"],
      host: "::1",
      openBrowser: false,
      repo: "../repo",
    });
  });

  test("rejects missing and unsafe option values", () => {
    expect(() => parseCliArgs(["--repo"])).toThrow("Missing value for --repo");
    expect(() => parseCliArgs(["--host"])).toThrow("Missing value for --host");
    expect(() => parseCliArgs(["--port"])).toThrow("Missing value for --port");
    expect(() => parseCliArgs(["--port", "-1"])).toThrow("Invalid port");
    expect(() => parseCliArgs(["--watch-interval", "99"])).toThrow("Invalid watch interval");
    expect(() => parseCliArgs(["--watch-interval", "60001"])).toThrow("Invalid watch interval");
    expect(() => parseCliArgs(["--watch-interval"])).toThrow("Invalid watch interval");
    expect(() => parseCliArgs(["--editor", " "])).toThrow("Missing value for --editor");
  });

  test("recognizes an npm bin symlink as the CLI entrypoint", () => {
    const directory = mkdtempSync(join(tmpdir(), "diffdeck-cli-entrypoint-"));
    try {
      const modulePath = join(directory, "cli.js");
      const binPath = join(directory, "diffdeck");
      writeFileSync(modulePath, "");
      symlinkSync(modulePath, binPath);
      expect(isCliEntrypoint(binPath, modulePath)).toBe(true);
      expect(isCliEntrypoint(join(directory, "missing"), modulePath)).toBe(false);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
