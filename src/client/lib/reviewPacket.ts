import { formatCommentExport, type CommentExportRecord } from "./commentExport.js";

export const REVIEW_PACKET_VERSION = 2;

export interface ReviewPacketInput {
  comments: readonly CommentExportRecord[];
  diffArgs: readonly string[];
  repoRoot: string;
  snapshotId: string;
  totalFiles: number;
  viewedFiles: number;
}

export interface ReviewPacket {
  version: typeof REVIEW_PACKET_VERSION;
  repository: { root: string; diffArgs: string[]; snapshotId: string };
  progress: { totalFiles: number; viewedFiles: number };
  comments: Array<
    CommentExportRecord & {
      contextLines: Array<CommentExportRecord["contextLines"][number]>;
      status: "open" | "resolved" | "stale";
    }
  >;
}

export function createReviewPacket(input: ReviewPacketInput): ReviewPacket {
  return {
    version: REVIEW_PACKET_VERSION,
    repository: {
      root: input.repoRoot,
      diffArgs: [...input.diffArgs],
      snapshotId: input.snapshotId,
    },
    progress: { totalFiles: input.totalFiles, viewedFiles: input.viewedFiles },
    comments: input.comments.map((comment) => ({
      ...comment,
      body: comment.body.trim(),
      contextLines: comment.contextLines.map((line) => ({
        ...line,
        content: normalizeLine(line.content),
      })),
      status: comment.status ?? "open",
      scope: comment.scope ?? "line",
    })),
  };
}

export function formatReviewPacketMarkdown(packet: ReviewPacket): string {
  const header = [
    "# DiffDeck review packet",
    "",
    `- Snapshot: \`${packet.repository.snapshotId}\``,
    `- Diff arguments: ${packet.repository.diffArgs.length > 0 ? packet.repository.diffArgs.map((arg) => `\`${arg}\``).join(" ") : "working tree"}`,
    `- Progress: ${packet.progress.viewedFiles}/${packet.progress.totalFiles} files viewed`,
  ].join("\n");
  const comments = formatCommentExport(packet.comments);
  return comments.length === 0 ? `${header}\n\nNo review comments.` : `${header}\n\n${comments}`;
}

export function formatReviewPacketJson(packet: ReviewPacket): string {
  return `${JSON.stringify(packet, null, 2)}\n`;
}

function normalizeLine(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}
