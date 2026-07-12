import type { FileDiffMetadata } from "@pierre/diffs";
import type { DiffFileSummary, DiffSession } from "./types.js";

export type DiffSessionSource =
  | DiffSession
  | (() => DiffSession)
  | {
      fingerprint?: () => string;
      initialSession: DiffSession;
      refresh: () => DiffSession;
    };

export interface DiffSource {
  current(): DiffSession;
  file(path: string): DiffFileSummary | null;
  fileDiff(path: string): FileDiffMetadata | null;
  refresh(): DiffSession;
  unresolvedFile(path: string): string | null;
}

export function createDiffSource(sessionSource: DiffSessionSource): DiffSource {
  let session: DiffSession;
  let refreshSession: () => DiffSession;

  if (typeof sessionSource === "function") {
    session = sessionSource();
    refreshSession = sessionSource;
  } else if ("initialSession" in sessionSource) {
    session = sessionSource.initialSession;
    refreshSession = sessionSource.refresh;
  } else {
    session = sessionSource;
    refreshSession = () => session;
  }

  return {
    current: () => session,
    file: (path) => session.files.find((file) => file.path === path) ?? null,
    fileDiff: (path) => session.fileDiffs.get(path) ?? null,
    refresh: () => {
      session = refreshSession();
      return session;
    },
    unresolvedFile: (path) => session.unresolvedFiles.get(path) ?? null,
  };
}
