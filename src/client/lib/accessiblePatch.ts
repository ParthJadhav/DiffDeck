import type { FileDiffMetadata } from "@pierre/diffs";

export type AccessiblePatchRow =
  | {
      content: string;
      key: string;
      kind: "hunk";
      newLine: null;
      oldLine: null;
    }
  | {
      content: string;
      key: string;
      kind: "context";
      newLine: number;
      oldLine: number;
    }
  | {
      content: string;
      key: string;
      kind: "addition";
      newLine: number;
      oldLine: null;
      side: "additions";
    }
  | {
      content: string;
      key: string;
      kind: "deletion";
      newLine: null;
      oldLine: number;
      side: "deletions";
    };

export function buildAccessiblePatchRows(fileDiff: FileDiffMetadata): AccessiblePatchRow[] {
  const rows: AccessiblePatchRow[] = [];
  fileDiff.hunks.forEach((hunk, hunkIndex) => {
    let oldLine = hunk.deletionStart;
    let newLine = hunk.additionStart;
    rows.push({
      content:
        hunk.hunkSpecs ??
        `@@ -${hunk.deletionStart},${hunk.deletionCount} +${hunk.additionStart},${hunk.additionCount} @@${hunk.hunkContext == null ? "" : ` ${hunk.hunkContext}`}`,
      key: `hunk-${hunkIndex}`,
      kind: "hunk",
      newLine: null,
      oldLine: null,
    });
    hunk.hunkContent.forEach((segment, segmentIndex) => {
      if (segment.type === "context") {
        for (let offset = 0; offset < segment.lines; offset += 1) {
          rows.push({
            content: normalizePatchLine(fileDiff.additionLines[segment.additionLineIndex + offset]),
            key: `hunk-${hunkIndex}-context-${segmentIndex}-${offset}`,
            kind: "context",
            newLine,
            oldLine,
          });
          oldLine += 1;
          newLine += 1;
        }
        return;
      }
      for (let offset = 0; offset < segment.deletions; offset += 1) {
        rows.push({
          content: normalizePatchLine(fileDiff.deletionLines[segment.deletionLineIndex + offset]),
          key: `hunk-${hunkIndex}-deletion-${segmentIndex}-${offset}`,
          kind: "deletion",
          newLine: null,
          oldLine,
          side: "deletions",
        });
        oldLine += 1;
      }
      for (let offset = 0; offset < segment.additions; offset += 1) {
        rows.push({
          content: normalizePatchLine(fileDiff.additionLines[segment.additionLineIndex + offset]),
          key: `hunk-${hunkIndex}-addition-${segmentIndex}-${offset}`,
          kind: "addition",
          newLine,
          oldLine: null,
          side: "additions",
        });
        newLine += 1;
      }
    });
  });
  return rows;
}

function normalizePatchLine(value: string | undefined): string {
  return (value ?? "").replace(/(?:\r\n|\r|\n)$/, "");
}
