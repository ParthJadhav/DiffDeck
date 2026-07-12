import type { FileDiffMetadata } from "@pierre/diffs";
import type { DiffFileSummary, DiffSession } from "./types.js";

export type DiffSessionSource =
  | DiffSession
  | (() => DiffSession)
  | {
      initialSession: DiffSession;
      onRefresh?: (session: DiffSession) => void;
      poll?: () => Promise<DiffSession | null>;
      refresh: () => DiffSession;
    };

export interface DiffSource {
  current(): DiffSession;
  file(path: string): DiffFileSummary | null;
  fileDiff(path: string): FileDiffMetadata | null;
  replace(next: DiffSession): DiffSession;
  refresh(): DiffSession;
  unresolvedFile(path: string): string | null;
}

export function createDiffSource(sessionSource: DiffSessionSource): DiffSource {
  let session: DiffSession;
  let refreshSession: () => DiffSession;
  let onRefresh: (session: DiffSession) => void = () => undefined;

  if (typeof sessionSource === "function") {
    session = sessionSource();
    refreshSession = sessionSource;
  } else if ("initialSession" in sessionSource) {
    session = sessionSource.initialSession;
    refreshSession = sessionSource.refresh;
    onRefresh = sessionSource.onRefresh ?? onRefresh;
  } else {
    session = sessionSource;
    refreshSession = () => session;
  }

  return {
    current: () => session,
    file: (path) => session.files.find((file) => file.path === path) ?? null,
    fileDiff: (path) => session.fileDiffs.get(path) ?? null,
    replace: (next) => {
      session = next;
      return session;
    },
    refresh: () => {
      session = refreshSession();
      onRefresh(session);
      return session;
    },
    unresolvedFile: (path) => session.unresolvedFiles.get(path) ?? null,
  };
}
