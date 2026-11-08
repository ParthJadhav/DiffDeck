import type { FileDiffMetadata } from "@pierre/diffs";
import type { DiffFileSummary, DiffWhitespaceMode } from "./protocol.js";

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
  whitespaceMode?: DiffWhitespaceMode;
}
