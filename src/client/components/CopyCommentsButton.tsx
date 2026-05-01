import { useEffect, useMemo, useState } from "react";
import { formatCommentExport, type CommentExportRecord } from "../lib/commentExport.js";
import { cn } from "../lib/cn.js";
import { Button } from "./ui/button.js";

type CopyStatus = "idle" | "copied" | "failed";

export function CopyCommentsButton({ comments }: { comments: CommentExportRecord[] }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const copyText = useMemo(() => formatCommentExport(comments), [comments]);
  const commentCount = comments.length;

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const handleCopy = async () => {
    if (copyText.length === 0) return;

    try {
      await copyTextToClipboard(copyText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        disabled={commentCount === 0}
        aria-label={
          commentCount === 0
            ? "No comments to copy"
            : `Copy ${commentCount} ${commentCount === 1 ? "comment" : "comments"} with context`
        }
        title={commentCount === 0 ? "No comments to copy" : "Copy all comments with context"}
        className="app-sidebar-action h-10 w-full justify-start px-2.5 text-[12px]"
      >
        <CopyIcon />
        <span className="min-w-0 flex-1 truncate text-left">Copy all comments</span>
        <span
          className="app-count-badge app-copy-status inline-grid h-5 w-12 shrink-0 place-items-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums"
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
            copied
          </span>
          <span
            className={cn(
              "app-copy-status-item",
              copyStatus === "failed" && "app-copy-status-item-visible",
            )}
          >
            error
          </span>
        </span>
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {copyStatus === "copied"
          ? "Copied comments"
          : copyStatus === "failed"
            ? "Unable to copy comments"
            : ""}
      </span>
    </div>
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

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5.5" y="5.5" width="7" height="7" rx="1.4" />
      <path d="M3.5 10.5h-.2A1.3 1.3 0 012 9.2V3.3A1.3 1.3 0 013.3 2h5.9a1.3 1.3 0 011.3 1.3v.2" />
    </svg>
  );
}
