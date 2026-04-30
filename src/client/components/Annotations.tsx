import type { FileDiffMetadata } from "@pierre/diffs/react";

export function renderHeaderMetadata(fileDiff: FileDiffMetadata) {
  const metadata = [`${fileDiff.hunks.length} hunks`, fileDiff.isPartial ? "patch" : "full file"];
  if (fileDiff.prevName != null) {
    metadata.push(`from ${fileDiff.prevName}`);
  }
  return <span className="font-mono text-xs text-foreground/70">{metadata.join(" • ")}</span>;
}
