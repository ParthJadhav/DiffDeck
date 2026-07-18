import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliOptions } from "./types.js";

const DEFAULT_PORT = 4321;

export function readPackageVersion(): string {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json");
  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version: string };
  return version;
}

export function formatCliHelp(): string {
  return `Diffdeck

Usage:
  diffdeck [options] [git diff args...]

Options:
  --repo <path>     Repository path. Defaults to the current working directory.
  --port <number>   Port to bind. Defaults to ${DEFAULT_PORT} (falls back to a free port if taken).
  --host <host>     Host to bind. Defaults to 127.0.0.1.
  --no-open         Do not open the browser automatically.
  --debug           Print line-numbered diff parsing logs.
  --watch           Watch the repository and notify the browser when the diff changes.
  --watch-interval  Watch polling interval in milliseconds (default: 750).
  --editor <cmd>    Editor command used by the browser's Open in editor action.
  --structural      Enable optional Difftastic structural views when installed.
  --write           Enable confirmed stage, unstage, and revert actions.
  --version         Print the installed version and exit.
  --help            Show this help message.

Examples:
  diffdeck
  diffdeck --cached
  diffdeck HEAD~1 HEAD
  diffdeck --repo ../my-repo -- -- '*.ts'
`;
}

export function getCliInformationalOutput(argv: readonly string[]): string | null {
  for (const argument of argv) {
    if (argument === "--") return null;
    if (argument === "--help") return formatCliHelp();
    if (argument === "--version" || argument === "-v") return readPackageVersion();
  }
  return null;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repo: process.cwd(),
    port: DEFAULT_PORT,
    portExplicit: false,
    host: "127.0.0.1",
    openBrowser: true,
    debug: process.env.DIFFDECK_DEBUG === "1" || process.env.DIFFDECK_DEBUG === "true",
    diffArgs: [],
    structural: false,
    watch: false,
    watchInterval: 750,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--repo") {
      const value = argv[index + 1];
      if (value == null) throw new Error("Missing value for --repo.");
      options.repo = value;
      index += 1;
      continue;
    }

    if (argument === "--port") {
      const value = argv[index + 1];
      if (value == null) throw new Error("Missing value for --port.");
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
        throw new Error(`Invalid port: ${value}`);
      }
      options.port = parsed;
      options.portExplicit = true;
      index += 1;
      continue;
    }

    if (argument === "--host") {
      const value = argv[index + 1];
      if (value == null) throw new Error("Missing value for --host.");
      options.host = value;
      index += 1;
      continue;
    }

    if (argument === "--no-open") {
      options.openBrowser = false;
      continue;
    }

    if (argument === "--debug") {
      options.debug = true;
      continue;
    }

    if (argument === "--watch") {
      options.watch = true;
      continue;
    }

    if (argument === "--watch-interval") {
      const value = argv[index + 1];
      const parsed = Number(value);
      if (value == null || !Number.isInteger(parsed) || parsed < 100 || parsed > 60_000) {
        throw new Error(`Invalid watch interval: ${value ?? "missing"}`);
      }
      options.watchInterval = parsed;
      index += 1;
      continue;
    }

    if (argument === "--editor") {
      const value = argv[index + 1];
      if (value == null || value.trim().length === 0) {
        throw new Error("Missing value for --editor.");
      }
      options.editor = value;
      index += 1;
      continue;
    }

    if (argument === "--structural") {
      options.structural = true;
      continue;
    }

    if (argument === "--write") {
      options.write = true;
      continue;
    }

    if (argument === "--") {
      options.diffArgs.push(...argv.slice(index + 1));
      break;
    }

    options.diffArgs.push(argument);
  }

  const summaryOnly = new Set([
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
  ]);
  const invalid = options.diffArgs.find((argument) => summaryOnly.has(argument.split("=")[0]!));
  if (invalid != null) {
    throw new Error(`${invalid} is a summary-only Git mode and cannot render a reviewable patch.`);
  }
  return options;
}
