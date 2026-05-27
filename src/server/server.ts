import express from "express";
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { DiffSession } from "./types.js";
import { buildCacheKey } from "./cacheKey.js";

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

export type DiffSessionSource =
  | DiffSession
  | (() => DiffSession)
  | {
      initialSession: DiffSession;
      refresh: () => DiffSession;
    };

export function createDiffSessionStore(sessionSource: DiffSessionSource): {
  current: () => DiffSession;
  refresh: () => DiffSession;
} {
  let session: DiffSession;
  let refresh: () => DiffSession;

  if (typeof sessionSource === "function") {
    session = sessionSource();
    refresh = sessionSource;
  } else if ("initialSession" in sessionSource) {
    session = sessionSource.initialSession;
    refresh = sessionSource.refresh;
  } else {
    session = sessionSource;
    refresh = () => session;
  }

  return {
    current: () => session,
    refresh: () => {
      session = refresh();
      return session;
    },
  };
}

function getClientDir(): string {
  return fileURLToPath(new URL("../client", import.meta.url));
}

function getIndexHtml(clientDir: string): string {
  return readFileSync(join(clientDir, "index.html"), "utf8");
}

export async function startServer(
  sessionSource: DiffSessionSource,
  port: number,
  host: string,
): Promise<RunningServer> {
  const clientDir = getClientDir();
  const indexHtml = getIndexHtml(clientDir);
  const app = express();
  const sessionStore = createDiffSessionStore(sessionSource);

  app.get("/api/session", (request, response) => {
    const session = request.query.refresh === "1" ? sessionStore.refresh() : sessionStore.current();
    response.json({
      repoRoot: session.repoRoot,
      currentDirectory: session.currentDirectory,
      diffArgs: session.diffArgs,
      files: session.files,
    });
  });

  app.get("/api/file-diff", (request, response) => {
    const path = request.query.path;
    if (typeof path !== "string" || path.length === 0) {
      response.status(400).json({ error: "Missing required path query parameter." });
      return;
    }

    const fileDiff = sessionStore.current().fileDiffs.get(path);
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

    const contents = sessionStore.current().unresolvedFiles.get(path);
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

  return {
    url: `http://${publicHost}:${(address as AddressInfo).port}`,
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
