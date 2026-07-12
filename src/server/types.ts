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

export interface DiffSession {
  snapshotId: string;
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
  portExplicit: boolean;
  host: string;
  openBrowser: boolean;
  debug: boolean;
  diffArgs: string[];
  editor?: string;
  structural: boolean;
  watch: boolean;
  watchInterval: number;
  write: boolean;
}

export interface DiffBuildOptions {
  debug?: boolean;
  log?: (message: string) => void;
}
