import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Edit3,
  ExternalLink,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import type { CommentExportRecord } from "../lib/commentExport.js";
import { cn } from "../lib/cn.js";
import { focusTextEnd, isSubmitShortcut } from "../lib/keyboard.js";
import { ComposerHint } from "./diff/ComposerHint.js";
import { Button } from "./ui/button.js";
import { Textarea } from "./ui/textarea.js";

type NoteFilter = "all" | "open" | "stale" | "resolved";

export function ReviewNotesHub({
  comments,
  onDelete,
  onJump,
  onUpdate,
}: {
  comments: readonly CommentExportRecord[];
  onDelete: (comment: CommentExportRecord) => void;
  onJump: (comment: CommentExportRecord) => void;
  onUpdate: (comment: CommentExportRecord) => void;
}) {
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [editing, setEditing] = useState<{ body: string; id: string } | null>(null);
  const counts = useMemo(() => {
    const result = { open: 0, resolved: 0, stale: 0 };
    for (const comment of comments) result[comment.status ?? "open"] += 1;
    return result;
  }, [comments]);
  const visible = useMemo(
    () =>
      filter === "all"
        ? comments
        : comments.filter((comment) => (comment.status ?? "open") === filter),
    [comments, filter],
  );

  // Leaving the editor returns focus to the note card, so the reviewer's place
  // in the queue survives and global shortcuts are live again.
  const focusNote = (id: string) => {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-note-id="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true });
    });
  };
  const saveEdit = (comment: CommentExportRecord, body: string) => {
    onUpdate({ ...comment, body: body.trim() });
    setEditing(null);
    focusNote(comment.id);
  };
  const cancelEdit = (id: string) => {
    setEditing(null);
    focusNote(id);
  };

  if (comments.length === 0) return null;

  return (
    <details className="group rounded-lg border border-border bg-muted/20">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 text-[11.5px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
        <MessageSquareText aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">Review notes</span>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-secondary-foreground">
          {comments.length}
        </span>
      </summary>
      <div className="border-t border-border px-2 pb-2 pt-1.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Filter review notes</span>
            <select
              aria-label="Filter review notes"
              value={filter}
              onChange={(event) => setFilter(event.target.value as NoteFilter)}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-[10.5px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All notes ({comments.length})</option>
              <option value="open">Open ({counts.open})</option>
              <option value="stale">Stale ({counts.stale})</option>
              <option value="resolved">Resolved ({counts.resolved})</option>
            </select>
          </label>
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain">
          {visible.length === 0 ? (
            <p className="rounded-md px-2 py-3 text-center text-[11px] text-muted-foreground">
              No {filter} notes.
            </p>
          ) : (
            visible.map((comment) => {
              const status = comment.status ?? "open";
              const isEditing = editing?.id === comment.id;
              return (
                <article
                  key={comment.id}
                  data-note-id={comment.id}
                  tabIndex={-1}
                  className="rounded-md border border-border bg-background p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 text-[9px] font-semibold uppercase",
                        status === "stale" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                        status === "resolved" && "bg-muted text-muted-foreground",
                        status === "open" &&
                          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {status}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground"
                      title={comment.filePath}
                    >
                      {comment.scope === "file"
                        ? `${comment.filePath} · file`
                        : `${comment.filePath}:${comment.lineNumber}`}
                    </span>
                  </div>
                  {isEditing ? (
                    <div className="mt-2">
                      <Textarea
                        aria-label={`Edit note for ${comment.filePath}`}
                        ref={focusTextEnd}
                        className="min-h-20 resize-y text-xs"
                        value={editing.body}
                        onChange={(event) =>
                          setEditing({ body: event.target.value, id: comment.id })
                        }
                        onKeyDown={(event) => {
                          if (isSubmitShortcut(event.nativeEvent)) {
                            event.preventDefault();
                            if (editing.body.trim().length > 0) saveEdit(comment, editing.body);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            cancelEdit(comment.id);
                          }
                        }}
                      />
                      <div className="mt-1.5 flex items-center gap-1">
                        <Button
                          size="xs"
                          disabled={editing.body.trim().length === 0}
                          onClick={() => saveEdit(comment, editing.body)}
                        >
                          Save
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => cancelEdit(comment.id)}>
                          Cancel
                        </Button>
                        <ComposerHint action="save" />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-4 text-foreground">
                      {comment.body}
                    </p>
                  )}
                  {status !== "open" ? (
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                      {status === "stale"
                        ? "The source changed and this note could not be re-anchored safely."
                        : "The original source line is no longer present."}
                    </p>
                  ) : null}
                  {!isEditing ? (
                    <div className="mt-1.5 flex flex-wrap gap-0.5">
                      <Button
                        aria-label={`Jump to note in ${comment.filePath}`}
                        size="xs"
                        variant="ghost"
                        onClick={() => onJump(comment)}
                      >
                        <ExternalLink aria-hidden="true" />
                        Jump
                      </Button>
                      <Button
                        aria-label={`Edit note in ${comment.filePath}`}
                        size="xs"
                        variant="ghost"
                        onClick={() => setEditing({ body: comment.body, id: comment.id })}
                      >
                        <Edit3 aria-hidden="true" />
                        Edit
                      </Button>
                      {status !== "open" ? (
                        <Button
                          aria-label={`Reopen note in ${comment.filePath}`}
                          size="xs"
                          variant="ghost"
                          onClick={() => onUpdate({ ...comment, status: "open" })}
                        >
                          <CheckCircle2 aria-hidden="true" />
                          Reopen
                        </Button>
                      ) : null}
                      <Button
                        aria-label={`Delete note in ${comment.filePath}`}
                        className="text-muted-foreground hover:text-destructive"
                        size="xs"
                        variant="ghost"
                        onClick={() => onDelete(comment)}
                      >
                        <Trash2 aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>
    </details>
  );
}
