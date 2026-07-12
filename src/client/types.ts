import type { FileDiffMetadata } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";

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
  capabilities?: {
    editor: boolean;
    structural: boolean;
    watch: boolean;
    write: boolean;
  };
}
