import { useEffect, useRef, type ReactNode } from "react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import type { AnnotationSide } from "@pierre/diffs";
import { Button } from "../ui/button.js";

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

export function CommentAnnotationView({
  annotation,
  onBodyChange,
  onCancel,
  onDelete,
  onEdit,
  onSubmit,
}: {
  annotation: CommentAnnotation;
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

  if (kind === "comment") {
    return (
      <CommentCard variant="saved">
        <div className="-mt-0.5 mb-1.5 flex h-6 items-center gap-2 text-xs leading-none">
          <span className="font-semibold text-foreground">You</span>
          <span className="text-muted-foreground">now</span>
          <div className="app-comment-actions ml-auto flex items-center gap-0.5">
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
      </CommentCard>
    );
  }

  return (
    <CommentCard variant="form">
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
}

function CommentCard({ children, variant }: { children: ReactNode; variant: "saved" | "form" }) {
  return (
    <div
      data-variant={variant}
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
