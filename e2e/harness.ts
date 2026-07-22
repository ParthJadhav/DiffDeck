import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface FixtureRepo {
  cleanup: () => void;
  repo: string;
}

export interface LiveServer {
  baseURL: string;
  output: () => string;
  stop: () => Promise<void>;
}

export function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function writeRepoFile(repo: string, path: string, contents: string): void {
  const absolute = join(repo, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

export function createRepo(
  baseline: Record<string, string>,
  worktree: Record<string, string> = {},
): FixtureRepo {
  const root = mkdtempSync(join(tmpdir(), "diffdeck-e2e-"));
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "e2e@diffdeck.local");
  git(repo, "config", "user.name", "DiffDeck E2E");
  git(repo, "config", "core.autocrlf", "false");
  for (const [path, contents] of Object.entries(baseline)) writeRepoFile(repo, path, contents);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "baseline");
  for (const [path, contents] of Object.entries(worktree)) writeRepoFile(repo, path, contents);
  return { cleanup: () => rmSync(root, { force: true, recursive: true }), repo };
}

export function createConflictRepo(): FixtureRepo {
  const fixture = createRepo({ "conflict.txt": "base\n" });
  const { repo } = fixture;
  git(repo, "checkout", "-qb", "incoming");
  writeRepoFile(repo, "conflict.txt", "incoming\n");
  git(repo, "commit", "-aqm", "incoming");
  git(repo, "checkout", "-q", "main");
  writeRepoFile(repo, "conflict.txt", "current\n");
  git(repo, "commit", "-aqm", "current");
  try {
    git(repo, "merge", "incoming");
  } catch {
    // The unresolved merge is the intended fixture state.
  }
  return fixture;
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address == null || typeof address === "string") {
        probe.close(() => reject(new Error("Could not allocate a port")));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });
}

export async function launchDiffdeck(repo: string, flags: string[] = []): Promise<LiveServer> {
  const cli = join(process.cwd(), "dist/server/cli.js");
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [cli, "--repo", repo, "--host", "127.0.0.1", "--port", String(port), "--no-open", ...flags],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));

  const baseURL = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const response = await fetch(`${baseURL}/api/session`);
      if (response.ok) break;
    } catch {
      // The server is not accepting connections yet.
    }
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error(`DiffDeck server did not become ready on ${baseURL}.\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    baseURL,
    output: () => output,
    stop: async () => {
      child.kill("SIGTERM");
      await exited;
    },
  };
}
