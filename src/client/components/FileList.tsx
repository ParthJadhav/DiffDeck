import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronRight, MessageSquare, Search, X } from "lucide-react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { cn } from "../lib/cn.js";
import {
  buildFlatRows,
  buildTreeRows,
  collapsedAncestors,
  type FileListRow,
  formatLineCount,
  searchFiles,
  splitPath,
} from "../lib/fileListRows.js";
import { orderDiffFiles } from "../lib/fileOrder.js";
import { shouldIgnoreShortcutEvent } from "../lib/keyboard.js";
import type { FileOrder, FileViewMode } from "../lib/reviewSession.js";
import type { DiffFileSummary } from "../types.js";

export const FILE_SEARCH_INPUT_ID = "diffdeck-file-search";
const ROW_HEIGHT = 28;

export interface FileListProps {
  /** Shown under the toolbar, e.g. the active-filter notice. */
  banner?: ReactNode;
  /** Shown instead of the list when there are no files at all. */
  emptyState?: ReactNode;
  fileOrder: FileOrder;
  files: readonly DiffFileSummary[];
  mode: FileViewMode;
  noteCounts: ReadonlyMap<string, number>;
  onSelectPath: (path: string) => void;
  onViewedChange: (path: string, value: boolean) => void;
  selectedPath: string | null;
  /** Controls rendered after the search field (view mode, filters). */
  toolbarEnd?: ReactNode;
  viewedPaths: ReadonlySet<string>;
}

/**
 * The changed-file navigator. Search here only narrows this list (it is a
 * finder); review filters narrow the whole review. One roving tab stop keeps
 * the list a single Tab away, with arrows, Home/End, and Left/Right for folders.
 */
