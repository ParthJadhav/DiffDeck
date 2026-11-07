/**
 * The HTTP contract between the DiffDeck server and its browser client.
 * The client imports these as types only, so this module must stay free of
 * Node APIs.
 */
import type { FileContents, FileDiffMetadata } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";

export const diffWhitespaceModes = [
  "normal",
  "ignore-eol",
  "ignore-space-change",
  "ignore-all",
  "ignore-blank-lines",
] as const;

export type DiffWhitespaceMode = (typeof diffWhitespaceModes)[number];

export function isDiffWhitespaceMode(value: unknown): value is DiffWhitespaceMode {
  return typeof value === "string" && diffWhitespaceModes.includes(value as DiffWhitespaceMode);
}

export type WriteAction = "stage" | "unstage" | "revert";

export interface DiffFileSummary {
  path: string;
  prevPath?: string;
  diffId: string;
  changeType: FileDiffMetadata["type"];
  gitStatus: GitStatus;
  additions: number;
  deletions: number;
  hasMergeConflicts?: boolean;
  isBinary?: boolean;
}

/** GET /api/session and POST /api/preferences. */
export interface SessionPayload {
  snapshotId: string;
  repoRoot: string;
  currentDirectory: string;
  diffArgs: string[];
  files: DiffFileSummary[];
  preferences?: {
    whitespaceMode: DiffWhitespaceMode;
  };
  capabilities?: {
    editor: boolean;
    structural: boolean;
    watch: boolean;
    write: boolean;
    writeActions?: WriteAction[];
  };
}

/** GET /api/unresolved-file */
export type UnresolvedFilePayload = FileContents;

export type ImageSideName = "old" | "new";

/** GET /api/image */
export interface ImageSidePayload {
  bytes: number;
  data: string;
  mimeType: string;
  path: string;
  side: ImageSideName;
}

/** GET /api/structural */
export interface StructuralPayload {
  output: string;
}

/** POST /api/write */
export interface WriteRequest {
  action: WriteAction;
  hunkIndex?: number;
  path: string;
  snapshotId: string;
}

export interface WriteResult {
  ok: true;
  snapshotId: string;
}

/** Server-sent events on GET /api/events. */
export interface SnapshotEvent {
  snapshotId: string;
  reason: "watch" | "write";
}

/** Body of every non-2xx JSON response. */
export interface ErrorPayload {
  error: string;
}
