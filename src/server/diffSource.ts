import { buildDiffSessionFromRawDiff, getRawDiff, getRawDiffAsync } from "./git.js";
import type { DiffWhitespaceMode } from "./protocol.js";
import type { DiffSession } from "./types.js";

/**
 * The diff under review and how to rebuild it. Every rebuild that becomes
 * current supersedes any poll that started before it, so a slow background
 * read can never replace a newer write, refresh, or whitespace change.
 */
export interface DiffSource {
  current(): DiffSession;
  whitespaceMode(): DiffWhitespaceMode;
  refresh(): DiffSession;
  setWhitespaceMode(mode: DiffWhitespaceMode): DiffSession;
  /** Resolves to the new current session when the repository's diff changed, else null. */
  poll(): Promise<DiffSession | null>;
}

export interface GitDiffSourceOptions {
  repoRoot: string;
  currentDirectory: string;
  diffArgs: string[];
  debug: boolean;
}

export function createGitDiffSource({
  repoRoot,
  currentDirectory,
  diffArgs,
  debug,
}: GitDiffSourceOptions): DiffSource {
  let whitespaceMode: DiffWhitespaceMode = "normal";
  let generation = 0;
  const build = (rawDiff: string) =>
    buildDiffSessionFromRawDiff(repoRoot, currentDirectory, diffArgs, rawDiff, { debug });
  let session = build(getRawDiff(repoRoot, diffArgs, whitespaceMode));
  const install = (next: DiffSession) => {
    generation += 1;
    session = next;
    return next;
  };

  return {
    current: () => session,
    whitespaceMode: () => whitespaceMode,
    refresh: () => install(build(getRawDiff(repoRoot, diffArgs, whitespaceMode))),
    setWhitespaceMode: (mode) => {
      const next = build(getRawDiff(repoRoot, diffArgs, mode));
      whitespaceMode = mode;
      return install(next);
    },
    poll: async () => {
      const started = generation;
      const rawDiff = await getRawDiffAsync(repoRoot, diffArgs, whitespaceMode);
      if (generation !== started || rawDiff === session.rawDiff) return null;
      const previousSnapshotId = session.snapshotId;
      const next = install(build(rawDiff));
      return next.snapshotId === previousSnapshotId ? null : next;
    },
  };
}
