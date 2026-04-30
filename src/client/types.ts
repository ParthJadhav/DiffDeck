import type { FileDiffMetadata } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";

export interface DiffFileSummary {
  path: string;
  prevPath?: string;
  changeType: FileDiffMetadata["type"];
  gitStatus: GitStatus;
  additions: number;
  deletions: number;
  hasMergeConflicts?: boolean;
}

export interface SessionPayload {
  repoRoot: string;
  currentDirectory: string;
  diffArgs: string[];
  rawDiffAvailable: boolean;
  files: DiffFileSummary[];
}
