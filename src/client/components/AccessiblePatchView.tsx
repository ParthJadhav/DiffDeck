import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Link,
  MessageSquarePlus,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { buildAccessiblePatchRows, type AccessiblePatchRow } from "../lib/accessiblePatch.js";
import { buildCommentContext, type CommentExportRecord } from "../lib/commentExport.js";
import { copyTextToClipboard } from "../lib/clipboard.js";
import { buildDiffDeepLink, hasCapabilityToken, readDiffLocation } from "../lib/deepLink.js";
import { cn } from "../lib/cn.js";
import type { ReviewAnnotation } from "../lib/reviewSession.js";
import type { DiffFileSummary } from "../types.js";
import { createCommentAnnotation } from "./diff/commentAnnotationModel.js";
import { Button } from "./ui/button.js";
import { Textarea } from "./ui/textarea.js";

const MAX_ACCESSIBLE_ROWS = 2_000;

export function AccessiblePatchView({
  comments,
  error,
  file,
  fileDiff,
  onAnnotationsChange,
  onCommentSaved,
  onRetry,
  onReturnToRich,
}: {
  comments: readonly CommentExportRecord[];
  error?: string;
  file: DiffFileSummary;
  fileDiff?: FileDiffMetadata;
  onAnnotationsChange: (
    path: string,
    updater: (current: ReviewAnnotation[]) => ReviewAnnotation[],
  ) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onRetry: (path: string) => void;
  onReturnToRich: () => void;
}) {
  const allRows = useMemo(
    () => (fileDiff == null ? [] : buildAccessiblePatchRows(fileDiff)),
    [fileDiff],
  );
  const rows = useMemo(() => allRows.slice(0, MAX_ACCESSIBLE_ROWS), [allRows]);
  const changedRows = useMemo(
    () =>
      rows.filter(
        (row): row is Extract<AccessiblePatchRow, { kind: "addition" | "deletion" }> =>
          row.kind === "addition" || row.kind === "deletion",
      ),
    [rows],
  );
  const [currentChange, setCurrentChange] = useState(-1);
  const [composer, setComposer] = useState<{ body: string; key: string } | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    const location = readDiffLocation(window.location.href);
    const index = changedRows.findIndex(
      (row) =>
        location.file === file.path &&
        location.side === row.side &&
        location.line === lineForChangedRow(row),
    );
    setCurrentChange(index);
    setComposer(null);
  }, [changedRows, file.path]);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [file.path]);

  const focusChange = useCallback(
    (index: number) => {
      const row = changedRows[index];
      if (row == null) return;
      setCurrentChange(index);
      const line = lineForChangedRow(row);
      window.history.replaceState(
        null,
        "",
        buildDiffDeepLink(window.location.href, file.path, { line, side: row.side }),
      );
      window.dispatchEvent(
        new CustomEvent("diffdeck:line-selected", {
          detail: { line, path: file.path, side: row.side },
        }),
      );
      window.requestAnimationFrame(() => {
        const element = rowRefs.current.get(row.key);
        element?.scrollIntoView({ block: "center" });
        element?.focus({ preventScroll: true });
      });
    },
    [changedRows, file.path],
  );

  useEffect(() => {
    const openFirstChangeComposer = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== file.path) return;
      const first = changedRows[0];
      if (first == null) return;
      setComposer({ body: "", key: first.key });
      focusChange(0);
    };
    window.addEventListener("diffdeck:add-comment", openFirstChangeComposer);
    return () => window.removeEventListener("diffdeck:add-comment", openFirstChangeComposer);
  }, [changedRows, file.path, focusChange]);

  const nextIndex =
    changedRows.length === 0
      ? -1
      : currentChange < 0
        ? 0
        : Math.min(changedRows.length - 1, currentChange + 1);
  const previousIndex = currentChange <= 0 ? -1 : currentChange - 1;

  useEffect(() => {
    const navigateByKeyboard = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === "]" && nextIndex !== -1 && nextIndex !== currentChange) {
        event.preventDefault();
        focusChange(nextIndex);
      } else if (event.key === "[" && previousIndex !== -1) {
        event.preventDefault();
        focusChange(previousIndex);
      }
    };
    window.addEventListener("keydown", navigateByKeyboard);
    return () => window.removeEventListener("keydown", navigateByKeyboard);
  }, [currentChange, focusChange, nextIndex, previousIndex]);

  const copyLineLink = async (row: Extract<AccessiblePatchRow, { side: string }>) => {
    const href = window.location.href;
    try {
      await copyTextToClipboard(
        buildDiffDeepLink(href, file.path, {
          line: lineForChangedRow(row),
          side: row.side,
        }),
      );
      toast.success("Copied link to changed line", {
        description: hasCapabilityToken(href)
          ? "This remote-mode link contains the access token. Treat it as a secret."
          : undefined,
      });
    } catch {
      toast.error("Unable to copy the changed-line link");
    }
  };

  const saveComment = (row: Extract<AccessiblePatchRow, { side: string }>) => {
    if (fileDiff == null || composer == null) return;
    const body = composer.body.trim();
    if (body.length === 0) return;
    const lineNumber = lineForChangedRow(row);
    const draft = createCommentAnnotation(row.side, lineNumber);
    const saved: ReviewAnnotation = {
      ...draft,
      metadata: { ...draft.metadata, body, kind: "comment" },
    };
    onAnnotationsChange(file.path, (current) => [...current, saved]);
    onCommentSaved({
      body,
      contextLines: buildCommentContext({
        fileDiff,
        lineNumber,
        side: row.side,
        unresolvedFile: null,
      }),
      filePath: file.path,
      id: saved.metadata.id,
      lineNumber,
      scope: "line",
      side: row.side,
    });
    setComposer(null);
    toast.success("Added review note");
  };

  return (
    <main
      ref={mainRef}
      id="main"
      aria-label={`Accessible patch for ${file.path}`}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
      tabIndex={-1}
    >
      <header className="z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur-sm">
        <Button onClick={onReturnToRich} size="sm" variant="outline">
          <ArrowLeft aria-hidden="true" />
          Rich diff
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-xs font-semibold" title={file.path}>
            {file.path}
          </h1>
          <p className="text-[10.5px] text-muted-foreground">
            Linear unified patch · {changedRows.length} rendered changed lines
          </p>
        </div>
        <nav aria-label="Changed line navigation" className="flex items-center gap-1">
          <Button
            aria-label="Previous changed line, shortcut left bracket"
            disabled={previousIndex === -1}
            onClick={() => focusChange(previousIndex)}
            size="sm"
            title="Previous changed line ([)"
            variant="outline"
          >
            <ArrowUp aria-hidden="true" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <Button
            aria-label="Next changed line, shortcut right bracket"
            disabled={nextIndex === -1 || nextIndex === currentChange}
            onClick={() => focusChange(nextIndex)}
            size="sm"
            title="Next changed line (])"
            variant="outline"
          >
            <ArrowDown aria-hidden="true" />
            <span className="hidden sm:inline">Next</span>
          </Button>
        </nav>
      </header>

      {file.isBinary === true || file.hasMergeConflicts === true ? (
        <AccessibleUnavailable
          message={
            file.isBinary === true
              ? "Binary files do not have a textual unified patch."
              : "Conflict resolution content does not have a trustworthy two-sided patch."
          }
          onReturn={onReturnToRich}
        />
      ) : error != null ? (
        <div role="alert" className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div className="max-w-md space-y-3">
            <TriangleAlert aria-hidden="true" className="mx-auto size-6 text-destructive" />
            <p className="text-sm font-medium">Unable to load the accessible patch</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button onClick={() => onRetry(file.path)} size="sm" variant="outline">
              Retry
            </Button>
          </div>
        </div>
      ) : fileDiff == null ? (
        <div
          role="status"
          className="grid min-h-0 flex-1 place-items-center p-6 text-xs text-muted-foreground"
        >
          Loading linear patch…
        </div>
      ) : rows.length === 0 ? (
        <AccessibleUnavailable
          message="This file change has no textual hunks to present."
          onReturn={onReturnToRich}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {allRows.length > rows.length ? (
            <div
              role="status"
              className="sticky top-0 z-10 flex gap-2 border-b border-amber-500/30 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
            >
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Showing the first {rows.length.toLocaleString()} of{" "}
                {allRows.length.toLocaleString()} patch rows to keep assistive reading responsive.
                Use the rich diff for the remainder.
              </span>
            </div>
          ) : null}
          <div
            aria-hidden="true"
            className="grid grid-cols-[1.5rem_3.5rem_3.5rem_minmax(0,1fr)] border-b border-border bg-muted/40 px-2 py-1 font-mono text-[9px] uppercase text-muted-foreground"
          >
            <span>Type</span>
            <span>Old</span>
            <span>New</span>
            <span>Content</span>
          </div>
          <ol aria-label={`Unified patch lines for ${file.path}`} className="m-0 list-none p-0">
            {rows.map((row) => {
              if (row.kind === "hunk") {
                return (
                  <li
                    key={row.key}
                    className="border-y border-border bg-accent/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
                  >
                    <span className="sr-only">Hunk header: </span>
                    {row.content}
                  </li>
                );
              }
              const changed = row.kind === "addition" || row.kind === "deletion";
              const line = changed ? lineForChangedRow(row) : null;
              let rowComments: CommentExportRecord[] = [];
              if (row.kind === "addition" || row.kind === "deletion") {
                rowComments = comments.filter(
                  (comment) =>
                    comment.filePath === file.path &&
                    (comment.scope ?? "line") === "line" &&
                    comment.side === row.side &&
                    comment.lineNumber === line,
                );
              }
              return (
                <li
                  key={row.key}
                  ref={(element) => {
                    if (element == null) rowRefs.current.delete(row.key);
                    else rowRefs.current.set(row.key, element);
                  }}
                  data-accessible-patch-row={row.key}
                  tabIndex={-1}
                  className={cn(
                    "group border-b border-border/60 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    row.kind === "addition" && "bg-diff-added/8",
                    row.kind === "deletion" && "bg-diff-deleted/8",
                  )}
                >
                  <span className="sr-only">{announceRow(row)}</span>
                  <div
                    aria-hidden="true"
                    className="grid min-h-7 grid-cols-[1.5rem_3.5rem_3.5rem_minmax(0,1fr)] items-start px-2 font-mono text-[11px] leading-7"
                  >
                    <span
                      className={cn(
                        row.kind === "addition" && "text-diff-added",
                        row.kind === "deletion" && "text-diff-deleted",
                      )}
                    >
                      {prefixForRow(row)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{row.oldLine ?? ""}</span>
                    <span className="text-muted-foreground tabular-nums">{row.newLine ?? ""}</span>
                    <code className="min-w-0 overflow-x-auto whitespace-pre pr-2">
                      {row.content || " "}
                    </code>
                  </div>
                  {changed ? (
                    <div className="flex flex-wrap items-center gap-1 border-t border-border/40 px-2 py-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setComposer({ body: "", key: row.key })}
                      >
                        <MessageSquarePlus aria-hidden="true" />
                        Comment{rowComments.length > 0 ? ` (${rowComments.length})` : ""}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => void copyLineLink(row)}>
                        <Link aria-hidden="true" />
                        Copy link
                      </Button>
                    </div>
                  ) : null}
                  {changed && rowComments.length > 0 ? (
                    <aside
                      aria-label={`Review notes for ${row.side === "additions" ? "new" : "old"} line ${line}`}
                      className="space-y-1 border-t border-border bg-muted/25 px-2 py-1.5"
                    >
                      {rowComments.map((comment) => (
                        <article
                          key={comment.id}
                          className="rounded-md border border-border bg-background px-2 py-1.5"
                        >
                          <p className="whitespace-pre-wrap text-[11px] leading-4 text-foreground">
                            {comment.body}
                          </p>
                          <p className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                            {comment.status ?? "open"} note
                          </p>
                        </article>
                      ))}
                    </aside>
                  ) : null}
                  {changed && composer?.key === row.key ? (
                    <div className="border-t border-border bg-background p-2">
                      <label className="text-[11px] font-medium">
                        Comment on {row.side === "additions" ? "new" : "old"} line{" "}
                        {lineForChangedRow(row)}
                        <Textarea
                          autoFocus
                          className="mt-1 min-h-20 resize-y text-xs"
                          onChange={(event) =>
                            setComposer({ body: event.target.value, key: row.key })
                          }
                          placeholder="What should change?"
                          value={composer.body}
                        />
                      </label>
                      <div className="mt-1.5 flex gap-1">
                        <Button
                          disabled={composer.body.trim().length === 0}
                          onClick={() => saveComment(row)}
                          size="xs"
                        >
                          Add note
                        </Button>
                        <Button onClick={() => setComposer(null)} size="xs" variant="ghost">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <output className="sr-only" aria-live="polite">
        {currentChange >= 0
          ? `Changed line ${currentChange + 1} of ${changedRows.length}`
          : "No changed line selected"}
      </output>
    </main>
  );
}

function AccessibleUnavailable({ message, onReturn }: { message: string; onReturn: () => void }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
      <div className="max-w-md space-y-3">
        <p className="text-sm font-medium">Linear patch unavailable</p>
        <p className="text-xs leading-5 text-muted-foreground">{message}</p>
        <Button onClick={onReturn} size="sm" variant="outline">
          Return to rich diff
        </Button>
      </div>
    </div>
  );
}

function lineForChangedRow(row: Extract<AccessiblePatchRow, { side: string }>): number {
  return row.side === "additions" ? row.newLine! : row.oldLine!;
}

function prefixForRow(row: Exclude<AccessiblePatchRow, { kind: "hunk" }>): string {
  if (row.kind === "addition") return "+";
  if (row.kind === "deletion") return "−";
  return " ";
}

function announceRow(row: Exclude<AccessiblePatchRow, { kind: "hunk" }>): string {
  if (row.kind === "addition") return `Addition, new line ${row.newLine}: ${row.content}`;
  if (row.kind === "deletion") return `Deletion, old line ${row.oldLine}: ${row.content}`;
  return `Context, old line ${row.oldLine}, new line ${row.newLine}: ${row.content}`;
}
