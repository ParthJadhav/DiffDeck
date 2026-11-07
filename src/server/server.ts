import express from "express";
import { createServer as createHttpServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { buildCacheKey } from "./cacheKey.js";
import type { DiffSource } from "./diffSource.js";
import {
  isDiffWhitespaceMode,
  type ImageSidePayload,
  type SessionPayload,
  type SnapshotEvent,
  type StructuralPayload,
  type UnresolvedFilePayload,
  type WriteAction,
  type WriteResult,
} from "./protocol.js";
import {
  applyWriteAction,
  getAvailableWriteActions,
  getImageMime,
  readImageSide,
  resolveAuthorizedPath,
} from "./repositoryActions.js";
import type { DiffSession } from "./types.js";

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

export function normalizeEditorLine(value: unknown): number {
  const line = Number(value ?? 1);
  return Number.isFinite(line) ? Math.max(1, Math.floor(line)) : 1;
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

function serializeSession(
  source: DiffSource,
  session: DiffSession,
  options: ServerOptions,
): SessionPayload {
  const writeActions =
    options.write === true ? getAvailableWriteActions(session.diffArgs) : ([] as WriteAction[]);
  return {
    snapshotId: session.snapshotId,
    repoRoot: session.repoRoot,
    currentDirectory: session.currentDirectory,
    diffArgs: session.diffArgs,
    files: session.files,
    preferences: {
      whitespaceMode: source.whitespaceMode(),
    },
    capabilities: {
      editor: options.editor != null,
      structural: options.structural === true,
      watch: options.watch === true,
      write: writeActions.length > 0,
      writeActions,
    },
  };
}

function formatServerError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findFile(session: DiffSession, path: unknown) {
  return typeof path === "string" ? session.files.find((file) => file.path === path) : undefined;
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
  source: DiffSource,
  port: number,
  host: string,
  options: ServerOptions = {},
): Promise<RunningServer> {
  const clientDir = getClientDir();
  const indexHtml = getIndexHtml(clientDir);
  const app = express();
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
    const session = request.query.refresh === "1" ? source.refresh() : source.current();
    response.json(serializeSession(source, session, options));
  });

  app.post("/api/preferences", (request, response) => {
    if (!isDiffWhitespaceMode(request.body?.whitespaceMode)) {
      response.status(400).json({ error: "A valid whitespace mode is required." });
      return;
    }
    try {
      const session = source.setWhitespaceMode(request.body.whitespaceMode);
      response.json(serializeSession(source, session, options));
    } catch (error) {
      response.status(500).json({ error: formatServerError(error) });
    }
  });

  app.get("/api/events", (request, response) => {
    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-cache");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();
    response.write(
      `event: ready\ndata: ${JSON.stringify({ snapshotId: source.current().snapshotId })}\n\n`,
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

    const fileDiff = source.current().fileDiffs.get(path);
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

    const contents = source.current().unresolvedFiles.get(path);
    if (contents == null) {
      response.status(404).json({ error: `No unresolved file found for ${path}.` });
      return;
    }

    response.json({
      name: path,
      contents,
      cacheKey: buildCacheKey("unresolved", path, contents),
    } satisfies UnresolvedFilePayload);
  });

  app.get("/api/image", (request, response) => {
    const path = request.query.path;
    const side = request.query.side;
    if (typeof path !== "string" || (side !== "old" && side !== "new")) {
      response.status(400).json({ error: "A valid path and side are required." });
      return;
    }
    const session = source.current();
    const file = findFile(session, path);
    if (file == null || file.isBinary !== true) {
      response.status(404).json({ error: "No authorized binary diff was found for that path." });
      return;
    }
    const blobPath = side === "old" ? (file.prevPath ?? file.path) : file.path;
    const contents = readImageSide(session, source.whitespaceMode(), blobPath, side);
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
    } satisfies ImageSidePayload);
  });

  app.post("/api/editor", (request, response) => {
    if (options.editor == null) {
      response.status(501).json({ error: "No editor command was configured. Pass --editor." });
      return;
    }
    const path = typeof request.body?.path === "string" ? request.body.path : "";
    const line = normalizeEditorLine(request.body?.line);
    const session = source.current();
    if (findFile(session, path) == null) {
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
    const child = spawn(command, [...configuredArgs, `${target}:${line}`], {
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
    const session = source.current();
    if (typeof path !== "string" || findFile(session, path) == null) {
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
    response.json({ output: result.stdout.slice(0, 512 * 1024) } satisfies StructuralPayload);
  });

  app.post("/api/write", (request, response) => {
    if (options.write !== true) {
      response.status(403).json({ error: "Write mode is disabled. Restart with --write." });
      return;
    }
    const session = source.current();
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
    // A non-watching session can still change on disk after the reviewer
    // opened it. Rebuild immediately before writing so the displayed snapshot
    // cannot authorize staging or discarding newer, unseen contents.
    const freshSession = source.refresh();
    if (snapshotId !== freshSession.snapshotId) {
      response
        .status(409)
        .json({ error: "The diff changed; refresh before applying this action." });
      return;
    }
    if (
      typeof path !== "string" ||
      findFile(freshSession, path) == null ||
      (action !== "stage" && action !== "unstage" && action !== "revert")
    ) {
      response.status(400).json({ error: "Invalid write action or path." });
      return;
    }
    const result = applyWriteAction(freshSession, source.whitespaceMode(), action, path, hunkIndex);
    if (!result.ok) {
      response.status(422).json({ error: result.error });
      return;
    }
    const refreshed = source.refresh();
    notifySnapshot(eventClients, { snapshotId: refreshed.snapshotId, reason: "write" });
    response.json({ ok: true, snapshotId: refreshed.snapshotId } satisfies WriteResult);
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
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const next = await source.poll();
        if (next != null)
          notifySnapshot(eventClients, { snapshotId: next.snapshotId, reason: "watch" });
      } catch (error) {
        notifyClients(eventClients, "error", { message: formatServerError(error) });
      } finally {
        polling = false;
      }
    };
    watchTimer = setInterval(() => void poll(), options.watchInterval ?? 750);
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

function notifySnapshot(clients: ReadonlySet<express.Response>, event: SnapshotEvent): void {
  notifyClients(clients, "snapshot", event);
}
