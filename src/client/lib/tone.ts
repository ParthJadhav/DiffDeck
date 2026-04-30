import type { FileDiffMetadata } from "@pierre/diffs/react";
import type { DiffFileSummary } from "../types.js";

export type Tone =
  | "added"
  | "deleted"
  | "renamed"
  | "modified"
  | "untracked"
  | "muted";

export function getGitStatusTone(status: DiffFileSummary["gitStatus"]): Tone {
  switch (status) {
    case "added":
      return "added";
    case "deleted":
      return "deleted";
    case "renamed":
      return "renamed";
    case "modified":
      return "modified";
    case "untracked":
      return "untracked";
    default:
      return "muted";
  }
}

export function getChangeTypeTone(type: FileDiffMetadata["type"]): Tone {
  switch (type) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    default:
      return "modified";
  }
}

const toneTextClasses: Record<Tone, string> = {
  added: "text-diff-added",
  deleted: "text-diff-deleted",
  renamed: "text-diff-renamed",
  modified: "text-diff-modified",
  untracked: "text-diff-modified",
  muted: "text-muted-foreground",
};

export function toneTextClass(tone: Tone): string {
  return toneTextClasses[tone];
}

const toneBadgeVariants: Record<Tone, "default" | "secondary" | "destructive" | "outline"> = {
  added: "outline",
  deleted: "destructive",
  renamed: "outline",
  modified: "secondary",
  untracked: "secondary",
  muted: "outline",
};

export function toneBadgeVariant(tone: Tone): "default" | "secondary" | "destructive" | "outline" {
  return toneBadgeVariants[tone];
}
