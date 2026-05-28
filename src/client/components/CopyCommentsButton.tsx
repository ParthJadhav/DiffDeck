import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Trash2, X } from "lucide-react";
import { formatCommentExport, type CommentExportRecord } from "../lib/commentExport.js";
import { cn } from "../lib/cn.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";

type CopyStatus = "idle" | "copied" | "failed";

export function CopyCommentsButton({
  comments,
  onClearAll,
}: {
  comments: CommentExportRecord[];
  onClearAll: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [clearConfirmation, setClearConfirmation] = useState({ active: false, commentCount: 0 });
  const commentCount = comments.length;
  const commentLabel = commentCount === 1 ? "comment" : "comments";
  const isConfirmingClear =
    clearConfirmation.active && clearConfirmation.commentCount === commentCount;
  const copyText = useMemo(
    () => (commentCount === 0 ? "" : formatCommentExport(comments)),
    [comments, commentCount],
  );

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 1600);
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
    } catch {
      setCopyStatus("failed");
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
        {copyStatus === "copied"
          ? "Copied comments"
          : copyStatus === "failed"
            ? "Unable to copy comments"
            : ""}
      </output>
    </section>
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText != null) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Copy command failed");
  } finally {
    document.body.removeChild(textarea);
  }
}
