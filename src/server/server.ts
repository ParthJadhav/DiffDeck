import express from "express";
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { DiffSession } from "./types.js";
import { buildCacheKey } from "./cacheKey.js";
import { createAgentQueue, type AgentType } from "./agentQueue.js";
import { isAgentProviderId, type AgentExecutionMode } from "./agentProviders.js";
import { buildDiffSession } from "./git.js";

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

function getClientDir(): string {
  return fileURLToPath(new URL("../client", import.meta.url));
}

function getIndexHtml(clientDir: string): string {
  return readFileSync(join(clientDir, "index.html"), "utf8");
}

function createAgentRefreshedSession(currentSession: DiffSession): DiffSession {
  return buildDiffSession(
    currentSession.repoRoot,
    currentSession.repoRoot,
    currentSession.diffArgs,
  );
}

export async function startServer(
  session: DiffSession,
  port: number,
  host: string,
): Promise<RunningServer> {
  const clientDir = getClientDir();
  const indexHtml = getIndexHtml(clientDir);
  const app = express();
  app.use(express.json());
  const agentQueue = createAgentQueue({ workingDirectory: session.currentDirectory });

  let currentSession = session;

  app.get("/api/session", (_request, response) => {
    response.json({
      repoRoot: currentSession.repoRoot,
      currentDirectory: currentSession.currentDirectory,
      diffArgs: currentSession.diffArgs,
      files: currentSession.files,
    });
  });

  app.post("/api/session/refresh", (_request, response) => {
    currentSession = {
      ...session,
      ...createAgentRefreshedSession(currentSession),
    };
    response.json({
      repoRoot: currentSession.repoRoot,
      currentDirectory: currentSession.currentDirectory,
      diffArgs: currentSession.diffArgs,
      files: currentSession.files,
    });
  });

  app.get("/api/file-diff", (request, response) => {
    const path = request.query.path;
    if (typeof path !== "string" || path.length === 0) {
      response.status(400).json({ error: "Missing required path query parameter." });
      return;
    }

    const fileDiff = currentSession.fileDiffs.get(path);
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

    const contents = currentSession.unresolvedFiles.get(path);
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

  app.get("/api/agent-queue", (_request, response) => {
    response.json(agentQueue.getSnapshot());
  });

  app.get("/api/agent-queue/stream", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    const unsubscribe = agentQueue.subscribe((snapshot) => {
      response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      response.write(": ping\n\n");
    }, 15_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  });

  app.post("/api/agent-queue/comment", (request, response) => {
    const comment = request.body;
    if (comment == null || typeof comment !== "object") {
      response.status(400).json({ error: "Missing comment payload." });
      return;
    }
    if (typeof comment.id !== "string" || comment.id.length === 0) {
      response.status(400).json({ error: "Comment id is required." });
      return;
    }
    if (typeof comment.body !== "string" || comment.body.trim().length === 0) {
      response.status(400).json({ error: "Comment body is required." });
      return;
    }
    if (typeof comment.filePath !== "string" || comment.filePath.length === 0) {
      response.status(400).json({ error: "Comment filePath is required." });
      return;
    }
    if (
      comment.side !== "additions" &&
      comment.side !== "deletions"
    ) {
      response.status(400).json({ error: "Comment side must be additions or deletions." });
      return;
    }
    if (!Array.isArray(comment.contextLines)) {
      response.status(400).json({ error: "Comment contextLines must be an array." });
      return;
    }

    const item = agentQueue.upsertAndProcess(comment);
    response.status(202).json(item);
  });

  app.delete("/api/agent-queue/comment/:id", (request, response) => {
    const id = request.params.id;
    if (id == null || id.length === 0) {
      response.status(400).json({ error: "Missing id." });
      return;
    }
    agentQueue.remove(id);
    response.status(204).send();
  });

  app.post("/api/agent-queue/clear", (_request, response) => {
    agentQueue.clear();
    response.json(agentQueue.getSnapshot());
  });

  app.post("/api/agent-queue/agent", (request, response) => {
    const nextAgentType = request.body?.agentType;
    if (nextAgentType !== "none" && !isAgentProviderId(nextAgentType)) {
      response.status(400).json({ error: "agentType must be none, opencode, or codex." });
      return;
    }
    agentQueue.setAgentType(nextAgentType as AgentType);
    response.json(agentQueue.getSnapshot());
  });

  app.post("/api/agent-queue/execution-mode", (request, response) => {
    const executionMode = request.body?.executionMode;
    if (executionMode !== "shared_session" && executionMode !== "isolated") {
      response.status(400).json({ error: "executionMode must be shared_session or isolated." });
      return;
    }
    agentQueue.setExecutionMode(executionMode as AgentExecutionMode);
    response.json(agentQueue.getSnapshot());
  });

  app.post("/api/agent-queue/comment/:id/complete", (request, response) => {
    const id = request.params.id;
    if (id == null || id.length === 0) {
      response.status(400).json({ error: "Missing id." });
      return;
    }
    const ok = agentQueue.completeFromCallback(id, {
      error: typeof request.body?.error === "string" ? request.body.error : null,
      response: typeof request.body?.response === "string" ? request.body.response : null,
    });
    if (!ok) {
      response.status(404).json({ error: `Queue item ${id} not found.` });
      return;
    }
    response.json(agentQueue.getSnapshot());
  });

  app.post("/api/agent-queue/comment/:id/cancel", (request, response) => {
    const id = request.params.id;
    if (id == null || id.length === 0) {
      response.status(400).json({ error: "Missing id." });
      return;
    }
    const ok = agentQueue.cancel(id);
    if (!ok) {
      response.status(409).json({ error: `Unable to cancel queue item ${id}.` });
      return;
    }
    response.json(agentQueue.getSnapshot());
  });

  app.post("/api/agent-queue/pause", (_request, response) => {
    agentQueue.setPaused(true);
    response.json(agentQueue.getSnapshot());
  });

  app.post("/api/agent-queue/resume", (_request, response) => {
    agentQueue.setPaused(false);
    response.json(agentQueue.getSnapshot());
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

  const publicHost = host === "0.0.0.0" ? "127.0.0.1" : address.address;
  const baseUrl = `http://${publicHost}:${(address as AddressInfo).port}`;
  agentQueue.setCallbackBaseUrl(baseUrl);

  return {
    url: baseUrl,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
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
