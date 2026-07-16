import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createDiffSessionStore,
  normalizeEditorLine,
  startServer,
  type RunningServer,
} from "../src/server/server.js";
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
  test("validates and applies server-owned whitespace preferences", async () => {
    let mode = "normal" as const | "ignore-all";
    const server = await startServer(
      {
        initialSession: createSession("normal"),
        getWhitespaceMode: () => mode,
        refresh: () => createSession(mode),
        setWhitespaceMode: (nextMode) => {
          mode = nextMode === "ignore-all" ? nextMode : "normal";
          return createSession(mode);
        },
      },
      0,
      "127.0.0.1",
    );
    servers.push(server);

    const invalid = await fetch(`${server.url}api/preferences`, {
      body: JSON.stringify({ whitespaceMode: "--ignore-all-space" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalid.status).toBe(400);

    const changed = await fetch(`${server.url}api/preferences`, {
      body: JSON.stringify({ whitespaceMode: "ignore-all" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      preferences: { whitespaceMode: "ignore-all" },
      snapshotId: "snapshot-ignore-all",
    });
    expect(await (await fetch(`${server.url}api/session`)).json()).toMatchObject({
      preferences: { whitespaceMode: "ignore-all" },
    });
  });

  test("reports when a static diff source cannot change whitespace modes", async () => {
    const server = await startServer(createSession("static"), 0, "127.0.0.1");
    servers.push(server);
    const response = await fetch(`${server.url}api/preferences`, {
      body: JSON.stringify({ whitespaceMode: "ignore-all" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(501);
    expect(await response.json()).toEqual({
      error: "This diff source cannot rebuild whitespace modes.",
    });
  });

  test("requires the configured token for JSON and terminal routes", async () => {
    const server = await startServer(createSession("secure"), 0, "127.0.0.1", {
      capabilityToken: "secret",
    });
    servers.push(server);
    const base = server.url.replace(/\?token=.*/, "").replace(/\/$/, "");
    expect((await fetch(`${base}/api/session`)).status).toBe(401);
    expect((await fetch(`${base}/api/session?token=wrong`)).status).toBe(401);
    expect((await fetch(`${base}/api/session?token=secret&token=secret`)).status).toBe(401);
    expect((await fetch(`${base}/api/session?token=secret`)).status).toBe(200);
    expect(
      (
        await fetch(`${base}/api/session`, {
          headers: { authorization: "Bearer secret" },
        })
      ).status,
    ).toBe(200);
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

  test("validates every read and packet route without exposing unauthorized data", async () => {
    const repo = createWritableRepo();
    const session = buildDiffSession(repo, repo, []);
    const server = await startServer(session, 0, "127.0.0.1");
    servers.push(server);

    expect((await fetch(`${server.url}api/file-diff`)).status).toBe(400);
    expect((await fetch(`${server.url}api/file-diff?path=missing.txt`)).status).toBe(404);
    expect((await fetch(`${server.url}api/file-diff?path=a.txt`)).status).toBe(200);
    expect((await fetch(`${server.url}api/unresolved-file`)).status).toBe(400);
    expect((await fetch(`${server.url}api/unresolved-file?path=a.txt`)).status).toBe(404);
    expect((await fetch(`${server.url}api/image?path=a.txt&side=new`)).status).toBe(404);
    expect((await fetch(`${server.url}api/image?path=a.txt&side=elsewhere`)).status).toBe(400);
    expect(
      (
        await fetch(`${server.url}api/editor`, {
          body: JSON.stringify({ path: "a.txt" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      ).status,
    ).toBe(501);
    expect((await fetch(`${server.url}api/structural?path=a.txt`)).status).toBe(403);

    const missingPacket = await fetch(`${server.url}api/review-packet/download`, {
      body: "",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    expect(missingPacket.status).toBe(400);
    const malformedPacket = await fetch(`${server.url}api/review-packet/download`, {
      body: new URLSearchParams({ packet: "not-json" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    expect(malformedPacket.status).toBe(400);
    expect(
      (
        await fetch(`${server.url}api/review-packet`, {
          body: JSON.stringify("not-an-object"),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      ).status,
    ).toBe(400);
    const shell = await fetch(`${server.url}deep/link/route`);
    expect(shell.status).toBe(200);
    expect(shell.headers.get("content-type")).toContain("text/html");
  });

  test("bounds request bodies and reports preference rebuild failures", async () => {
    const server = await startServer(
      {
        initialSession: createSession("preference-error"),
        refresh: () => createSession("preference-error"),
        setWhitespaceMode: () => {
          throw "rebuild failed";
        },
      },
      0,
      "127.0.0.1",
    );
    servers.push(server);
    const failedPreference = await fetch(`${server.url}api/preferences`, {
      body: JSON.stringify({ whitespaceMode: "ignore-all" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(failedPreference.status).toBe(500);
    expect(await failedPreference.json()).toEqual({ error: "rebuild failed" });

    const oversized = await fetch(`${server.url}api/review-packet`, {
      body: JSON.stringify({ value: "x".repeat(1_100_000) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(oversized.status).toBe(413);
  });

  test("rejects editor traversal, symlink escape, and invalid configuration", async () => {
    const repo = createWritableRepo();
    const outside = mkdtempSync(join(tmpdir(), "diffdeck-outside-"));
    repos.push(outside);
    writeFileSync(join(outside, "secret.txt"), "outside\n");
    symlinkSync(join(outside, "secret.txt"), join(repo, "escape.txt"));

    const session = buildDiffSession(repo, repo, []);
    session.files.push({
      additions: 1,
      changeType: "change",
      deletions: 0,
      diffId: "escape",
      gitStatus: "modified",
      path: "escape.txt",
    });
    session.files.push({
      additions: 1,
      changeType: "change",
      deletions: 0,
      diffId: "traversal",
      gitStatus: "modified",
      path: "../secret.txt",
    });
    const server = await startServer(session, 0, "127.0.0.1", { editor: "true" });
    servers.push(server);
    for (const path of ["escape.txt", "../secret.txt"]) {
      const response = await fetch(`${server.url}api/editor`, {
        body: JSON.stringify({ path }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(400);
    }
    expect(
      (
        await fetch(`${server.url}api/editor`, {
          body: JSON.stringify({ path: "not-authorized.txt" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      ).status,
    ).toBe(404);

    const invalidServer = await startServer(session, 0, "127.0.0.1", { editor: "   " });
    servers.push(invalidServer);
    expect(
      (
        await fetch(`${invalidServer.url}api/editor`, {
          body: JSON.stringify({ path: "a.txt" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      ).status,
    ).toBe(500);
  });

  test("keeps writes absent by default and rejects stale snapshots in write mode", async () => {
    const repo = createWritableRepo();
    let buildCount = 0;
    const build = () => {
      buildCount += 1;
      return buildDiffSession(repo, repo, []);
    };
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
    expect(buildCount).toBe(2);
    expect((await fetch(`${writable.url}api/session`)).status).toBe(200);
    expect(buildCount).toBe(2);
    expect(runGit(repo, ["diff", "--cached", "--name-only"]).trim()).toBe("a.txt");
  });

  test("rejects unauthorized write shapes and stale hunk boundaries", async () => {
    const repo = createWritableRepo();
    const build = () => buildDiffSession(repo, repo, []);
    const initial = build();
    const writable = await startServer(
      { initialSession: initial, refresh: build },
      0,
      "127.0.0.1",
      { write: true },
    );
    servers.push(writable);
    for (const payload of [
      { action: "delete", path: "a.txt", snapshotId: initial.snapshotId },
      { action: "stage", path: "missing.txt", snapshotId: initial.snapshotId },
    ]) {
      const response = await fetch(`${writable.url}api/write`, {
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(400);
    }
    for (const hunkIndex of [-1, 1.5, "0", 99]) {
      const response = await fetch(`${writable.url}api/write`, {
        body: JSON.stringify({
          action: "stage",
          hunkIndex,
          path: "a.txt",
          snapshotId: initial.snapshotId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(422);
    }
    const unavailable = await fetch(`${writable.url}api/write`, {
      body: JSON.stringify({
        action: "unstage",
        path: "a.txt",
        snapshotId: initial.snapshotId,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(unavailable.status).toBe(422);
    expect(await unavailable.json()).toEqual({
      error: "Unstage is unavailable in a working-tree review.",
    });
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

  test("reverts cached whole-file changes from both the index and worktree", async () => {
    const repo = createWritableRepo();
    runGit(repo, ["add", "a.txt"]);
    const build = () => buildDiffSession(repo, repo, ["--cached"]);
    const initial = build();
    const writable = await startServer(
      { initialSession: initial, refresh: build },
      0,
      "127.0.0.1",
      { write: true },
    );
    servers.push(writable);

    const sessionResponse = await fetch(`${writable.url}api/session`);
    expect(await sessionResponse.json()).toMatchObject({
      capabilities: { write: true, writeActions: ["unstage", "revert"] },
    });
    const response = await fetch(`${writable.url}api/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "revert",
        path: "a.txt",
        snapshotId: initial.snapshotId,
      }),
    });
    expect(response.status).toBe(200);
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("old\n");
    expect(runGit(repo, ["diff", "--cached"])).toBe("");
    expect(runGit(repo, ["diff"])).toBe("");
  });

  test("reverts exactly one displayed cached hunk from the index and worktree", async () => {
    const repo = createMultiHunkRepo();
    runGit(repo, ["add", "many.txt"]);
    const build = () => buildDiffSession(repo, repo, ["--cached"]);
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
        action: "revert",
        hunkIndex: 0,
        path: "many.txt",
        snapshotId: initial.snapshotId,
      }),
    });
    expect(response.status).toBe(200);
    expect(runGit(repo, ["diff", "--cached"]).match(/^@@/gm)).toHaveLength(1);
    expect(runGit(repo, ["diff"])).toBe("");
    const lines = readFileSync(join(repo, "many.txt"), "utf8").split("\n");
    expect(lines[1]).toBe("line 2");
    expect(lines[27]).toBe("changed near end");
  });

  test("keeps commit and range reviews read-only even when write mode is enabled", async () => {
    const repo = createWritableRepo();
    runGit(repo, ["add", "a.txt"]);
    runGit(repo, ["commit", "-qm", "second"]);
    const initial = buildDiffSession(repo, repo, ["HEAD~1", "HEAD"]);
    const writable = await startServer(initial, 0, "127.0.0.1", { write: true });
    servers.push(writable);

    const sessionResponse = await fetch(`${writable.url}api/session`);
    expect(await sessionResponse.json()).toMatchObject({
      capabilities: { write: false, writeActions: [] },
    });
    const response = await fetch(`${writable.url}api/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "revert",
        path: "a.txt",
        snapshotId: initial.snapshotId,
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "Write actions are unavailable for commit and range diffs.",
    });
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

  test("resolves image blobs from a symmetric revision range", async () => {
    const { repo, before, after } = createImageRangeRepo();
    const session = buildDiffSession(repo, repo, ["HEAD~1...HEAD"]);
    const server = await startServer(session, 0, "127.0.0.1");
    servers.push(server);

    const oldResponse = await fetch(`${server.url}api/image?path=logo.png&side=old`);
    const newResponse = await fetch(`${server.url}api/image?path=logo.png&side=new`);
    expect(oldResponse.status).toBe(200);
    expect(newResponse.status).toBe(200);
    const oldPayload = (await oldResponse.json()) as { data: string };
    const newPayload = (await newResponse.json()) as { data: string };
    expect(Buffer.from(oldPayload.data, "base64")).toEqual(before);
    expect(Buffer.from(newPayload.data, "base64")).toEqual(after);
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

  test("normalizes editor line targets before launch", () => {
    expect(normalizeEditorLine(7.9)).toBe(7);
    expect(normalizeEditorLine(0)).toBe(1);
    expect(normalizeEditorLine(-4)).toBe(1);
    expect(normalizeEditorLine("invalid")).toBe(1);
    expect(normalizeEditorLine(undefined)).toBe(1);
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

  test("watch polling installs an asynchronously prepared session without rebuilding it", async () => {
    const initial = createSession("watch-initial");
    const refreshed = createSession("watch-refreshed");
    let pendingSession: DiffSession | null = null;
    let activePolls = 0;
    let maxActivePolls = 0;
    let pollCount = 0;
    let refreshCount = 0;
    const server = await startServer(
      {
        initialSession: initial,
        poll: async () => {
          pollCount += 1;
          activePolls += 1;
          maxActivePolls = Math.max(maxActivePolls, activePolls);
          await Bun.sleep(30);
          const next = pendingSession;
          pendingSession = null;
          activePolls -= 1;
          return next;
        },
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
    await Bun.sleep(75);
    expect(pollCount).toBeGreaterThan(0);
    expect(maxActivePolls).toBe(1);
    expect(refreshCount).toBe(0);
    pendingSession = refreshed;
    await Bun.sleep(75);
    expect(refreshCount).toBe(0);
    expect(await (await fetch(`${server.url}api/session`)).json()).toMatchObject({
      snapshotId: refreshed.snapshotId,
    });
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

function createImageRangeRepo(): { repo: string; before: Buffer; after: Buffer } {
  const repo = mkdtempSync(join(tmpdir(), "diffdeck-image-range-"));
  repos.push(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "test@example.com"]);
  runGit(repo, ["config", "user.name", "Test"]);
  const before = Buffer.from([137, 80, 78, 71, 0, 10, 11, 12]);
  const after = Buffer.from([137, 80, 78, 71, 0, 20, 21, 22]);
  writeFileSync(join(repo, "logo.png"), before);
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-qm", "initial"]);
  writeFileSync(join(repo, "logo.png"), after);
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-qm", "update image"]);
  return { repo, before, after };
}

function runGit(repo: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}
