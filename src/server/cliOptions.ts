import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliOptions } from "./types.js";

const DEFAULT_PORT = 4321;

export function readPackageVersion(): string {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json");
  const rawPackageJson = readFileSync(packageJsonPath, "utf-8");
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(rawPackageJson);
  } catch (error) {
    throw new Error(`Unable to parse package metadata at ${packageJsonPath}.`, { cause: error });
  }
  if (
    typeof packageJson !== "object" ||
    packageJson == null ||
    !("version" in packageJson) ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error(`Package metadata at ${packageJsonPath} does not contain a valid version.`);
  }
  return packageJson.version;
}

type CliOption = {
  name: string;
  /** Placeholder shown in help after the name. */
  value?: string;
  description: string;
  /** Applies the option; returns how many following arguments it consumed. */
  apply?: (options: CliOptions, value: string | undefined) => number;
};

function requireValue(name: string, value: string | undefined): string {
  if (value == null) throw new Error(`Missing value for ${name}.`);
  return value;
}

const cliOptions: readonly CliOption[] = [
  {
    name: "--repo",
    value: "<path>",
    description: "Repository path. Defaults to the current working directory.",
    apply: (options, value) => {
      options.repo = requireValue("--repo", value);
      return 1;
    },
  },
  {
    name: "--port",
    value: "<number>",
    description: `Port to bind. Defaults to ${DEFAULT_PORT} (falls back to a free port if taken).`,
    apply: (options, value) => {
      const parsed = Number(requireValue("--port", value));
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
        throw new Error(`Invalid port: ${value}`);
      }
      options.port = parsed;
      options.portExplicit = true;
      return 1;
    },
  },
  {
    name: "--host",
    value: "<host>",
    description: "Host to bind. Defaults to 127.0.0.1.",
    apply: (options, value) => {
      options.host = requireValue("--host", value);
      return 1;
    },
  },
  {
    name: "--no-open",
    description: "Do not open the browser automatically.",
    apply: (options) => {
      options.openBrowser = false;
      return 0;
    },
  },
  {
    name: "--debug",
    description: "Print line-numbered diff parsing logs.",
    apply: (options) => {
      options.debug = true;
      return 0;
    },
  },
  {
    name: "--watch",
    description: "Watch the repository and notify the browser when the diff changes.",
    apply: (options) => {
      options.watch = true;
      return 0;
    },
  },
  {
    name: "--watch-interval",
    description: "Watch polling interval in milliseconds (default: 750).",
    apply: (options, value) => {
      const parsed = Number(value);
      if (value == null || !Number.isInteger(parsed) || parsed < 100 || parsed > 60_000) {
        throw new Error(`Invalid watch interval: ${value ?? "missing"}`);
      }
      options.watchInterval = parsed;
      return 1;
    },
  },
  {
    name: "--editor",
    value: "<cmd>",
    description: "Editor command used by the browser's Open in editor action.",
    apply: (options, value) => {
      if (value == null || value.trim().length === 0) {
        throw new Error("Missing value for --editor.");
      }
      options.editor = value;
      return 1;
    },
  },
  {
    name: "--structural",
    description: "Enable optional Difftastic structural views when installed.",
    apply: (options) => {
      options.structural = true;
      return 0;
    },
  },
  {
    name: "--write",
    description: "Enable confirmed stage, unstage, and revert actions.",
    apply: (options) => {
      options.write = true;
      return 0;
    },
  },
  { name: "--version", description: "Print the installed version and exit." },
  { name: "--help", description: "Show this help message." },
];

export function formatCliHelp(): string {
  const optionLines = cliOptions
    .map(
      (option) =>
        `  ${[option.name, option.value].filter(Boolean).join(" ").padEnd(18)}${option.description}`,
    )
    .join("\n");
  return `Diffdeck

Usage:
  diffdeck [options] [git diff args...]

Options:
${optionLines}

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

export function isDebugEnvironment(): boolean {
  return process.env.DIFFDECK_DEBUG === "1" || process.env.DIFFDECK_DEBUG === "true";
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repo: process.cwd(),
    port: DEFAULT_PORT,
    portExplicit: false,
    host: "127.0.0.1",
    openBrowser: true,
    debug: isDebugEnvironment(),
    diffArgs: [],
    structural: false,
    watch: false,
    watchInterval: 750,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      options.diffArgs.push(...argv.slice(index + 1));
      break;
    }
    const option = cliOptions.find((candidate) => candidate.name === argument);
    if (option?.apply != null) {
      index += option.apply(options, argv[index + 1]);
      continue;
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
