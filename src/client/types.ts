import type { FileDiffMetadata } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";

export type DiffWhitespaceMode =
  | "normal"
  | "ignore-eol"
  | "ignore-space-change"
  | "ignore-all"
  | "ignore-blank-lines";

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
    writeActions?: Array<"stage" | "unstage" | "revert">;
  };
}
