import { type ReactNode, useMemo, useState } from "react";
import { CornerDownRight, Edit3, MessageSquarePlus, RotateCcw, Trash2 } from "lucide-react";
import type { CommentExportRecord } from "../lib/commentExport.js";
import { cn } from "../lib/cn.js";
import { splitPath } from "../lib/fileListRows.js";
import { focusTextEnd, isSubmitShortcut } from "../lib/keyboard.js";
import { ComposerHint } from "./diff/ComposerHint.js";
import { Button } from "./ui/button.js";
import { Textarea } from "./ui/textarea.js";

type NoteFilter = "all" | "open" | "stale" | "resolved";
const noteFilters: readonly NoteFilter[] = ["all", "open", "stale", "resolved"];
const filterLabels: Record<NoteFilter, string> = {
  all: "All",
  open: "Open",
  resolved: "Resolved",
  stale: "Stale",
};

/**
 * The notes queue: every note grouped by file in review order, with the exact
 * packet preview underneath. It owns a full sidebar tab so reviewing notes
 * before handoff never competes with the file list for height.
 */
export function ReviewNotesHub({
  comments,
  footer,
  header,
  onDelete,
  onJump,
  onUpdate,
}: {
  comments: readonly CommentExportRecord[];
  footer?: ReactNode;
  header?: ReactNode;
  onDelete: (comment: CommentExportRecord) => void;
  onJump: (comment: CommentExportRecord) => void;
  onUpdate: (comment: CommentExportRecord) => void;
}) {
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [editing, setEditing] = useState<{ body: string; id: string } | null>(null);
  const counts = useMemo(() => {
    const result: Record<NoteFilter, number> = {
      all: comments.length,
      open: 0,
      resolved: 0,
      stale: 0,
    };
    for (const comment of comments) result[comment.status ?? "open"] += 1;
    return result;
  }, [comments]);
  const groups = useMemo(() => {
    const byFile = new Map<string, CommentExportRecord[]>();
    for (const comment of comments) {
      if (filter !== "all" && (comment.status ?? "open") !== filter) continue;
      const group = byFile.get(comment.filePath);
      if (group == null) byFile.set(comment.filePath, [comment]);
      else group.push(comment);
    }
    return [...byFile];
  }, [comments, filter]);

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

  if (comments.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-[15rem] space-y-2">
          <MessageSquarePlus aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
          <p className="text-[12.5px] font-medium text-foreground">No notes yet</p>
          <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
            Click a line number in the diff, or press <kbd>C</kbd> on the selected file, to leave a
            note for your agent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center px-2">
        <div
          role="group"
          aria-label="Filter review notes"
          className="app-segmented flex w-full min-w-0 rounded-md p-0.5 text-[11px] font-medium"
        >
          {noteFilters.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              disabled={value !== "all" && counts[value] === 0 && filter !== value}
              onClick={() => setFilter(value)}
              className="app-segmented-item flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded px-1"
            >
              <span className="truncate">{filterLabels[value]}</span>
              <span className="font-mono text-[10px] tabular-nums opacity-70">{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>
      {header != null ? <div className="shrink-0 px-2 pb-2">{header}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11.5px] text-muted-foreground">
            No {filter} notes.
          </p>
        ) : (
          groups.map(([filePath, notes]) => {
            const { basename, directory } = splitPath(filePath);
            return (
              <section key={filePath} aria-label={`Notes in ${filePath}`} className="mb-2">
                <h3
                  className="flex min-w-0 items-baseline gap-1.5 px-1.5 pb-1 pt-1.5 text-[11.5px]"
                  title={filePath}
                >
                  <span className="truncate font-medium text-foreground">{basename}</span>
                  {directory.length > 0 ? (
                    <span className="min-w-0 truncate text-[10.5px] text-muted-foreground">
                      {directory}
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {notes.length}
                  </span>
                </h3>
                <div className="space-y-1">
                  {notes.map((comment) => (
                    <NoteCard
                      key={comment.id}
                      comment={comment}
                      editing={editing?.id === comment.id ? editing.body : null}
                      onCancelEdit={() => cancelEdit(comment.id)}
                      onDelete={() => onDelete(comment)}
                      onEditChange={(body) => setEditing({ body, id: comment.id })}
                      onJump={() => onJump(comment)}
                      onReopen={() => onUpdate({ ...comment, status: "open" })}
                      onSave={(body) => saveEdit(comment, body)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
      {footer != null ? <div className="app-notes-footer shrink-0 p-2">{footer}</div> : null}
    </div>
  );
}

function NoteCard({
  comment,
  editing,
  onCancelEdit,
  onDelete,
  onEditChange,
  onJump,
  onReopen,
  onSave,
}: {
  comment: CommentExportRecord;
  editing: string | null;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditChange: (body: string) => void;
  onJump: () => void;
  onReopen: () => void;
  onSave: (body: string) => void;
}) {
  const status = comment.status ?? "open";
  const location = comment.scope === "file" ? "File" : `L${comment.lineNumber}`;
  return (
    <article
      data-note-id={comment.id}
      data-status={status}
      tabIndex={-1}
      className="app-note-card group rounded-md border border-border bg-background px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-h-6 min-w-0 items-center gap-1.5">
        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {location}
        </span>
        {status !== "open" ? (
          <span
            className={cn(
              "rounded px-1 py-px text-[9.5px] font-semibold uppercase",
              status === "stale" && "bg-warning-muted text-warning-foreground",
              status === "resolved" && "bg-muted text-muted-foreground",
            )}
          >
            {status}
          </span>
        ) : null}
        {editing == null ? (
          <div className="app-note-actions ml-auto flex items-center">
            <NoteAction label={`Jump to note in ${comment.filePath}`} title="Jump" onClick={onJump}>
              <CornerDownRight />
            </NoteAction>
            <NoteAction
              label={`Edit note in ${comment.filePath}`}
              title="Edit"
              onClick={() => onEditChange(comment.body)}
            >
              <Edit3 />
            </NoteAction>
            {status !== "open" ? (
              <NoteAction
                label={`Reopen note in ${comment.filePath}`}
                title="Reopen"
                onClick={onReopen}
              >
                <RotateCcw />
              </NoteAction>
            ) : null}
            <NoteAction
              label={`Delete note in ${comment.filePath}`}
              title="Delete"
              onClick={onDelete}
              destructive
            >
              <Trash2 />
            </NoteAction>
          </div>
        ) : null}
      </div>
      {editing != null ? (
        <div className="mt-1">
          <Textarea
            aria-label={`Edit note for ${comment.filePath}`}
            ref={focusTextEnd}
            className="min-h-20 resize-y text-xs"
            value={editing}
            onChange={(event) => onEditChange(event.target.value)}
            onKeyDown={(event) => {
              if (isSubmitShortcut(event.nativeEvent)) {
                event.preventDefault();
                if (editing.trim().length > 0) onSave(editing);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onCancelEdit();
              }
            }}
          />
          <div className="mt-1.5 flex items-center gap-1 text-[11px]">
            <Button
              size="xs"
              disabled={editing.trim().length === 0}
              onClick={() => onSave(editing)}
            >
              Save
            </Button>
            <Button size="xs" variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
            <ComposerHint action="save" />
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-[12px] leading-[1.45] text-foreground">
          {comment.body}
        </p>
      )}
      {status !== "open" ? (
        <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">
          {status === "stale"
            ? "The source changed and this note could not be re-anchored safely."
            : "The original source line is no longer present."}
        </p>
      ) : null}
    </article>
  );
}

function NoteAction({
  children,
  destructive = false,
  label,
  onClick,
  title,
}: {
  children: ReactNode;
  destructive?: boolean;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <Button
      aria-label={label}
      title={title}
      size="icon"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "size-6 rounded text-muted-foreground hover:text-foreground [&_svg]:size-3.5",
        destructive && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </Button>
  );
}
