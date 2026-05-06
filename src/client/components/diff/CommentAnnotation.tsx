import { memo, useEffect, useRef, type ReactNode } from "react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import type { AnnotationSide } from "@pierre/diffs";
import { Button } from "../ui/button.js";
import type { QueueStatus } from "../../hooks/useAgentQueue.js";
type DisplayQueueStatus = QueueStatus | "queueing";

export type CommentAnnotationMetadata = {
  body: string;
  id: string;
  kind: "comment-form" | "comment";
  // Set when the form is reopened to edit an existing comment. Cancel restores
  // body + kind from this snapshot instead of removing the annotation.
  previousBody?: string;
};

export type CommentAnnotation = DiffLineAnnotation<CommentAnnotationMetadata>;

export function patchAnnotationMeta(
  annotations: CommentAnnotation[],
  id: string,
  patch: Partial<CommentAnnotationMetadata>,
): CommentAnnotation[] {
  return annotations.map((annotation) =>
    annotation.metadata.id === id
      ? { ...annotation, metadata: { ...annotation.metadata, ...patch } }
      : annotation,
  );
}

export const CommentAnnotationView = memo(function CommentAnnotationView({
  annotation,
  agentError,
  agentLivePreview,
  agentResponse,
  agentStatus,
  onAgentCancel,
  onBodyChange,
  onCancel,
  onDelete,
  onEdit,
  onSubmit,
}: {
  annotation: CommentAnnotation;
  agentError?: string | null;
  agentLivePreview?: string | null;
  agentResponse?: string | null;
  agentStatus?: DisplayQueueStatus | null;
  onAgentCancel?: (id: string) => void;
  onBodyChange: (id: string, body: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onSubmit: (id: string, body: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { body, id, kind, previousBody } = annotation.metadata;
  const isEditing = previousBody !== undefined;

  useEffect(() => {
    if (kind !== "comment-form") return;
    const el = textareaRef.current;
    if (el == null) return;
    el.focus();
    if (isEditing) {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  }, [kind, isEditing]);

  const displayStatus: DisplayQueueStatus | null = agentStatus ?? null;
  const statusLabel = displayStatus != null ? formatStatusLabel(displayStatus) : null;
  const isAgentCancelable =
    displayStatus === "queued" ||
    displayStatus === "in_progress" ||
    displayStatus === "needs_input" ||
    displayStatus === "queueing";

  if (kind === "comment") {
    return (
      <CommentCard variant="saved" commentId={id}>
        <div className="-mt-0.5 mb-1.5 flex h-6 items-center gap-2 text-xs leading-none">
          <span className="font-semibold text-foreground">You</span>
          <span className="text-muted-foreground">now</span>
          {displayStatus != null ? (
            <span
              className={
                displayStatus === "in_progress"
                  ? "rounded bg-sky-500/16 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-700 dark:text-sky-300 app-agent-badge-pulse"
                  : "rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
              }
            >
              {statusLabel}
            </span>
          ) : null}
          <div className="app-comment-actions ml-auto flex items-center gap-0.5">
            {onAgentCancel != null && isAgentCancelable ? (
              <Button
                size="sm"
                variant="ghost"
                className="app-comment-action-btn relative h-6 w-6 px-0 text-[11px]"
                onClick={() => onAgentCancel(id)}
                aria-label="Cancel agent task"
                title="Stop agent task"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
                  <rect x="4" y="4" width="8" height="8" rx="1.25" />
                </svg>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="app-comment-action-btn relative h-6 px-2 text-[11px]"
              onClick={() => onEdit(id)}
              aria-label="Edit comment"
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="app-comment-action-btn relative h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(id)}
              aria-label="Delete comment"
            >
              Delete
            </Button>
          </div>
        </div>
        <p className="whitespace-pre-wrap text-pretty font-sans text-sm leading-snug text-foreground">
          {body}
        </p>
        {displayStatus === "in_progress" && agentLivePreview != null && agentLivePreview.length > 0 ? (
          <p className="mt-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            {agentLivePreview}
          </p>
        ) : null}
        {agentResponse != null && agentResponse.length > 0 ? (
          <div className="mt-2 rounded-md border border-border/80 bg-accent/35 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Agent reply
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-foreground">
              {agentResponse}
            </p>
          </div>
        ) : null}
        {agentError != null && agentError.length > 0 ? (
          <p className="mt-2 rounded bg-destructive/8 px-2 py-1 text-xs text-destructive">{agentError}</p>
        ) : null}
      </CommentCard>
    );
  }

  return (
    <CommentCard variant="form" commentId={id}>
      <div className="mb-2 flex items-baseline gap-2 text-xs">
        <span className="font-semibold text-foreground">
          {isEditing ? "Edit comment" : "New comment"}
        </span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {annotation.side}:{annotation.lineNumber}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => onBodyChange(id, event.target.value)}
        aria-label={`Comment on ${annotation.side} line ${annotation.lineNumber}`}
        placeholder="Leave a comment"
        className="app-comment-textarea min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-ring"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => onSubmit(id, body)}>
          {isEditing ? "Save" : "Comment"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onCancel(id)}>
          Cancel
        </Button>
      </div>
    </CommentCard>
  );
});

function formatStatusLabel(status: DisplayQueueStatus): string {
  switch (status) {
    case "queueing":
      return "queueing";
    case "in_progress":
      return "in progress";
    case "needs_input":
      return "needs input";
    default:
      return status;
  }
}

function CommentCard({
  children,
  commentId,
  variant,
}: {
  children: ReactNode;
  commentId: string;
  variant: "saved" | "form";
}) {
  return (
    <div
      data-variant={variant}
      data-comment-id={commentId}
      className="app-comment-card group mx-4 my-2 max-w-2xl rounded-[16px] p-2.5"
    >
      {children}
    </div>
  );
}

export function createCommentAnnotation(
  side: AnnotationSide,
  lineNumber: number,
): CommentAnnotation {
  return {
    side,
    lineNumber,
    metadata: {
      body: "",
      id: `${side}-${lineNumber}-${Date.now()}`,
      kind: "comment-form",
    },
  };
}
