#!/usr/bin/env node

import { realpathSync } from "node:fs";
import open from "open";
import { resolve } from "node:path";
import { buildDiffSession, resolveRepoRoot } from "./git.js";
import { startServer } from "./server.js";
import type { CliOptions } from "./types.js";

function printHelp(): void {
  console.log(`cli-diff

Usage:
  cli-diff [options] [git diff args...]

Options:
  --repo <path>     Repository path. Defaults to the current working directory.
  --port <number>   Port to bind. Defaults to 0 (pick a free port).
  --host <host>     Host to bind. Defaults to 127.0.0.1.
  --no-open         Do not open the browser automatically.
  --help            Show this help message.

Examples:
  cli-diff
  cli-diff --cached
  cli-diff HEAD~1 HEAD
  cli-diff --repo ../my-repo -- -- '*.ts'
`);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repo: process.cwd(),
    port: 0,
    host: "127.0.0.1",
    openBrowser: true,
    diffArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help") {
      printHelp();
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

    if (argument === "--") {
      options.diffArgs.push(...argv.slice(index + 1));
      break;
    }

    options.diffArgs.push(argument);
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const requestedRepoPath = realpathSync(resolve(options.repo));
  const repoRoot = resolveRepoRoot(requestedRepoPath);
  const session = buildDiffSession(
    repoRoot,
    requestedRepoPath,
    options.diffArgs,
  );
  const server = await startServer(session, options.port, options.host);

  console.log(`CLI Diff server running at ${server.url}`);
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
  const message = error instanceof Error ? error.message : String(error);
  console.error(`cli-diff failed: ${message}`);
  process.exit(1);
});
