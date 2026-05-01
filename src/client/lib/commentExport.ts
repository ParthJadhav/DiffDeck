import type { AnnotationSide, FileContents, FileDiffMetadata } from "@pierre/diffs";

const contextRadius = 2;

export interface CommentContextLine {
  content: string;
  lineNumber: number;
  target: boolean;
}

export interface CommentExportRecord {
  body: string;
  contextLines: CommentContextLine[];
  filePath: string;
  id: string;
  lineNumber: number;
  side: AnnotationSide;
}

export function buildCommentContext({
  fileDiff,
  lineNumber,
  side,
  unresolvedFile,
}: {
  fileDiff: FileDiffMetadata | null;
  lineNumber: number;
  side: AnnotationSide;
  unresolvedFile: FileContents | null;
}): CommentContextLine[] {
  if (fileDiff != null) {
    return buildDiffContext(fileDiff, side, lineNumber);
  }

  if (unresolvedFile != null) {
    return buildFullFileContext(splitLines(unresolvedFile.contents), lineNumber);
  }

  return [];
}

export function formatCommentExport(records: CommentExportRecord[]): string {
  if (records.length === 0) return "";

  const blocks = records.map((record, index) => {
    const sideLabel = record.side === "additions" ? "new file" : "old file";
    const contextBlock = formatContextBlock(record);

    return [
      `${index + 1}. ${record.filePath}:${record.lineNumber} (${sideLabel})`,
      "",
      "Context:",
      contextBlock,
      "",
      "Comment:",
      record.body,
    ].join("\n");
  });

  return ["Address these diff review comments:", "", blocks.join("\n\n---\n\n")].join("\n");
}

function buildDiffContext(
  fileDiff: FileDiffMetadata,
  side: AnnotationSide,
  lineNumber: number,
): CommentContextLine[] {
  const lines = side === "additions" ? fileDiff.additionLines : fileDiff.deletionLines;

  if (!fileDiff.isPartial) {
    return buildFullFileContext(lines, lineNumber);
  }

  const match = findPartialHunk(fileDiff, side, lineNumber);
  if (match == null) {
    return [];
  }

  const startLine = Math.max(match.start, lineNumber - contextRadius);
  const endLine = Math.min(match.start + match.count - 1, lineNumber + contextRadius);
  const contextLines: CommentContextLine[] = [];

  for (let currentLine = startLine; currentLine <= endLine; currentLine += 1) {
    const lineIndex = match.lineIndex + currentLine - match.start;
    const content = lines[lineIndex];
    if (content == null) continue;
    contextLines.push({
      content,
      lineNumber: currentLine,
      target: currentLine === lineNumber,
    });
  }

  return contextLines;
}

function buildFullFileContext(lines: string[], lineNumber: number): CommentContextLine[] {
  const targetIndex = lineNumber - 1;
  if (targetIndex < 0 || targetIndex >= lines.length) return [];

  const startIndex = Math.max(0, targetIndex - contextRadius);
  const endIndex = Math.min(lines.length - 1, targetIndex + contextRadius);
  const contextLines: CommentContextLine[] = [];

  for (let lineIndex = startIndex; lineIndex <= endIndex; lineIndex += 1) {
    contextLines.push({
      content: lines[lineIndex] ?? "",
      lineNumber: lineIndex + 1,
      target: lineIndex === targetIndex,
    });
  }

  return contextLines;
}

function findPartialHunk(
  fileDiff: FileDiffMetadata,
  side: AnnotationSide,
  lineNumber: number,
): { count: number; lineIndex: number; start: number } | null {
  for (const hunk of fileDiff.hunks) {
    const start = side === "additions" ? hunk.additionStart : hunk.deletionStart;
    const count = side === "additions" ? hunk.additionCount : hunk.deletionCount;
    if (count <= 0) continue;
    if (lineNumber < start || lineNumber >= start + count) continue;

    return {
      count,
      lineIndex: side === "additions" ? hunk.additionLineIndex : hunk.deletionLineIndex,
      start,
    };
  }

  return null;
}

function formatContextBlock(record: CommentExportRecord): string {
  if (record.contextLines.length === 0) {
    return "(context unavailable from the loaded diff)";
  }

  const lineNumberWidth = Math.max(
    String(record.lineNumber).length,
    ...record.contextLines.map((line) => String(line.lineNumber).length),
  );
  const rows = record.contextLines.map((line) => {
    const marker = line.target ? ">" : " ";
    const lineNumber = String(line.lineNumber).padStart(lineNumberWidth, " ");
    return `${marker} ${lineNumber} | ${line.content}`;
  });
  const fence = getFence(rows);
  const language = getFenceLanguage(record.filePath);

  return [`${fence}${language}`, ...rows, fence].join("\n");
}

function getFence(rows: string[]): string {
  let length = 3;
  for (const row of rows) {
    for (const match of row.matchAll(/`{3,}/g)) {
      length = Math.max(length, match[0].length + 1);
    }
  }
  return "`".repeat(length);
}

function getFenceLanguage(filePath: string): string {
  const extension = filePath.split(".").pop();
  if (extension == null || extension === filePath) return "";
  if (!/^[a-z0-9_-]+$/i.test(extension)) return "";
  return extension.toLowerCase();
}

function splitLines(contents: string): string[] {
  return contents.replace(/\r\n/g, "\n").split("\n");
}
