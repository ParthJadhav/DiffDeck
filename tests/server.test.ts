import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createDiffSessionStore, startServer, type RunningServer } from "../src/server/server.js";
import { buildDiffSession } from "../src/server/git.js";
import type { DiffSession } from "../src/server/types.js";

function createSession(name: string): DiffSession {
  return {
    snapshotId: `snapshot-${name}`,
    repoRoot: `/repo/${name}`,
    currentDirectory: `/repo/${name}`,
    diffArgs: [],
    files: [
      {
        path: `${name}.txt`,
        diffId: `diff-${name}`,
        changeType: "change",
        gitStatus: "modified",
        additions: 1,
        deletions: 0,
      },
    ],
    fileDiffs: new Map(),
    unresolvedFiles: new Map(),
    rawDiff: name,
  };
}

describe("createDiffSessionStore", () => {
  test("reuses the provided initial session until refresh is requested", () => {
    const initialSession = createSession("initial");
    const refreshedSession = createSession("refreshed");
    let refreshCount = 0;

    const store = createDiffSessionStore({
      initialSession,
      refresh: () => {
        refreshCount += 1;
        return refreshedSession;
      },
    });

    expect(store.current()).toBe(initialSession);
    expect(refreshCount).toBe(0);
    expect(store.current()).toBe(initialSession);
    expect(refreshCount).toBe(0);

    expect(store.refresh()).toBe(refreshedSession);
    expect(refreshCount).toBe(1);
    expect(store.current()).toBe(refreshedSession);
    expect(refreshCount).toBe(1);
  });
});

const servers: RunningServer[] = [];
const repos: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

