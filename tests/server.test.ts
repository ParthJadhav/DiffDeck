import { describe, expect, test } from "bun:test";
import { createDiffSessionStore } from "../src/server/server.js";
import type { DiffSession } from "../src/server/types.js";

function createSession(name: string): DiffSession {
  return {
    repoRoot: `/repo/${name}`,
    currentDirectory: `/repo/${name}`,
    diffArgs: [],
    files: [
      {
        path: `${name}.txt`,
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
