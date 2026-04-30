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

export interface DiffSession {
  repoRoot: string;
  currentDirectory: string;
  diffArgs: string[];
  files: DiffFileSummary[];
  fileDiffs: Map<string, FileDiffMetadata>;
  unresolvedFiles: Map<string, string>;
  rawDiff: string;
}

export interface CliOptions {
  repo: string;
  port: number;
  host: string;
  openBrowser: boolean;
  diffArgs: string[];
}
