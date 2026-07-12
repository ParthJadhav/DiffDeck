#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import open from "open";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiffSession,
  buildDiffSessionFromRawDiff,
  getRawDiffAsync,
  resolveRepoRoot,
} from "./git.js";
import { startServer, type DiffSessionSource } from "./server.js";
import type { CliOptions } from "./types.js";
import { formatCliError } from "./errors.js";

const DEFAULT_PORT = 4321;

function readPackageVersion(): string {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json");
  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version: string };
  return version;
}

function printHelp(): void {
  console.log(`Diffdeck

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
`);
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

    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }

    if (argument === "--version" || argument === "-v") {
      console.log(readPackageVersion());
      process.exit(0);
    }

    if (argument === "--repo") {
      const value = argv[index + 1];
      if (value == null) {
        throw new Error("Missing value for --repo.");
      }
      options.repo = value;
      index += 1;
      continue;
    }

    if (argument === "--port") {
      const value = argv[index + 1];
      if (value == null) {
        throw new Error("Missing value for --port.");
      }
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
      if (value == null) {
        throw new Error("Missing value for --host.");
      }
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
      if (value == null || value.trim().length === 0)
        throw new Error("Missing value for --editor.");
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

async function startServerWithFallback(
  sessionSource: DiffSessionSource,
  options: CliOptions & { capabilityToken?: string },
) {
  try {
    return await startServer(sessionSource, options.port, options.host, options);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    const portWasExplicit = options.portExplicit;
    if (code !== "EADDRINUSE" || portWasExplicit) throw error;

    console.warn(
      `Port ${options.port} is in use. Falling back to a free port — pass --port to override.`,
    );
    return await startServer(sessionSource, 0, options.host, options);
  }
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const requestedRepoPath = realpathSync(resolve(options.repo));
  const repoRoot = resolveRepoRoot(requestedRepoPath);
  const buildSession = () =>
    buildDiffSession(repoRoot, requestedRepoPath, options.diffArgs, {
      debug: options.debug,
    });
  const session = buildSession();
  let watchFingerprint = createHash("sha256").update(session.rawDiff).digest("hex");
  const poll = async () => {
    const rawDiff = await getRawDiffAsync(repoRoot, options.diffArgs);
    const nextFingerprint = createHash("sha256").update(rawDiff).digest("hex");
    if (nextFingerprint === watchFingerprint) return null;
    const nextSession = buildDiffSessionFromRawDiff(
      repoRoot,
      requestedRepoPath,
      options.diffArgs,
      rawDiff,
      { debug: options.debug },
    );
    watchFingerprint = nextFingerprint;
    return nextSession;
  };
  const remote = !isLoopbackHost(options.host);
  const capabilityToken = remote ? randomBytes(24).toString("base64url") : undefined;
  const server = await startServerWithFallback(
    {
      initialSession: session,
      onRefresh: (nextSession) => {
        watchFingerprint = createHash("sha256").update(nextSession.rawDiff).digest("hex");
      },
      poll,
      refresh: buildSession,
    },
    { ...options, capabilityToken },
  );

  console.log(`Diffdeck server running at ${server.url}`);
  console.log(`Repository: ${repoRoot}`);
  if (remote) {
    console.warn(
      `Warning: repository content is exposed on ${options.host}; keep the tokenized URL private.`,
    );
  }
  if (session.files.length === 0) {
    console.log("Diff is empty for the current arguments.");
  } else {
    console.log(`Rendering ${session.files.length} changed file(s).`);
  }

  if (options.openBrowser) {
    await open(server.url);
  }

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down.`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

if (process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const debug =
      process.argv.includes("--debug") ||
      process.env.DIFFDECK_DEBUG === "1" ||
      process.env.DIFFDECK_DEBUG === "true";
    console.error(formatCliError(error, debug));
    process.exit(1);
  });
}