describe("server capabilities", () => {
  test("requires the configured token for JSON and terminal routes", async () => {
    const server = await startServer(createSession("secure"), 0, "127.0.0.1", {
      capabilityToken: "secret",
    });
    servers.push(server);
    const base = server.url.replace(/\?token=.*/, "").replace(/\/$/, "");
    expect((await fetch(`${base}/api/session`)).status).toBe(401);
    expect((await fetch(`${base}/api/session?token=wrong`)).status).toBe(401);
    expect((await fetch(`${base}/api/session?token=secret`)).status).toBe(200);
    expect(
      (
        await fetch(`${base}/api/review-packet?token=secret`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: 1 }),
        })
      ).status,
    ).toBe(202);
    const download = await fetch(`${base}/api/review-packet/download?token=secret`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        packet: JSON.stringify({ repository: { snapshotId: "snapshot-secure" }, version: 1 }),
      }),
    });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
  });

  test("keeps writes absent by default and rejects stale snapshots in write mode", async () => {
    const repo = createWritableRepo();
    const build = () => buildDiffSession(repo, repo, []);
    const initial = build();
    const readOnly = await startServer(initial, 0, "127.0.0.1");
    servers.push(readOnly);
    expect(
      (
        await fetch(`${readOnly.url}api/write`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    const writable = await startServer(
      { initialSession: initial, refresh: build },
      0,
      "127.0.0.1",
      { write: true },
    );
    servers.push(writable);
    expect(
      (
        await fetch(`${writable.url}api/write`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "stage", path: "a.txt", snapshotId: "stale" }),
        })
      ).status,
    ).toBe(409);
    const success = await fetch(`${writable.url}api/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "stage", path: "a.txt", snapshotId: initial.snapshotId }),
    });
    expect(success.status).toBe(200);
    expect(runGit(repo, ["diff", "--cached", "--name-only"]).trim()).toBe("a.txt");
  });

  test("stages exactly one selected hunk", async () => {
    const repo = createMultiHunkRepo();
    const build = () => buildDiffSession(repo, repo, []);
    const initial = build();
    const writable = await startServer(
      { initialSession: initial, refresh: build },
      0,
      "127.0.0.1",
      { write: true },
    );
    servers.push(writable);
    const response = await fetch(`${writable.url}api/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "stage",
        hunkIndex: 0,
        path: "many.txt",
        snapshotId: initial.snapshotId,
      }),
    });
    expect(response.status).toBe(200);
    expect(runGit(repo, ["diff", "--cached"]).match(/^@@/gm)).toHaveLength(1);
    expect(runGit(repo, ["diff"]).match(/^@@/gm)).toHaveLength(1);
  });

  test("serves only authorized image sides with MIME metadata", async () => {
    const repo = createImageRepo();
    const session = buildDiffSession(repo, repo, []);
    const server = await startServer(session, 0, "127.0.0.1");
    servers.push(server);
    const response = await fetch(`${server.url}api/image?path=logo.png&side=new`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mimeType: "image/png",
      path: "logo.png",
      side: "new",
    });
    expect((await fetch(`${server.url}api/image?path=../secret.png&side=new`)).status).toBe(404);
    expect((await fetch(`${server.url}api/image?path=logo.png&side=invalid`)).status).toBe(400);
  });

  test("reports unavailable structural and editor executables", async () => {
    const repo = createWritableRepo();
    const session = buildDiffSession(repo, repo, []);
    const server = await startServer(session, 0, "127.0.0.1", {
      editor: "definitely-missing-diffdeck-editor",
      structural: true,
      structuralCommand: "definitely-missing-difft",
    });
    servers.push(server);
    expect((await fetch(`${server.url}api/structural?path=a.txt`)).status).toBe(501);
    expect(
      (
        await fetch(`${server.url}api/editor`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: "a.txt" }),
        })
      ).status,
    ).toBe(501);
  });

  test("bounds structural adapter execution and returns successful output", async () => {
    const repo = createWritableRepo();
    const command = join(repo, "fake-difft");
    writeFileSync(command, "#!/bin/sh\necho structural-success\n");
    chmodSync(command, 0o755);
    const session = buildDiffSession(repo, repo, []);
    const successServer = await startServer(session, 0, "127.0.0.1", {
      structural: true,
      structuralCommand: command,
    });
    servers.push(successServer);
    const success = await fetch(`${successServer.url}api/structural?path=a.txt`);
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({ output: "structural-success\n" });

    writeFileSync(command, "#!/bin/sh\nsleep 1\n");
    const timeoutServer = await startServer(session, 0, "127.0.0.1", {
      structural: true,
      structuralCommand: command,
      structuralTimeoutMs: 20,
    });
    servers.push(timeoutServer);
    expect((await fetch(`${timeoutServer.url}api/structural?path=a.txt`)).status).toBe(504);
  });

  test("watch polling rebuilds only after its cheap fingerprint changes", async () => {
    const initial = createSession("watch-initial");
    const refreshed = createSession("watch-refreshed");
    let fingerprint = "one";
    let refreshCount = 0;
    const server = await startServer(
      {
        fingerprint: () => fingerprint,
        initialSession: initial,
        refresh: () => {
          refreshCount += 1;
          return refreshed;
        },
      },
      0,
      "127.0.0.1",
      { watch: true, watchInterval: 20 },
    );
    servers.push(server);
    await Bun.sleep(55);
    expect(refreshCount).toBe(0);
    fingerprint = "two";
    await Bun.sleep(55);
    expect(refreshCount).toBe(1);
  });
});

function createWritableRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "diffdeck-server-"));
  repos.push(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "test@example.com"]);
  runGit(repo, ["config", "user.name", "Test"]);
  writeFileSync(join(repo, "a.txt"), "old\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-qm", "initial"]);
  writeFileSync(join(repo, "a.txt"), "new\n");
  return repo;
}

function createMultiHunkRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "diffdeck-hunks-"));
  repos.push(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "test@example.com"]);
  runGit(repo, ["config", "user.name", "Test"]);
  const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
  writeFileSync(join(repo, "many.txt"), `${lines.join("\n")}\n`);
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-qm", "initial"]);
  lines[1] = "changed near start";
  lines[27] = "changed near end";
  writeFileSync(join(repo, "many.txt"), `${lines.join("\n")}\n`);
  return repo;
}

function createImageRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "diffdeck-image-"));
  repos.push(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "test@example.com"]);
  runGit(repo, ["config", "user.name", "Test"]);
  writeFileSync(join(repo, "logo.png"), Buffer.from([137, 80, 78, 71, 0, 1, 2]));
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-qm", "initial"]);
  writeFileSync(join(repo, "logo.png"), Buffer.from([137, 80, 78, 71, 0, 3, 4]));
  return repo;
}

function runGit(repo: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}
