import type { FileDiffMetadata } from "@pierre/diffs";
import type { DiffFileSummary, DiffSession } from "./types.js";
import type { DiffWhitespaceMode } from "./whitespace.js";

export type DiffSessionSource =
  | DiffSession
  | (() => DiffSession)
  | {
      initialSession: DiffSession;
      getWhitespaceMode?: () => DiffWhitespaceMode;
      onRefresh?: (session: DiffSession) => void;
      poll?: () => Promise<DiffSession | null>;
      refresh: () => DiffSession;
      setWhitespaceMode?: (mode: DiffWhitespaceMode) => DiffSession;
    };

export interface DiffSource {
  current(): DiffSession;
  file(path: string): DiffFileSummary | null;
  fileDiff(path: string): FileDiffMetadata | null;
  getWhitespaceMode(): DiffWhitespaceMode;
  replace(next: DiffSession): DiffSession;
  refresh(): DiffSession;
  setWhitespaceMode(mode: DiffWhitespaceMode): DiffSession | null;
  unresolvedFile(path: string): string | null;
}

export function createDiffSource(sessionSource: DiffSessionSource): DiffSource {
  let session: DiffSession;
  let refreshSession: () => DiffSession;
  let getWhitespaceMode: () => DiffWhitespaceMode = () => "normal";
  let setWhitespaceMode: ((mode: DiffWhitespaceMode) => DiffSession) | undefined;
  let onRefresh: (session: DiffSession) => void = () => undefined;

  if (typeof sessionSource === "function") {
    session = sessionSource();
    refreshSession = sessionSource;
  } else if ("initialSession" in sessionSource) {
    session = sessionSource.initialSession;
    refreshSession = sessionSource.refresh;
    getWhitespaceMode = sessionSource.getWhitespaceMode ?? getWhitespaceMode;
    setWhitespaceMode = sessionSource.setWhitespaceMode;
    onRefresh = sessionSource.onRefresh ?? onRefresh;
  } else {
    session = sessionSource;
    refreshSession = () => session;
  }

  return {
    current: () => session,
    file: (path) => session.files.find((file) => file.path === path) ?? null,
    fileDiff: (path) => session.fileDiffs.get(path) ?? null,
    getWhitespaceMode,
    replace: (next) => {
      session = next;
      return session;
    },
    refresh: () => {
      session = refreshSession();
      onRefresh(session);
      return session;
    },
    setWhitespaceMode: (mode) => {
      if (setWhitespaceMode == null) return null;
      session = setWhitespaceMode(mode);
      onRefresh(session);
      return session;
    },
    unresolvedFile: (path) => session.unresolvedFiles.get(path) ?? null,
  };
}
