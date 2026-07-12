import express from "express";
import { createServer as createHttpServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extname, join, resolve as resolvePath } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import type { DiffSession } from "./types.js";
import { buildCacheKey } from "./cacheKey.js";
import { createDiffSource, type DiffSessionSource, type DiffSource } from "./diffSource.js";

export type { DiffSessionSource } from "./diffSource.js";

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

export interface ServerOptions {
  capabilityToken?: string;
  editor?: string;
  structural?: boolean;
  structuralCommand?: string;
  structuralTimeoutMs?: number;
  watch?: boolean;
  watchInterval?: number;
  write?: boolean;
}

type WriteAction = "stage" | "unstage" | "revert";
type WriteDiffMode = "worktree" | "cached" | "readonly";

export function createDiffSessionStore(sessionSource: DiffSessionSource): DiffSource {
  return createDiffSource(sessionSource);
}

function getClientDir(): string {
  return fileURLToPath(new URL("../client", import.meta.url));
}

function getIndexHtml(clientDir: string): string {
  const path = join(clientDir, "index.html");
  return existsSync(path)
    ? readFileSync(path, "utf8")
    : "<!doctype html><html><body><main>DiffDeck client is not built.</main></body></html>";
}

export async function startServer(
  sessionSource: DiffSessionSource,
  port: number,
  host: string,
  options: ServerOptions = {},
): Promise<RunningServer> {
  const clientDir = getClientDir();
  const indexHtml = getIndexHtml(clientDir);
  const app = express();
  const sessionStore = createDiffSessionStore(sessionSource);
  const eventClients = new Set<express.Response>();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use("/api", (request, response, next) => {
    if (options.capabilityToken == null) {
      next();
      return;
    }
    const supplied =
      request.query.token ?? request.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (supplied !== options.capabilityToken) {
      response.status(401).json({ error: "A valid DiffDeck capability token is required." });
      return;
    }
    next();
  });

  app.get("/api/session", (request, response) => {
    const session = request.query.refresh === "1" ? sessionStore.refresh() : sessionStore.current();
    const writeActions =
      options.write === true ? getAvailableWriteActions(session.diffArgs) : ([] as WriteAction[]);
    response.json({
      snapshotId: session.snapshotId,
      repoRoot: session.repoRoot,
      currentDirectory: session.currentDirectory,
      diffArgs: session.diffArgs,
      files: session.files,
      capabilities: {
        editor: options.editor != null,
        structural: options.structural === true,
        watch: options.watch === true,
        write: writeActions.length > 0,
        writeActions,
      },
    });
  });

  app.get("/api/events", (request, response) => {
    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-cache");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();
    response.write(
      `event: ready\ndata: ${JSON.stringify({ snapshotId: sessionStore.current().snapshotId })}\n\n`,
    );
    eventClients.add(response);
    request.on("close", () => eventClients.delete(response));
  });

  app.post("/api/review-packet", (request, response) => {
    if (request.body == null || typeof request.body !== "object") {
      response.status(400).json({ error: "A JSON review packet is required." });
      return;
    }
    console.log("\n----- DIFFDECK REVIEW PACKET BEGIN -----");
    console.log(JSON.stringify(request.body, null, 2));
    console.log("----- DIFFDECK REVIEW PACKET END -----\n");
    response.status(202).json({ accepted: true });
  });

  app.post("/api/review-packet/download", (request, response) => {
    if (typeof request.body?.packet !== "string") {
      response.status(400).json({ error: "A serialized review packet is required." });
      return;
    }
    try {
      const packet = JSON.parse(request.body.packet) as { repository?: { snapshotId?: string } };
      const snapshot = packet.repository?.snapshotId?.replace(/[^a-z0-9_-]/gi, "").slice(-16);
      response
        .attachment(`diffdeck-review-${snapshot || "packet"}.json`)
        .type("application/json")
        .send(`${JSON.stringify(packet, null, 2)}\n`);
    } catch {
      response.status(400).json({ error: "The review packet is not valid JSON." });
    }
  });

  app.get("/api/file-diff", (request, response) => {
    const path = request.query.path;
    if (typeof path !== "string" || path.length === 0) {
      response.status(400).json({ error: "Missing required path query parameter." });
      return;
    }

    const fileDiff = sessionStore.fileDiff(path);
    if (fileDiff == null) {
      response.status(404).json({ error: `No diff found for ${path}.` });
      return;
    }

    response.json(fileDiff);
  });

  app.get("/api/unresolved-file", (request, response) => {
    const path = request.query.path;
    if (typeof path !== "string" || path.length === 0) {
      response.status(400).json({ error: "Missing required path query parameter." });
      return;
    }

    const contents = sessionStore.unresolvedFile(path);
    if (contents == null) {
      response.status(404).json({ error: `No unresolved file found for ${path}.` });
      return;
    }

    response.json({
      name: path,
      contents,
      cacheKey: buildCacheKey("unresolved", path, contents),
    });
  });

  app.get("/api/image", (request, response) => {
    const path = request.query.path;
    const side = request.query.side;
    if (typeof path !== "string" || (side !== "old" && side !== "new")) {
      response.status(400).json({ error: "A valid path and side are required." });
      return;
    }
    const session = sessionStore.current();
    const file = sessionStore.file(path);
    if (file == null || file.isBinary !== true) {
      response.status(404).json({ error: "No authorized binary diff was found for that path." });
      return;
    }
    const blobPath = side === "old" ? (file.prevPath ?? file.path) : file.path;
    const contents = readImageSide(session, blobPath, side);
    if (contents == null) {
      response.status(404).json({ error: `${side} image side is unavailable.` });
      return;
    }
    response.json({
      bytes: contents.byteLength,
      data: contents.toString("base64"),
      mimeType: getImageMime(path),
      path,
      side,
    });
  });

  app.post("/api/editor", (request, response) => {
    if (options.editor == null) {
      response.status(501).json({ error: "No editor command was configured. Pass --editor." });
      return;
    }
    const path = typeof request.body?.path === "string" ? request.body.path : "";
    const line = Number(request.body?.line ?? 1);
    const session = sessionStore.current();
    if (sessionStore.file(path) == null) {
      response.status(404).json({ error: "The requested diff path is not authorized." });
      return;
    }
    const target = resolveAuthorizedPath(session.repoRoot, path);
    if (target == null) {
      response.status(400).json({ error: "Invalid repository path." });
      return;
    }
    const [command, ...configuredArgs] = options.editor.trim().split(/\s+/);
    if (command == null || command.length === 0) {
      response.status(500).json({ error: "The configured editor command is invalid." });
      return;
    }
    const commandAvailable = command.includes("/")
      ? existsSync(command)
      : spawnSync("which", [command], { encoding: "utf8" }).status === 0;
    if (!commandAvailable) {
      response.status(501).json({ error: `Editor command not found: ${command}` });
      return;
    }
    const child = spawn(command, [...configuredArgs, `${target}:${Math.max(1, line)}`], {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", () => undefined);
    child.unref();
    response.status(202).json({ accepted: true });
  });

  app.get("/api/structural", (request, response) => {
    if (options.structural !== true) {
      response.status(403).json({ error: "Structural diff mode is disabled." });
      return;
    }
    const path = request.query.path;
    const session = sessionStore.current();
    if (typeof path !== "string" || sessionStore.file(path) == null) {
      response.status(404).json({ error: "The requested diff path is not authorized." });
      return;
    }
    const fileDiff = session.fileDiffs.get(path);
    if (fileDiff == null) {
      response.status(404).json({ error: "No text diff is available for structural comparison." });
      return;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), "diffdeck-structure-"));
    const extension = extname(path);
    const oldPath = join(tempDirectory, `before${extension}`);
    const newPath = join(tempDirectory, `after${extension}`);
    writeFileSync(oldPath, fileDiff.deletionLines.join(""));
    writeFileSync(newPath, fileDiff.additionLines.join(""));
    const result = spawnSync(
      options.structuralCommand ?? "difft",
      ["--color", "never", "--display", "inline", "--", oldPath, newPath],
      {
        encoding: "utf8",
        timeout: options.structuralTimeoutMs ?? 5_000,
        maxBuffer: 512 * 1024,
      },
    );
    rmSync(tempDirectory, { force: true, recursive: true });
    if (result.error != null && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
      response.status(501).json({ error: "Difftastic is not installed or not on PATH." });
      return;
    }
    if (result.error != null || result.signal === "SIGTERM") {
      response.status(504).json({ error: "Structural diff timed out or failed." });
      return;
    }
    response.json({ output: result.stdout.slice(0, 512 * 1024) });
  });

  app.post("/api/write", (request, response) => {
    if (options.write !== true) {
      response.status(403).json({ error: "Write mode is disabled. Restart with --write." });
      return;
    }
    const session = sessionStore.current();
    const action = request.body?.action;
    const path = request.body?.path;
    const snapshotId = request.body?.snapshotId;
    const hunkIndex = request.body?.hunkIndex;
    if (snapshotId !== session.snapshotId) {
      response
        .status(409)
        .json({ error: "The diff changed; refresh before applying this action." });
      return;
    }
    if (
      typeof path !== "string" ||
      sessionStore.file(path) == null ||
      (action !== "stage" && action !== "unstage" && action !== "revert")
    ) {
      response.status(400).json({ error: "Invalid write action or path." });
      return;
    }
    const result = applyWriteAction(session, action, path, hunkIndex);
    if (!result.ok) {
      response.status(422).json({ error: result.error });
      return;
    }
    const refreshed = sessionStore.refresh();
    notifyClients(eventClients, "snapshot", { snapshotId: refreshed.snapshotId, reason: "write" });
    response.json({ ok: true, snapshotId: refreshed.snapshotId });
  });

  app.use(express.static(clientDir));

  app.get("/{*any}", (_request, response) => {
    response.type("html").send(indexHtml);
  });

  const server = createHttpServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("Unable to determine bound server address.");
  }

  const rawPublicHost = host === "0.0.0.0" ? "127.0.0.1" : address.address;
  const publicHost = rawPublicHost.includes(":") ? `[${rawPublicHost}]` : rawPublicHost;
  const tokenQuery = options.capabilityToken == null ? "" : `?token=${options.capabilityToken}`;

  let watchTimer: ReturnType<typeof setInterval> | undefined;
  if (options.watch === true) {
    let lastSnapshotId = sessionStore.current().snapshotId;
    let lastFingerprint =
      typeof sessionSource === "object" &&
      "initialSession" in sessionSource &&
      sessionSource.fingerprint != null
        ? sessionSource.fingerprint()
        : lastSnapshotId;
    watchTimer = setInterval(() => {
      try {
        if (
          typeof sessionSource === "object" &&
          "initialSession" in sessionSource &&
          sessionSource.fingerprint != null
        ) {
          const nextFingerprint = sessionSource.fingerprint();
          if (nextFingerprint === lastFingerprint) return;
          lastFingerprint = nextFingerprint;
        }
        const next = sessionStore.refresh();
        if (next.snapshotId !== lastSnapshotId) {
          lastSnapshotId = next.snapshotId;
          notifyClients(eventClients, "snapshot", { snapshotId: next.snapshotId, reason: "watch" });
        }
      } catch (error) {
        notifyClients(eventClients, "error", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }, options.watchInterval ?? 750);
    watchTimer.unref();
  }

  return {
    url: `http://${publicHost}:${(address as AddressInfo).port}/${tokenQuery}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        if (watchTimer != null) clearInterval(watchTimer);
        for (const client of eventClients) client.end();
        server.close((error) => {
          if (error != null) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

function notifyClients(
  clients: ReadonlySet<express.Response>,
  event: string,
  payload: unknown,
): void {
  for (const client of clients) {
    client.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}

function resolveAuthorizedPath(repoRoot: string, path: string): string | null {
  const root = resolvePath(repoRoot);
  const target = resolvePath(root, path);
  return target === root || target.startsWith(`${root}/`) ? target : null;
}

function readImageSide(session: DiffSession, path: string, side: "old" | "new"): Buffer | null {
  const diff = buildDisplayedFileDiff(session, path);
  if (!diff.ok) return null;

  const indexLine = diff.stdout.match(/^index\s+([0-9a-f]+)\.\.([0-9a-f]+)(?:\s|$)/im);
  const objectId = side === "old" ? indexLine?.[1] : indexLine?.[2];
  if (objectId == null) return null;

  if (/^0+$/.test(objectId)) {
    if (side === "old") return null;
    const target = resolveAuthorizedPath(session.repoRoot, path);
    return target != null && existsSync(target) ? readFileSync(target) : null;
  }

  const result = spawnSync("git", ["-C", session.repoRoot, "cat-file", "blob", objectId], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status === 0 && Buffer.isBuffer(result.stdout)) return result.stdout;
  if (side === "old") return null;

  // Binary patches include a computed object ID for worktree content even
  // though that blob is not necessarily present in the object database.
  const target = resolveAuthorizedPath(session.repoRoot, path);
  return target != null && existsSync(target) ? readFileSync(target) : null;
}

function getDisplayedDiffArguments(diffArgs: readonly string[], path: string): string[] {
  const separator = diffArgs.indexOf("--");
  const diffOptions = separator === -1 ? diffArgs : diffArgs.slice(0, separator);
  return [...diffOptions, "--", path];
}

function buildDisplayedFileDiff(
  session: DiffSession,
  path: string,
): { ok: true; stdout: string } | { ok: false; error: string } {
  const result = spawnSync(
    "git",
    [
      "-C",
      session.repoRoot,
      "-c",
      "core.quotePath=false",
      "diff",
      "--find-renames",
      "--submodule=diff",
      "--binary",
      "--no-color",
      "--no-ext-diff",
      ...getDisplayedDiffArguments(session.diffArgs, path),
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  return result.status === 0
    ? { ok: true, stdout: typeof result.stdout === "string" ? result.stdout : "" }
    : { ok: false, error: result.stderr || "Unable to build the displayed file diff." };
}

function getImageMime(path: string): string {
  const mimeByExtension: Record<string, string> = {
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  return mimeByExtension[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function applyWriteAction(
  session: DiffSession,
  action: WriteAction,
  path: string,
  hunkIndex: unknown,
): { ok: true } | { ok: false; error: string } {
  const mode = getWriteDiffMode(session.diffArgs);
  if (!getAvailableWriteActions(session.diffArgs).includes(action)) {
    return {
      ok: false,
      error:
        mode === "readonly"
          ? "Write actions are unavailable for commit and range diffs."
          : `${capitalize(action)} is unavailable in ${mode === "cached" ? "a cached" : "a working-tree"} review.`,
    };
  }

  const hasHunkIndex = hunkIndex !== undefined;
  if (
    hasHunkIndex &&
    (typeof hunkIndex !== "number" || !Number.isInteger(hunkIndex) || hunkIndex < 0)
  ) {
    return { ok: false, error: "The requested hunk index is invalid." };
  }

  if (typeof hunkIndex === "number") {
    const diff = buildDisplayedFileDiff(session, path);
    if (!diff.ok) return { ok: false, error: diff.error };
    const patch = selectHunkPatch(diff.stdout, hunkIndex);
    if (patch == null) return { ok: false, error: "The requested hunk no longer exists." };
    const applyArgs = ["-C", session.repoRoot, "apply"];
    if (mode === "worktree" && action === "stage") applyArgs.push("--cached");
    if (mode === "cached" && action === "unstage") applyArgs.push("--cached", "--reverse");
    if (mode === "cached" && action === "revert") applyArgs.push("--index", "--reverse");
    if (mode === "worktree" && action === "revert") applyArgs.push("--reverse");
    const applied = spawnSync("git", applyArgs, { input: patch, encoding: "utf8" });
    return applied.status === 0
      ? { ok: true }
      : { ok: false, error: applied.stderr || "Git rejected the selected hunk." };
  }
  const args =
    action === "stage"
      ? ["add", "--", path]
      : action === "unstage"
        ? ["restore", "--staged", "--", path]
        : mode === "cached"
          ? ["restore", "--source=HEAD", "--staged", "--worktree", "--", path]
          : ["restore", "--worktree", "--", path];
  const result = spawnSync("git", ["-C", session.repoRoot, ...args], {
    encoding: "utf8",
  });
  return result.status === 0
    ? { ok: true }
    : { ok: false, error: result.stderr || `Unable to ${action} ${path}.` };
}

function getAvailableWriteActions(diffArgs: readonly string[]): WriteAction[] {
  const mode = getWriteDiffMode(diffArgs);
  if (mode === "worktree") return ["stage", "revert"];
  if (mode === "cached") return ["unstage", "revert"];
  return [];
}

function getWriteDiffMode(diffArgs: readonly string[]): WriteDiffMode {
  const separator = diffArgs.indexOf("--");
  const diffOptions = separator === -1 ? diffArgs : diffArgs.slice(0, separator);
  const positional = diffOptions.filter((argument) => !argument.startsWith("-"));
  const incompatible = diffOptions.some(
    (argument) =>
      argument === "-R" ||
      argument === "--reverse" ||
      argument === "--no-index" ||
      argument === "--merge-base" ||
      argument === "--output" ||
      argument.startsWith("--output="),
  );
  if (positional.length > 0 || incompatible) return "readonly";
  return diffOptions.includes("--cached") || diffOptions.includes("--staged")
    ? "cached"
    : "worktree";
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

function selectHunkPatch(diff: string, hunkIndex: number): string | null {
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  const firstHunk = lines.findIndex((line) => line.startsWith("@@"));
  if (firstHunk === -1) return null;
  const starts = lines.flatMap((line, index) => (line.startsWith("@@") ? [index] : []));
  const start = starts[hunkIndex];
  if (start == null) return null;
  const end = starts[hunkIndex + 1] ?? lines.length;
  return `${[...lines.slice(0, firstHunk), ...lines.slice(start, end)].join("\n")}\n`;
}