export function FileList({
  banner,
  emptyState,
  fileOrder,
  files,
  mode,
  noteCounts,
  onSelectPath,
  onViewedChange,
  selectedPath,
  toolbarEnd,
  viewedPaths,
}: FileListProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const searching = query.trim().length > 0;

  const treeOrderedFiles = useMemo(
    () => (mode === "tree" && fileOrder !== "path" ? orderDiffFiles(files, "path") : files),
    [fileOrder, files, mode],
  );
  const matchingFiles = useMemo(
    () => searchFiles(treeOrderedFiles, query),
    [query, treeOrderedFiles],
  );
  const rows = useMemo<FileListRow[]>(
    () =>
      mode === "tree"
        ? buildTreeRows(matchingFiles, searching ? new Set() : collapsed, viewedPaths)
        : buildFlatRows(matchingFiles),
    [collapsed, matchingFiles, mode, searching, viewedPaths],
  );
  const selectedIndex = useMemo(
    () => rows.findIndex((row) => row.kind === "file" && row.file.path === selectedPath),
    [rows, selectedPath],
  );
  const rovingIndex =
    focusedIndex != null && focusedIndex < rows.length ? focusedIndex : Math.max(0, selectedIndex);

  // Reveal the current file when selection moves from elsewhere (j/k, the
  // palette, scrolling the patch). Rows are read through a ref so a viewed
  // toggle or count change never yanks a list the reviewer scrolled by hand.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    if (selectedPath == null) return;
    setCollapsed((current) => {
      const hidden = collapsedAncestors(current, selectedPath);
      if (hidden.length === 0) return current;
      const next = new Set(current);
      for (const id of hidden) next.delete(id);
      return next;
    });
    const frame = window.requestAnimationFrame(() => {
      const index = rowsRef.current.findIndex(
        (row) => row.kind === "file" && row.file.path === selectedPath,
      );
      if (index >= 0) virtuosoRef.current?.scrollIntoView({ align: "center", index });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPath]);

  const focusRow = useCallback((index: number) => {
    setFocusedIndex(index);
    virtuosoRef.current?.scrollIntoView({ index });
    let attempts = 0;
    const tryFocus = () => {
      const element = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
      if (element != null) element.focus({ preventScroll: true });
      else if (attempts++ < 4) window.requestAnimationFrame(tryFocus);
    };
    window.requestAnimationFrame(tryFocus);
  }, []);

  const toggleDirectory = useCallback((id: string, value?: boolean) => {
    setCollapsed((current) => {
      const next = new Set(current);
      const collapse = value ?? !next.has(id);
      if (collapse) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (shouldIgnoreShortcutEvent(event.nativeEvent)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const index = Number((event.target as HTMLElement).dataset.rowIndex);
    if (!Number.isInteger(index)) return;
    const row = rows[index];
    if (row == null) return;

    let target: number | null = null;
    if (event.key === "ArrowDown") target = Math.min(rows.length - 1, index + 1);
    else if (event.key === "ArrowUp") target = Math.max(0, index - 1);
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = rows.length - 1;
    else if (event.key === "ArrowRight" && row.kind === "directory") {
      if (row.collapsed && !searching) toggleDirectory(row.id, false);
      else target = Math.min(rows.length - 1, index + 1);
    } else if (event.key === "ArrowLeft") {
      if (row.kind === "directory" && !row.collapsed && !searching) {
        toggleDirectory(row.id, true);
      } else {
        target = findParentRow(rows, index);
      }
    } else {
      return;
    }
    event.preventDefault();
    if (target != null && target >= 0) focusRow(target);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && rows.length > 0) {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "Enter") {
      const first = rows.find((row) => row.kind === "file");
      if (first?.kind === "file") {
        event.preventDefault();
        onSelectPath(first.file.path);
        focusRow(rows.indexOf(first));
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (query.length > 0) setQuery("");
      else event.currentTarget.blur();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 px-2">
        <label className="app-file-search group flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground">
          <Search aria-hidden="true" className="size-3.5 shrink-0" />
          <input
            id={FILE_SEARCH_INPUT_ID}
            aria-label="Search files"
            aria-keyshortcuts="/"
            autoComplete="off"
            name={FILE_SEARCH_INPUT_ID}
            placeholder="Search files"
            spellCheck={false}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setFocusedIndex(null);
            }}
            onKeyDown={handleSearchKeyDown}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {searching ? (
            <>
              <span className="font-mono text-[10.5px] tabular-nums" aria-live="polite">
                {matchingFiles.length}
              </span>
              <button
                type="button"
                aria-label="Clear file search"
                onClick={() => {
                  setQuery("");
                  document.getElementById(FILE_SEARCH_INPUT_ID)?.focus();
                }}
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </>
          ) : (
            <kbd aria-hidden="true" className="app-file-search-hint">
              /
            </kbd>
          )}
        </label>
        {toolbarEnd}
      </div>
      {banner}

      {files.length === 0 && emptyState != null ? (
        <div className="min-h-0 flex-1">{emptyState}</div>
      ) : rows.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center px-5 text-center">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">No files match “{query.trim()}”</p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Search matches any part of the path.
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={listRef}
          aria-label="Changed files"
          className="app-file-list min-h-0 flex-1"
          onKeyDown={handleListKeyDown}
          role="group"
        >
          <Virtuoso
            ref={virtuosoRef}
            data={rows}
            className="h-full"
            fixedItemHeight={ROW_HEIGHT}
            initialTopMostItemIndex={
              selectedIndex > 0 ? { align: "center", index: selectedIndex } : 0
            }
            increaseViewportBy={240}
            computeItemKey={(_index, row) => (row.kind === "file" ? row.file.path : `/${row.id}`)}
            itemContent={(index, row) =>
              row.kind === "directory" ? (
                <DirectoryRowView
                  index={index}
                  row={row}
                  searching={searching}
                  tabIndex={index === rovingIndex ? 0 : -1}
                  onFocus={() => setFocusedIndex(index)}
                  onToggle={() => toggleDirectory(row.id)}
                />
              ) : (
                <FileRowView
                  index={index}
                  mode={mode}
                  noteCount={noteCounts.get(row.file.path) ?? 0}
                  query={query}
                  row={row}
                  selected={row.file.path === selectedPath}
                  tabIndex={index === rovingIndex ? 0 : -1}
                  viewed={viewedPaths.has(row.file.path)}
                  onFocus={() => setFocusedIndex(index)}
                  onSelect={() => onSelectPath(row.file.path)}
                  onViewedChange={onViewedChange}
                />
              )
            }
          />
        </div>
      )}
    </div>
  );
}

function DirectoryRowView({
  index,
  onFocus,
  onToggle,
  row,
  searching,
  tabIndex,
}: {
  index: number;
  onFocus: () => void;
  onToggle: () => void;
  row: Extract<FileListRow, { kind: "directory" }>;
  searching: boolean;
  tabIndex: number;
}) {
  const complete = row.fileCount > 0 && row.viewedCount === row.fileCount;
  return (
    <div className="app-file-row" style={{ "--row-depth": row.depth } as React.CSSProperties}>
      <button
        type="button"
        data-row-index={index}
        tabIndex={tabIndex}
        aria-expanded={searching ? true : !row.collapsed}
        aria-label={`${row.id} folder, ${row.viewedCount} of ${row.fileCount} files viewed`}
        onClick={searching ? undefined : onToggle}
        onFocus={onFocus}
        className="app-file-row-main app-directory-row"
        title={row.id}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            !row.collapsed && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{row.label}</span>
        {complete ? (
          <Check aria-hidden="true" className="size-3 shrink-0 text-diff-added" />
        ) : (
          <span
            aria-hidden="true"
            className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
          >
            {row.viewedCount}/{row.fileCount}
          </span>
        )}
      </button>
    </div>
  );
}

function FileRowView({
  index,
  mode,
  noteCount,
  onFocus,
  onSelect,
  onViewedChange,
  query,
  row,
  selected,
  tabIndex,
  viewed,
}: {
  index: number;
  mode: FileViewMode;
  noteCount: number;
  onFocus: () => void;
  onSelect: () => void;
  onViewedChange: (path: string, value: boolean) => void;
  query: string;
  row: Extract<FileListRow, { kind: "file" }>;
  selected: boolean;
  tabIndex: number;
  viewed: boolean;
}) {
  const { file } = row;
  const { basename, directory } = splitPath(file.path);
  const status = statusGlyph(file);
  const label = [
    file.path,
    status.label,
    `${file.additions} additions`,
    `${file.deletions} deletions`,
    noteCount > 0 ? `${noteCount} ${noteCount === 1 ? "note" : "notes"}` : null,
    viewed ? "viewed" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="app-file-row"
      data-selected={selected || undefined}
      data-viewed={viewed || undefined}
      style={{ "--row-depth": row.depth } as React.CSSProperties}
    >
      <button
        type="button"
        data-row-index={index}
        tabIndex={tabIndex}
        aria-current={selected ? "true" : undefined}
        aria-label={label}
        onClick={onSelect}
        onFocus={onFocus}
        className="app-file-row-main"
        title={file.prevPath == null ? file.path : `${file.prevPath} → ${file.path}`}
      >
        <span aria-hidden="true" className={cn("app-file-status", status.className)}>
          {status.letter}
        </span>
        <span className="app-file-name min-w-0 truncate">
          <Highlight text={basename} query={query} />
        </span>
        {mode === "list" && directory.length > 0 ? (
          <span className="app-file-dir min-w-0 flex-1 truncate">{directory}</span>
        ) : (
          <span className="flex-1" />
        )}
        {noteCount > 0 ? (
          <span aria-hidden="true" className="app-file-notes">
            <MessageSquare className="size-3" />
            {noteCount}
          </span>
        ) : null}
        <span aria-hidden="true" className="app-file-stat">
          {file.additions > 0 ? (
            <span className="text-diff-added">+{formatLineCount(file.additions)}</span>
          ) : null}
          {file.deletions > 0 ? (
            <span className="text-diff-deleted">−{formatLineCount(file.deletions)}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Mark ${file.path} ${viewed ? "unviewed" : "viewed"}`}
        aria-pressed={viewed}
        title={viewed ? "Viewed — click to unmark (V)" : "Mark viewed (V)"}
        onClick={() => onViewedChange(file.path, !viewed)}
        className="app-file-viewed"
      >
        {viewed ? <Check aria-hidden="true" strokeWidth={3} /> : null}
      </button>
    </div>
  );
}

function Highlight({ query, text }: { query: string; text: string }) {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return text;
  const start = text.toLocaleLowerCase().indexOf(normalized);
  if (start === -1) return text;
  const end = start + normalized.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="app-file-match">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function findParentRow(rows: readonly FileListRow[], index: number): number | null {
  const depth = rows[index]?.depth ?? 0;
  if (depth === 0) return null;
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    const row = rows[candidate]!;
    if (row.kind === "directory" && row.depth < depth) return candidate;
  }
  return null;
}

const statusGlyphs: Record<string, { className: string; label: string; letter: string }> = {
  added: { className: "text-diff-added", label: "added", letter: "A" },
  copied: { className: "text-diff-renamed", label: "copied", letter: "C" },
  deleted: { className: "text-diff-deleted", label: "deleted", letter: "D" },
  ignored: { className: "text-muted-foreground", label: "ignored", letter: "I" },
  modified: { className: "text-diff-modified", label: "modified", letter: "M" },
  renamed: { className: "text-diff-renamed", label: "renamed", letter: "R" },
  untracked: { className: "text-diff-added", label: "untracked", letter: "U" },
};

function statusGlyph(file: DiffFileSummary) {
  if (file.hasMergeConflicts === true) {
    return { className: "text-warning-foreground", label: "merge conflict", letter: "!" };
  }
  return (
    statusGlyphs[file.gitStatus] ?? {
      className: "text-muted-foreground",
      label: file.gitStatus,
      letter: "•",
    }
  );
}
