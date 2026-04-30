import type { FileContents, FileDiffMetadata } from "@pierre/diffs/react";
import type { SelectedLineRange } from "@pierre/diffs";
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

export function buildSnippetCompare(fileDiff: FileDiffMetadata): {
  oldFile: FileContents;
  newFile: FileContents;
} {
  const baseKey = fileDiff.cacheKey ?? `cli-diff:${fileDiff.name}`;
  return {
    oldFile: {
      name: fileDiff.prevName ?? fileDiff.name,
      contents: fileDiff.deletionLines.join(""),
      cacheKey: `${baseKey}:old`,
    },
    newFile: {
      name: fileDiff.name,
      contents: fileDiff.additionLines.join(""),
      cacheKey: `${baseKey}:new`,
    },
  };
}

export function getSelectionSummary(selection: SelectedLineRange | null): string {
  if (selection == null) {
    return "No line selection";
  }

  const startSide = selection.side == null ? "" : ` ${selection.side}`;
  const endSide = selection.endSide == null ? startSide : ` ${selection.endSide}`;
  return `${selection.start}${startSide} → ${selection.end}${endSide}`;
}
