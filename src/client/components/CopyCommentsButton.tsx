import { useEffect, useMemo, useState } from "react";
import { Braces, Check, Copy, Download, Eye, FileText, Send, Trash2, X } from "lucide-react";
import type { CommentExportRecord } from "../lib/commentExport.js";
import { fetchWithCapability, withCapabilityToken } from "../lib/api.js";
import {
  createReviewPacket,
  formatReviewPacketJson,
  formatReviewPacketMarkdown,
} from "../lib/reviewPacket.js";
import { cn } from "../lib/cn.js";
import { copyTextToClipboard } from "../lib/clipboard.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";

type CopyStatus = "idle" | "copied" | "failed";

export function CopyCommentsButton({
  comments,
  diffArgs,
  onClearAll,
  repoRoot,
  snapshotId,
  totalFiles,
  viewedFiles,
}: {
  comments: CommentExportRecord[];
  diffArgs: string[];
  onClearAll: () => void;
  repoRoot: string;
  snapshotId: string;
  totalFiles: number;
  viewedFiles: number;
}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [previewFormat, setPreviewFormat] = useState<"markdown" | "json">("markdown");
  const [clearConfirmation, setClearConfirmation] = useState({ active: false, commentCount: 0 });
  const commentCount = comments.length;
  const commentLabel = commentCount === 1 ? "comment" : "comments";
  const isConfirmingClear =
    clearConfirmation.active && clearConfirmation.commentCount === commentCount;
  const packet = useMemo(
    () => createReviewPacket({ comments, diffArgs, repoRoot, snapshotId, totalFiles, viewedFiles }),
    [comments, diffArgs, repoRoot, snapshotId, totalFiles, viewedFiles],
  );
  const copyText = useMemo(() => formatReviewPacketMarkdown(packet), [packet]);
  const jsonPacket = useMemo(() => formatReviewPacketJson(packet), [packet]);

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = window.setTimeout(() => {
      setCopyStatus("idle");
      setStatusMessage("");
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  useEffect(() => {
    if (!isConfirmingClear) return;
    const timer = window.setTimeout(
      () => setClearConfirmation({ active: false, commentCount: 0 }),
      3000,
    );
    return () => window.clearTimeout(timer);
  }, [isConfirmingClear]);

  if (commentCount === 0) return null;

  const handleCopy = async () => {
    if (copyText.length === 0) return;

    try {
      await copyTextToClipboard(copyText);
      setCopyStatus("copied");
      setStatusMessage("Copied review packet");
    } catch {
      setCopyStatus("failed");
      setStatusMessage("Unable to copy review packet");
    }
  };

  const handleClearClick = () => {
    if (commentCount === 0) return;
    if (!isConfirmingClear) {
      setClearConfirmation({ active: true, commentCount });
      return;
    }
    onClearAll();
    setClearConfirmation({ active: false, commentCount: 0 });
  };

  const handleSend = async () => {
    try {
      const response = await fetchWithCapability("/api/review-packet", {
        body: formatReviewPacketJson(packet),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Terminal submission failed");
      setCopyStatus("copied");
      setStatusMessage("Sent review packet to the terminal");
    } catch {
      setCopyStatus("failed");
      setStatusMessage("Unable to send the review packet to the terminal");
    }
  };

  return (
    <section
      className="app-copy-comment-actions flex flex-col gap-1.5"
      aria-label="Comment actions"
    >
      <Button
        onClick={handleCopy}
        aria-label={`Copy ${commentCount} ${commentLabel} with context`}
        title="Copy comments with context"
        className="group h-10 w-full justify-start rounded-lg px-3 text-[12.5px]"
      >
        <Copy className="size-3.5" />
        <span className="min-w-0 flex-1 truncate text-left">Copy comments</span>
        <Badge
          data-status={copyStatus}
          variant="secondary"
          className="app-comment-action-badge inline-grid h-5 min-w-[1.5rem] rounded-full border-transparent px-1.5 text-[10.5px]"
          aria-hidden="true"
        >
          <span
            className={cn(
              "app-copy-status-item",
              copyStatus === "idle" && "app-copy-status-item-visible",
            )}
          >
            {commentCount}
          </span>
          <span
            className={cn(
              "app-copy-status-item",
              copyStatus === "copied" && "app-copy-status-item-visible",
            )}
          >
            <Check className="size-2.5" />
          </span>
          <span
            className={cn(
              "app-copy-status-item",
              copyStatus === "failed" && "app-copy-status-item-visible",
            )}
          >
            <X className="size-2.5" />
          </span>
        </Badge>
      </Button>
      <details className="group rounded-lg border border-border bg-muted/20">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 text-[11px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <Eye aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1">Preview exact packet</span>
        </summary>
        <div className="border-t border-border p-1.5">
          <div className="mb-1.5 grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
            <Button
              aria-pressed={previewFormat === "markdown"}
              className="h-7 text-[10.5px]"
              onClick={() => setPreviewFormat("markdown")}
              size="xs"
              variant={previewFormat === "markdown" ? "secondary" : "ghost"}
            >
              <FileText aria-hidden="true" />
              Markdown
            </Button>
            <Button
              aria-pressed={previewFormat === "json"}
              className="h-7 text-[10.5px]"
              onClick={() => setPreviewFormat("json")}
              size="xs"
              variant={previewFormat === "json" ? "secondary" : "ghost"}
            >
              <Braces aria-hidden="true" />
              JSON
            </Button>
          </div>
          <pre
            aria-label={`Exact ${previewFormat} review packet`}
            className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-background p-2 font-mono text-[9.5px] leading-4 text-foreground"
            tabIndex={0}
          >
            {previewFormat === "markdown" ? copyText : jsonPacket}
          </pre>
        </div>
      </details>
      <div className="grid grid-cols-2 gap-1.5">
        <form action={withCapabilityToken("/api/review-packet/download")} method="post">
          <input type="hidden" name="packet" value={jsonPacket} />
          <Button
            aria-label="Download review packet as JSON"
            type="submit"
            variant="outline"
            title="Download JSON packet"
            className="h-9 w-full justify-start px-2 text-[11.5px]"
          >
            <Download className="size-3.5" />
            JSON
          </Button>
        </form>
        <Button
          variant="outline"
          onClick={handleSend}
          aria-label="Send review packet to terminal"
          title="Print packet in the DiffDeck terminal"
          className="h-9 justify-start px-2 text-[11.5px]"
        >
          <Send className="size-3.5" />
          Terminal
        </Button>
      </div>
      <Button
        variant={isConfirmingClear ? "destructive" : "outline"}
        onClick={handleClearClick}
        aria-label={`${isConfirmingClear ? "Confirm clear" : "Clear"} ${commentCount} ${commentLabel}`}
        title={isConfirmingClear ? "Click again to confirm" : "Clear all comments"}
        className="group h-10 w-full justify-start rounded-lg px-3 text-[12.5px]"
      >
        <Trash2 className="size-3.5" />
        <span className="min-w-0 flex-1 truncate text-left">
          {isConfirmingClear ? "Click to confirm" : "Clear all"}
        </span>
      </Button>
      <output className="sr-only" aria-live="polite">
        {statusMessage}
      </output>
    </section>
  );
}
