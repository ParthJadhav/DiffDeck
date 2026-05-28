import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardFooter, CardHeader } from "../ui/card.js";
import { Textarea } from "../ui/textarea.js";
import type { CommentAnnotation } from "./commentAnnotationModel.js";

export const CommentAnnotationView = memo(function CommentAnnotationView({
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
  const [draftBody, setDraftBody] = useState(body);
  const draftBodyRef = useRef(body);

  useEffect(() => {
    setDraftBody(body);
    draftBodyRef.current = body;
  }, [body, id]);

  const handleDraftChange = useCallback((nextBody: string) => {
    draftBodyRef.current = nextBody;
    setDraftBody(nextBody);
  }, []);

  const flushDraftBody = useCallback(() => {
    if (kind === "comment-form" && draftBodyRef.current !== body) {
      onBodyChange(id, draftBodyRef.current);
    }
  }, [body, id, kind, onBodyChange]);

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
        <CardHeader className="-mt-0.5 flex h-6 flex-row items-center gap-2 gap-y-0 p-0 text-xs leading-none">
          <span className="font-semibold text-foreground">You</span>
          <span className="text-muted-foreground">now</span>
          <div className="app-saved-comment-actions ml-auto flex items-center gap-0.5">
            <Button
              size="xs"
              variant="ghost"
              className="app-comment-action-btn relative h-6 px-2 font-sans text-[11px]"
              onClick={() => onEdit(id)}
              aria-label="Edit comment"
            >
              Edit
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="app-comment-action-btn relative h-6 px-2 font-sans text-[11px] text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(id)}
              aria-label="Delete comment"
            >
              Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent className="mt-1.5 p-0">
          <p className="whitespace-pre-wrap text-pretty font-sans text-sm leading-snug text-foreground">
            {body}
          </p>
        </CardContent>
      </CommentCard>
    );
  }

  return (
    <CommentCard variant="form">
      <CardHeader className="mb-2 flex flex-row items-center gap-2 gap-y-0 p-0 text-xs">
        <span className="font-semibold text-foreground">
          {isEditing ? "Edit comment" : "New comment"}
        </span>
        <Badge
          variant="outline"
          className="h-5 rounded-md px-1.5 font-sans text-[10.5px] font-medium tabular-nums text-muted-foreground"
        >
          {annotation.side}:{annotation.lineNumber}
        </Badge>
      </CardHeader>
      <Textarea
        ref={textareaRef}
        value={draftBody}
        onChange={(event) => handleDraftChange(event.target.value)}
        onBlur={(event) => {
          const nextFocus = event.relatedTarget;
          if (nextFocus instanceof Node && event.currentTarget.parentElement?.contains(nextFocus)) {
            return;
          }
          flushDraftBody();
        }}
        aria-label={`Comment on ${annotation.side} line ${annotation.lineNumber}`}
        placeholder="Leave a comment"
        className="app-comment-textarea resize-y font-sans"
      />
      <CardFooter className="mt-3 gap-2 p-0">
        <Button size="sm" className="font-sans" onClick={() => onSubmit(id, draftBody)}>
          {isEditing ? "Save" : "Comment"}
        </Button>
        <Button size="sm" variant="ghost" className="font-sans" onClick={() => onCancel(id)}>
          Cancel
        </Button>
      </CardFooter>
    </CommentCard>
  );
});

function CommentCard({ children, variant }: { children: ReactNode; variant: "saved" | "form" }) {
  return (
    <Card
      data-variant={variant}
      className="app-comment-card group mx-4 my-2 max-w-2xl rounded-lg border-border font-sans"
    >
      <CardContent className="p-2.5">{children}</CardContent>
    </Card>
  );
}
