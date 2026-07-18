#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import open from "open";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiffSessionFromRawDiff,
  getRawDiff,
  getRawDiffAsync,
  resolveRepoRoot,
} from "./git.js";
import { startServer, type DiffSessionSource } from "./server.js";
import type { CliOptions } from "./types.js";
import { formatCliError } from "./errors.js";
import { withWhitespaceMode, type DiffWhitespaceMode } from "./whitespace.js";
import { getCliInformationalOutput, parseCliArgs } from "./cliOptions.js";

export { parseCliArgs } from "./cliOptions.js";

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
  const argv = process.argv.slice(2);
  const informationalOutput = getCliInformationalOutput(argv);
  if (informationalOutput != null) {
    console.log(informationalOutput);
    return;
  }
  const options = parseCliArgs(argv);
  const requestedRepoPath = realpathSync(resolve(options.repo));
  const repoRoot = resolveRepoRoot(requestedRepoPath);
  let whitespaceMode: DiffWhitespaceMode = "normal";
  const buildSessionForMode = (mode: DiffWhitespaceMode) =>
    buildDiffSessionFromRawDiff(
      repoRoot,
      requestedRepoPath,
      options.diffArgs,
      getRawDiff(repoRoot, withWhitespaceMode(options.diffArgs, mode)),
      {
        debug: options.debug,
      },
    );
  const buildSession = () => buildSessionForMode(whitespaceMode);
  const session = buildSession();
  let watchFingerprint = createHash("sha256").update(session.rawDiff).digest("hex");
  const poll = async () => {
    const rawDiff = await getRawDiffAsync(
      repoRoot,
      withWhitespaceMode(options.diffArgs, whitespaceMode),
    );
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
      getWhitespaceMode: () => whitespaceMode,
      onRefresh: (nextSession) => {
        watchFingerprint = createHash("sha256").update(nextSession.rawDiff).digest("hex");
      },
      poll,
      refresh: buildSession,
      setWhitespaceMode: (nextMode) => {
        const nextSession = buildSessionForMode(nextMode);
        whitespaceMode = nextMode;
        return nextSession;
      },
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

export function isCliEntrypoint(entryPath: string, modulePath: string): boolean {
  try {
    return realpathSync(resolve(entryPath)) === realpathSync(modulePath);
  } catch {
    return false;
  }
}

if (process.argv[1] != null && isCliEntrypoint(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    const debug =
      process.argv.includes("--debug") ||
      process.env.DIFFDECK_DEBUG === "1" ||
      process.env.DIFFDECK_DEBUG === "true";
    console.error(formatCliError(error, debug));
    process.exit(1);
  });
}
