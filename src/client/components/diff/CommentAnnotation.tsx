import { useEffect, useRef, type ReactNode } from "react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import type { AnnotationSide } from "@pierre/diffs";
import { Button } from "../ui/button.js";

export type CommentAnnotationMetadata = {
  body: string;
  id: string;
  kind: "comment-form" | "comment";
};

export type CommentAnnotation = DiffLineAnnotation<CommentAnnotationMetadata>;

export function CommentAnnotationView({
  annotation,
  onBodyChange,
  onCancel,
  onSubmit,
}: {
  annotation: CommentAnnotation;
  onBodyChange: (id: string, body: string) => void;
  onCancel: (id: string) => void;
  onSubmit: (id: string, body: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { body, id, kind } = annotation.metadata;

  useEffect(() => {
    if (kind === "comment-form") {
      textareaRef.current?.focus();
    }
  }, [kind]);

  if (kind === "comment") {
    return (
      <CommentCard>
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">You</span>
          <span className="text-muted-foreground">now</span>
        </div>
        <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-foreground">
          {body}
        </p>
      </CommentCard>
    );
  }

  return (
    <CommentCard>
      <div className="mb-2 flex items-baseline gap-2 text-xs">
        <span className="font-semibold text-foreground">New comment</span>
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
      <div className="mt-3 flex items-center gap-1">
        <Button size="sm" onClick={() => onSubmit(id, body)}>
          Comment
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onCancel(id)}>
          Cancel
        </Button>
      </div>
    </CommentCard>
  );
}

function CommentCard({ children }: { children: ReactNode }) {
  return <div className="app-comment-card my-3 ml-4 max-w-2xl rounded-[18px] p-3">{children}</div>;
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
