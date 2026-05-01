import { useEffect, useRef, useState } from "react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import type { AnnotationSide } from "@pierre/diffs";
import { Button } from "../ui/button.js";

export type CommentAnnotationMetadata =
  | {
      id: string;
      kind: "comment-form";
    }
  | {
      body: string;
      id: string;
      kind: "comment";
    };

export type CommentAnnotation = DiffLineAnnotation<CommentAnnotationMetadata>;

export function CommentAnnotationView({
  annotation,
  onCancel,
  onSubmit,
}: {
  annotation: CommentAnnotation;
  onCancel: (id: string) => void;
  onSubmit: (id: string, body: string) => void;
}) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (annotation.metadata.kind === "comment-form") {
      textareaRef.current?.focus();
    }
  }, [annotation.metadata.kind]);

  if (annotation.metadata.kind === "comment") {
    return (
      <div className="app-comment-card my-3 ml-4 max-w-2xl rounded-lg p-3">
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">You</span>
          <span className="text-muted-foreground">now</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {annotation.metadata.body}
        </p>
      </div>
    );
  }

  return (
    <div className="app-comment-card my-3 ml-4 max-w-2xl rounded-lg p-3">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="font-semibold text-foreground">New comment</span>
        <span className="font-mono text-muted-foreground">
          {annotation.side}:{annotation.lineNumber}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        aria-label={`Comment on ${annotation.side} line ${annotation.lineNumber}`}
        placeholder="Leave a comment"
        className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-ring focus:ring-2 focus:ring-ring"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => onSubmit(annotation.metadata.id, body)}>
          Comment
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onCancel(annotation.metadata.id)}>
          Cancel
        </Button>
      </div>
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
      id: `${side}-${lineNumber}-${Date.now()}`,
      kind: "comment-form",
    },
  };
}
