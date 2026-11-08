#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { randomBytes } from "node:crypto";
import open from "open";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRepoRoot } from "./git.js";
import { createGitDiffSource, type DiffSource } from "./diffSource.js";
import { startServer, type ServerOptions } from "./server.js";
import { formatCliError } from "./errors.js";
import { getCliInformationalOutput, isDebugEnvironment, parseCliArgs } from "./cliOptions.js";

export { parseCliArgs } from "./cliOptions.js";

async function startServerWithFallback(
  source: DiffSource,
  port: number,
  portExplicit: boolean,
  host: string,
  options: ServerOptions,
) {
  try {
    return await startServer(source, port, host, options);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "EADDRINUSE" || portExplicit) throw error;

    console.warn(`Port ${port} is in use. Falling back to a free port — pass --port to override.`);
    return await startServer(source, 0, host, options);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const informationalOutput = getCliInformationalOutput(argv);
  if (informationalOutput != null) {
    console.log(informationalOutput);
    return;
  }
  const options = parseCliArgs(argv);
  const requestedRepoPath = realpathSync(resolve(options.repo));
  const repoRoot = resolveRepoRoot(requestedRepoPath);
  const source = createGitDiffSource({
    repoRoot,
    currentDirectory: requestedRepoPath,
    diffArgs: options.diffArgs,
    debug: options.debug,
  });
  const session = source.current();
  const remote = !isLoopbackHost(options.host);
  const server = await startServerWithFallback(
    source,
    options.port,
    options.portExplicit,
    options.host,
    {
      capabilityToken: remote ? randomBytes(24).toString("base64url") : undefined,
      editor: options.editor,
      structural: options.structural,
      watch: options.watch,
      watchInterval: options.watchInterval,
      write: options.write,
    },
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

export function isCliEntrypoint(entryPath: string, modulePath: string): boolean {
  try {
    return realpathSync(resolve(entryPath)) === realpathSync(modulePath);
  } catch {
    return false;
  }
}

if (process.argv[1] != null && isCliEntrypoint(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    const debug = process.argv.includes("--debug") || isDebugEnvironment();
    console.error(formatCliError(error, debug));
    process.exit(1);
  });
}
