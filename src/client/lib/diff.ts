import type { GitStatusEntry } from "@pierre/trees";
import type { DiffFileSummary } from "../types.js";

export function buildGitStatus(files: DiffFileSummary[]): GitStatusEntry[] {
  return files.map((file) => ({
    path: file.path,
    status: file.gitStatus,
  }));
}

export function buildHeader(diffArgs: string[]): string {
  if (diffArgs.length === 0) {
    return "git diff";
  }
  return `git diff ${diffArgs.join(" ")}`;
}
