#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import open from "open";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDiffSession, resolveRepoRoot } from "./git.js";
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
  --version         Print the installed version and exit.
  --help            Show this help message.

Examples:
  diffdeck
  diffdeck --cached
  diffdeck HEAD~1 HEAD
  diffdeck --repo ../my-repo -- -- '*.ts'
`);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repo: process.cwd(),
    port: DEFAULT_PORT,
    host: "127.0.0.1",
    openBrowser: true,
    debug: process.env.DIFFDECK_DEBUG === "1" || process.env.DIFFDECK_DEBUG === "true",
    diffArgs: [],
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
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid port: ${value}`);
      }
      options.port = parsed;
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

    if (argument === "--") {
      options.diffArgs.push(...argv.slice(index + 1));
      break;
    }

    options.diffArgs.push(argument);
  }

  return options;
}

async function startServerWithFallback(sessionSource: DiffSessionSource, options: CliOptions) {
  try {
    return await startServer(sessionSource, options.port, options.host);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    const portWasExplicit = options.port !== DEFAULT_PORT;
    if (code !== "EADDRINUSE" || portWasExplicit) throw error;

    console.warn(
      `Port ${options.port} is in use. Falling back to a free port — pass --port to override.`,
    );
    return await startServer(sessionSource, 0, options.host);
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
  const server = await startServerWithFallback(
    { initialSession: session, refresh: buildSession },
    options,
  );

  console.log(`Diffdeck server running at ${server.url}`);
  console.log(`Repository: ${repoRoot}`);
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

main().catch((error: unknown) => {
  const debug =
    process.argv.includes("--debug") ||
    process.env.DIFFDECK_DEBUG === "1" ||
    process.env.DIFFDECK_DEBUG === "true";
  console.error(formatCliError(error, debug));
  process.exit(1);
});
