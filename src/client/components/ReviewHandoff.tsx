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
import { Button } from "./ui/button.js";

type CopyStatus = "idle" | "copied" | "failed";

export interface ReviewPacketSource {
  comments: readonly CommentExportRecord[];
  diffArgs: string[];
  repoRoot: string;
  snapshotId: string;
  totalFiles: number;
  viewedFiles: number;
}

function useReviewPacket({
  comments,
  diffArgs,
  repoRoot,
  snapshotId,
  totalFiles,
  viewedFiles,
}: ReviewPacketSource) {
  const packet = useMemo(
    () =>
      createReviewPacket({
        comments: [...comments],
        diffArgs,
        repoRoot,
        snapshotId,
        totalFiles,
        viewedFiles,
      }),
    [comments, diffArgs, repoRoot, snapshotId, totalFiles, viewedFiles],
  );
  const markdown = useMemo(() => formatReviewPacketMarkdown(packet), [packet]);
  const json = useMemo(() => formatReviewPacketJson(packet), [packet]);
  return { json, markdown };
}

export function noteNoun(count: number): string {
  return count === 1 ? "note" : "notes";
}

/**
 * The one place a review leaves DiffDeck: copy for an agent chat, download
 * the JSON packet, or print it in the terminal that launched DiffDeck.
 */
export function HandoffBar(props: ReviewPacketSource) {
  const { json, markdown } = useReviewPacket(props);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const count = props.comments.length;

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = window.setTimeout(() => {
      setCopyStatus("idle");
      setStatusMessage("");
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  if (count === 0) return null;

  const report = (status: CopyStatus, message: string) => {
    setCopyStatus(status);
    setStatusMessage(message);
  };

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(markdown);
      report("copied", "Copied review packet");
    } catch {
      report("failed", "Unable to copy review packet");
    }
  };

  const handleSend = async () => {
    try {
      const response = await fetchWithCapability("/api/review-packet", {
        body: json,
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Terminal submission failed");
      // Consume the body so the browser does not report the completed request
      // as aborted when the page later navigates away.
      await response.text();
      report("copied", "Sent review packet to the terminal");
    } catch {
      report("failed", "Unable to send the review packet to the terminal");
    }
  };

  return (
    <section
      className="app-copy-comment-actions flex items-center gap-1 text-[12px] font-medium"
      aria-label="Comment actions"
    >
      <Button
        onClick={handleCopy}
        aria-label={`Copy ${count} ${noteNoun(count)} for agent`}
        title="Copy notes with code context, ready to paste into your agent"
        className="h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-2.5 text-[12px]"
      >
        <span
          aria-hidden="true"
          data-status={copyStatus}
          className="app-comment-action-badge app-copy-status inline-grid size-3.5 shrink-0 place-items-center"
        >
          <Copy
            className={cn(
              "app-copy-status-item size-3.5",
              copyStatus === "idle" && "app-copy-status-item-visible",
            )}
          />
          <Check
            className={cn(
              "app-copy-status-item size-3.5",
              copyStatus === "copied" && "app-copy-status-item-visible",
            )}
          />
          <X
            className={cn(
              "app-copy-status-item size-3.5",
              copyStatus === "failed" && "app-copy-status-item-visible",
            )}
          />
        </span>
        <span className="min-w-0 truncate">
          Copy {count} {noteNoun(count)}
        </span>
        <span className="app-handoff-hint ml-auto shrink-0 text-[10.5px] font-normal">
          for agent
        </span>
      </Button>
      <form action={withCapabilityToken("/api/review-packet/download")} method="post">
        <input type="hidden" name="packet" value={json} />
        <Button
          aria-label="Download review packet as JSON"
          type="submit"
          variant="outline"
          size="icon"
          title="Download JSON packet"
          className="size-8 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
        >
          <Download />
        </Button>
      </form>
      <Button
        variant="outline"
        size="icon"
        onClick={handleSend}
        aria-label="Send review packet to terminal"
        title="Print the packet in the terminal running DiffDeck"
        className="size-8 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
      >
        <Send />
      </Button>
      <output className="sr-only" aria-live="polite">
        {statusMessage}
      </output>
    </section>
  );
}

/** Exact packet preview plus the destructive clear, kept beside the notes. */
export function PacketPreview({
  onClearAll,
  ...source
}: ReviewPacketSource & { onClearAll: () => void }) {
  const { json, markdown } = useReviewPacket(source);
  const [previewFormat, setPreviewFormat] = useState<"markdown" | "json">("markdown");
  const [clearConfirmation, setClearConfirmation] = useState({ active: false, commentCount: 0 });
  const count = source.comments.length;
  const isConfirmingClear = clearConfirmation.active && clearConfirmation.commentCount === count;

  useEffect(() => {
    if (!isConfirmingClear) return;
    const timer = window.setTimeout(
      () => setClearConfirmation({ active: false, commentCount: 0 }),
      3000,
    );
    return () => window.clearTimeout(timer);
  }, [isConfirmingClear]);

  if (count === 0) return null;

  const handleClearClick = () => {
    if (!isConfirmingClear) {
      setClearConfirmation({ active: true, commentCount: count });
      return;
    }
    onClearAll();
    setClearConfirmation({ active: false, commentCount: 0 });
  };

  return (
    <div className="flex flex-col gap-1.5 text-[11.5px] font-medium">
      <details className="group rounded-md border border-border bg-background">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-md px-2.5 text-[11.5px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <Eye aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1">Preview exact packet</span>
        </summary>
        <div className="border-t border-border p-1.5">
          <div className="mb-1.5 grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5 text-[10.5px]">
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
            className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[9.5px] leading-4 text-foreground"
            tabIndex={0}
          >
            {previewFormat === "markdown" ? markdown : json}
          </pre>
        </div>
      </details>
      <Button
        variant={isConfirmingClear ? "destructive" : "ghost"}
        onClick={handleClearClick}
        aria-label={`${isConfirmingClear ? "Confirm clear" : "Clear"} ${count} ${noteNoun(count)}`}
        title={isConfirmingClear ? "Click again to confirm" : "Delete every note in this review"}
        className={cn(
          "h-8 w-full justify-start rounded-md px-2.5 text-[11.5px]",
          !isConfirmingClear && "text-muted-foreground hover:text-destructive",
        )}
        size="xs"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
        {isConfirmingClear ? "Click again to delete all notes" : "Clear all notes"}
      </Button>
    </div>
  );
}
