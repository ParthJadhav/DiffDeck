import { useEffect, useMemo, useState } from "react";
import { formatCommentExport, type CommentExportRecord } from "../lib/commentExport.js";
import { cn } from "../lib/cn.js";
import { Button } from "./ui/button.js";

type CopyStatus = "idle" | "copied" | "failed";

export function CopyCommentsButton({ comments }: { comments: CommentExportRecord[] }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const commentCount = comments.length;
  const copyText = useMemo(
    () => (commentCount === 0 ? "" : formatCommentExport(comments)),
    [comments, commentCount],
  );

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

  if (commentCount === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        aria-label={`Copy ${commentCount} ${commentCount === 1 ? "comment" : "comments"} with context`}
        title="Copy comments with context"
        className="app-copy-fab pointer-events-auto h-11 gap-2.5 rounded-full px-4 text-[12.5px] font-medium"
      >
        <CopyIcon />
        <span>Copy comments</span>
        <span
          data-status={copyStatus}
          className="app-copy-fab-badge app-copy-status inline-grid h-5 min-w-[1.5rem] place-items-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums"
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
            <CheckIcon />
          </span>
          <span
            className={cn(
              "app-copy-status-item",
              copyStatus === "failed" && "app-copy-status-item-visible",
            )}
          >
            <ErrorIcon />
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

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.4l2.4 2.4L9.5 3.7" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}
