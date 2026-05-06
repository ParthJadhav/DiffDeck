import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileDiff,
  UnresolvedFile,
  type FileContents,
  type FileDiffMetadata,
} from "@pierre/diffs/react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AnnotationSide, SelectedLineRange } from "@pierre/diffs";
import { customHunkSeparatorCSS, stickyFileHeaderCSS } from "../lib/constants.js";
import { fetchJson } from "../lib/api.js";
import { buildCommentContext, type CommentExportRecord } from "../lib/commentExport.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "../lib/uiTypes.js";
import type { DiffFileSummary } from "../types.js";
import {
  CommentAnnotationView,
  createCommentAnnotation,
  patchAnnotationMeta,
  type CommentAnnotation,
} from "./diff/CommentAnnotation.js";
import { CustomFileHeader } from "./diff/CustomFileHeader.js";
import { HeavyFileDiff } from "./diff/HeavyFileDiff.js";
import { installHunkExpansionFallback } from "./diff/hunkExpansionFallback.js";
import type { AgentQueueItem } from "../hooks/useAgentQueue.js";

export interface DiffWorkspaceProps {
  clearCommentsSignal: number;
  collapsedFilePaths: ReadonlySet<string>;
  diffStyle: DiffLayout;
  disableBackground: boolean;
  expandUnchanged: boolean;
  files: DiffFileSummary[];
  fileDiffs: Record<string, FileDiffMetadata>;
  hunkSeparators: HunkSeparatorMode;
  onCollapsedFileChange: (path: string, value: boolean) => void;
  onCommentDeleted: (id: string) => void;
  onCommentAgentCancel: (id: string) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onRequestFileDiff: (path: string) => void;
  onViewedFileChange: (path: string, value: boolean) => void;
  onVisiblePathChange: (path: string) => void;
  comments: CommentExportRecord[];
  optimisticQueueingIds?: ReadonlySet<string>;
  queueItemsByCommentId: ReadonlyMap<string, AgentQueueItem>;
  overflow: OverflowMode;
  scrollSignal: number;
  selectedFile: DiffFileSummary | null;
  selectedPath: string | null;
  showLineNumbers: boolean;
  themeType: ThemeChoice;
  viewedFilePaths: ReadonlySet<string>;
}

export function DiffWorkspace(props: DiffWorkspaceProps) {
  const {
    clearCommentsSignal,
    collapsedFilePaths,
    diffStyle,
    disableBackground,
    expandUnchanged,
    files,
    fileDiffs,
    hunkSeparators,
    onCollapsedFileChange,
    onCommentDeleted,
    onCommentAgentCancel,
    onCommentSaved,
    onRequestFileDiff,
    onViewedFileChange,
    onVisiblePathChange,
    comments,
    optimisticQueueingIds,
    queueItemsByCommentId,
    overflow,
    scrollSignal,
    selectedFile,
    selectedPath,
    showLineNumbers,
    themeType,
    viewedFilePaths,
  } = props;

  const diffOptions = useMemo(
    () => ({
      collapsedContextThreshold: 1,
      diffStyle,
      disableBackground,
      disableLineNumbers: !showLineNumbers,
      enableGutterUtility: true,
      enableLineSelection: true,
      expandUnchanged,
      hunkSeparators: hunkSeparators === "custom" ? "line-info-basic" : hunkSeparators,
      unsafeCSS: [stickyFileHeaderCSS, hunkSeparators === "custom" && customHunkSeparatorCSS]
        .filter(Boolean)
        .join("\n"),
      expansionLineCount: hunkSeparators === "custom" ? 5 : 100,
      lineHoverHighlight: "both" as const,
      onPostRender: installHunkExpansionFallback,
      overflow,
      themeType,
    }),
    [
      diffStyle,
      disableBackground,
      expandUnchanged,
      hunkSeparators,
      overflow,
      showLineNumbers,
      themeType,
    ],
  );

  if (selectedFile == null) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="flex h-full min-h-0 min-w-0 flex-col bg-background focus:outline-none"
      >
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-sm space-y-3">
            <h1 className="text-xl font-semibold text-foreground">No diff to render</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Run the CLI inside a repository with pending changes, or pass{" "}
              <code className="font-mono text-foreground/80" translate="no">
                git diff
              </code>{" "}
              arguments to compare revisions.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background focus:outline-none"
    >
      <section className="min-h-0 min-w-0 flex-1">
        <MultiFileScroller
          clearCommentsSignal={clearCommentsSignal}
          diffOptions={diffOptions}
          collapsedFilePaths={collapsedFilePaths}
          fileDiffs={fileDiffs}
          files={files}
          onCollapsedFileChange={onCollapsedFileChange}
          onCommentDeleted={onCommentDeleted}
          onCommentAgentCancel={onCommentAgentCancel}
          onCommentSaved={onCommentSaved}
          onRequestFileDiff={onRequestFileDiff}
          onViewedFileChange={onViewedFileChange}
          onVisiblePathChange={onVisiblePathChange}
          comments={comments}
          optimisticQueueingIds={optimisticQueueingIds}
          queueItemsByCommentId={queueItemsByCommentId}
          scrollSignal={scrollSignal}
          selectedPath={selectedPath}
          viewedFilePaths={viewedFilePaths}
        />
      </section>
    </main>
  );
}

const VIRTUOSO_OVERSCAN_PX = 1200;
const VIRTUOSO_INCREASE_VIEWPORT_PX = 600;
const VIRTUOSO_MIN_ITEM_HEIGHT_PX = 40;
const EMPTY_ANNOTATIONS: CommentAnnotation[] = [];

const computeItemKey = (_index: number, file: DiffFileSummary) => file.path;
const measureFileItem = (element: HTMLElement) =>
  Math.max(
    element.getBoundingClientRect().height,
    element.offsetHeight,
    VIRTUOSO_MIN_ITEM_HEIGHT_PX,
  );

type CommentAnnotationsByFile = Record<string, CommentAnnotation[]>;
type SelectedLinesByFile = Record<string, SelectedLineRange | null>;

function MultiFileScroller(props: {
  clearCommentsSignal: number;
  collapsedFilePaths: ReadonlySet<string>;
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  fileDiffs: Record<string, FileDiffMetadata>;
  files: DiffFileSummary[];
  onCollapsedFileChange: (path: string, value: boolean) => void;
  onCommentDeleted: (id: string) => void;
  onCommentAgentCancel: (id: string) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onRequestFileDiff: (path: string) => void;
  onViewedFileChange: (path: string, value: boolean) => void;
  onVisiblePathChange: (path: string) => void;
  comments: CommentExportRecord[];
  optimisticQueueingIds?: ReadonlySet<string>;
  queueItemsByCommentId: ReadonlyMap<string, AgentQueueItem>;
  scrollSignal: number;
  selectedPath: string | null;
  viewedFilePaths: ReadonlySet<string>;
}) {
  const {
    clearCommentsSignal,
    collapsedFilePaths,
    diffOptions,
    fileDiffs,
    files,
    onCollapsedFileChange,
    onCommentDeleted,
    onCommentAgentCancel,
    onCommentSaved,
    onRequestFileDiff,
    onViewedFileChange,
    onVisiblePathChange,
    comments,
    optimisticQueueingIds,
    queueItemsByCommentId,
    scrollSignal,
    selectedPath,
    viewedFilePaths,
  } = props;

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null);
  const lastReportedPathRef = useRef<string | null>(null);
  const suppressObserverUntilRef = useRef(0);
  const pinnedPathRef = useRef<string | null>(null);
  const onVisiblePathChangeRef = useRef(onVisiblePathChange);
  onVisiblePathChangeRef.current = onVisiblePathChange;
  const onRequestFileDiffRef = useRef(onRequestFileDiff);
  onRequestFileDiffRef.current = onRequestFileDiff;
  const filesRef = useRef(files);
  filesRef.current = files;
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const fileIndexByPath = useMemo(
    () => new Map(files.map((file, index) => [file.path, index])),
    [files],
  );

  // Per-file UI state lives here, not inside FileDiffSection, so a row that
  // scrolls out of the virtualized window doesn't lose its selection or its
  // half-typed comment when it remounts.
  const [commentAnnotations, setCommentAnnotations] = useState<CommentAnnotationsByFile>({});
  const [selectedLines, setSelectedLines] = useState<SelectedLinesByFile>({});

  const handleAnnotationsChange = useCallback(
    (path: string, updater: (current: CommentAnnotation[]) => CommentAnnotation[]) => {
      setCommentAnnotations((current) => {
        const previous = current[path] ?? EMPTY_ANNOTATIONS;
        const next = updater(previous);
        if (next === previous) return current;
        if (next.length === 0) {
          if (!(path in current)) return current;
          const { [path]: _removed, ...rest } = current;
          return rest;
        }
        return { ...current, [path]: next };
      });
    },
    [],
  );

  const handleSelectedLinesChange = useCallback((path: string, range: SelectedLineRange | null) => {
    setSelectedLines((current) => {
      if (current[path] === range) return current;
      if (range == null) {
        if (!(path in current)) return current;
        const { [path]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [path]: range };
    });
  }, []);

  // When `files` changes (user re-ran `git diff` against a different
  // revision) drop UI state for paths that no longer exist; otherwise
  // stale annotations leak indefinitely.
  useEffect(() => {
    setCommentAnnotations((current) => pruneByKey(current, filesByPath));
    setSelectedLines((current) => pruneByKey(current, filesByPath));
  }, [filesByPath]);

  useEffect(() => {
    const savedByFile = groupCommentsByFile(comments, filesByPath);
    setCommentAnnotations((current) => mergeSavedComments(current, savedByFile));
  }, [comments, filesByPath]);

  const lastClearSignalRef = useRef(clearCommentsSignal);
  useEffect(() => {
    if (lastClearSignalRef.current === clearCommentsSignal) return;
    lastClearSignalRef.current = clearCommentsSignal;
    setCommentAnnotations({});
  }, [clearCommentsSignal]);

  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    const currentFiles = filesRef.current;
    for (let i = range.startIndex; i <= range.endIndex; i++) {
      const file = currentFiles[i];
      if (file == null) continue;
      if (file.hasMergeConflicts === true || file.isBinary === true) continue;
      onRequestFileDiffRef.current(file.path);
    }
  }, []);

  useEffect(() => {
    const root = scrollerEl;
    if (root == null) return;
    const visibility = new Map<string, Element>();
    const observed = new WeakSet<Element>();
    const ABOVE_THRESHOLD = 24;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const path = (entry.target as HTMLElement).dataset.filePath;
          if (path == null) continue;
          if (entry.isIntersecting) {
            visibility.set(path, entry.target);
          } else {
            visibility.delete(path);
          }
        }
        if (performance.now() < suppressObserverUntilRef.current) {
          return;
        }
        if (pinnedPathRef.current != null && visibility.has(pinnedPathRef.current)) {
          if (lastReportedPathRef.current !== pinnedPathRef.current) {
            lastReportedPathRef.current = pinnedPathRef.current;
            onVisiblePathChangeRef.current(pinnedPathRef.current);
          }
          return;
        }
        pinnedPathRef.current = null;
        const rootTop = root.getBoundingClientRect().top;
        let above: { path: string; top: number } | null = null;
        let below: { path: string; top: number } | null = null;
        for (const [path, node] of visibility) {
          const top = node.getBoundingClientRect().top - rootTop;
          if (top <= ABOVE_THRESHOLD) {
            if (above == null || top > above.top) above = { path, top };
          } else {
            if (below == null || top < below.top) below = { path, top };
          }
        }
        const best = above ?? below;
        if (best != null && best.path !== lastReportedPathRef.current) {
          lastReportedPathRef.current = best.path;
          onVisiblePathChangeRef.current(best.path);
        }
      },
      { root, threshold: 0 },
    );
    const adopt = (target: Element) => {
      const candidates = target.matches?.("[data-file-path]")
        ? [target]
        : Array.from(target.querySelectorAll<HTMLElement>("[data-file-path]"));
      for (const node of candidates) {
        if (!observed.has(node)) {
          observed.add(node);
          intersectionObserver.observe(node);
        }
      }
    };
    adopt(root);
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) adopt(node);
        }
      }
    });
    mutationObserver.observe(root, { childList: true, subtree: true });
    return () => {
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [scrollerEl]);

  const handledScrollSignalRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedPath == null) return;
    if (handledScrollSignalRef.current === scrollSignal) return;
    const index = fileIndexByPath.get(selectedPath);
    if (index == null) return;
    handledScrollSignalRef.current = scrollSignal;
    lastReportedPathRef.current = selectedPath;
    pinnedPathRef.current = selectedPath;
    suppressObserverUntilRef.current = performance.now() + 350;
    virtuosoRef.current?.scrollToIndex({ index, align: "start" });

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      pinnedPathRef.current = null;
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("keydown", release);
    };
    window.addEventListener("wheel", release, { passive: true, once: true });
    window.addEventListener("touchstart", release, { passive: true, once: true });
    window.addEventListener("keydown", release, { once: true });
    const timer = window.setTimeout(release, 1500);
    return () => {
      window.clearTimeout(timer);
      release();
    };
  }, [fileIndexByPath, scrollSignal, selectedPath]);

  // The selected file may sit outside the rendered range (e.g. user clicked
  // deep in the sidebar before Virtuoso has scrolled there), so kick off the
  // fetch regardless of mount state.
  useEffect(() => {
    const selectedFile = selectedPath == null ? null : filesByPath.get(selectedPath);
    if (
      selectedPath != null &&
      selectedFile?.hasMergeConflicts !== true &&
      selectedFile?.isBinary !== true
    ) {
      onRequestFileDiffRef.current(selectedPath);
    }
  }, [filesByPath, selectedPath]);

  const itemContent = useCallback(
    (_index: number, file: DiffFileSummary) => (
      <div
        data-file-path={file.path}
        className="app-file-card m-2.5 scroll-mt-2.5 overflow-clip rounded-lg"
      >
        <FileDiffSection
          collapsed={collapsedFilePaths.has(file.path)}
          commentAnnotations={commentAnnotations[file.path] ?? EMPTY_ANNOTATIONS}
          diffOptions={diffOptions}
          file={file}
          fileDiff={fileDiffs[file.path] ?? null}
          onAnnotationsChange={handleAnnotationsChange}
          onCollapsedChange={onCollapsedFileChange}
          onCommentDeleted={onCommentDeleted}
          onCommentAgentCancel={onCommentAgentCancel}
          onCommentSaved={onCommentSaved}
          optimisticQueueingIds={optimisticQueueingIds}
          queueItemsByCommentId={queueItemsByCommentId}
          onSelectedLinesChange={handleSelectedLinesChange}
          onViewedChange={onViewedFileChange}
          selectedLines={selectedLines[file.path] ?? null}
          viewed={viewedFilePaths.has(file.path)}
        />
      </div>
    ),
    [
      collapsedFilePaths,
      commentAnnotations,
      diffOptions,
      fileDiffs,
      handleAnnotationsChange,
      handleSelectedLinesChange,
      onCollapsedFileChange,
      onCommentDeleted,
      onCommentAgentCancel,
      onCommentSaved,
      optimisticQueueingIds,
      queueItemsByCommentId,
      onViewedFileChange,
      selectedLines,
      viewedFilePaths,
    ],
  );

  // Virtuoso re-passes the same scroller element across renders; without
  // memoizing this callback the scrollerEl state would null-then-set on each
  // render and feedback-loop with the visible-path observer effect.
  const handleScrollerRef = useCallback((ref: HTMLElement | Window | null) => {
    setScrollerEl(ref instanceof HTMLElement ? ref : null);
  }, []);

  return (
    <Virtuoso<DiffFileSummary>
      ref={virtuosoRef}
      data={files}
      itemContent={itemContent}
      computeItemKey={computeItemKey}
      defaultItemHeight={VIRTUOSO_MIN_ITEM_HEIGHT_PX}
      rangeChanged={handleRangeChanged}
      itemSize={measureFileItem}
      overscan={VIRTUOSO_OVERSCAN_PX}
      increaseViewportBy={VIRTUOSO_INCREASE_VIEWPORT_PX}
      scrollerRef={handleScrollerRef}
      className="app-virtuoso h-full"
    />
  );
}

function pruneByKey<T>(
  record: Record<string, T>,
  keep: ReadonlyMap<string, unknown>,
): Record<string, T> {
  let changed = false;
  const next: Record<string, T> = {};
  for (const path of Object.keys(record)) {
    if (keep.has(path)) {
      next[path] = record[path];
    } else {
      changed = true;
    }
  }
  return changed ? next : record;
}

// Group saved comments by file path, skipping files no longer in the diff.
function groupCommentsByFile(
  comments: readonly CommentExportRecord[],
  filesByPath: ReadonlyMap<string, unknown>,
): Map<string, Map<string, CommentExportRecord>> {
  const result = new Map<string, Map<string, CommentExportRecord>>();
  for (const comment of comments) {
    if (!filesByPath.has(comment.filePath)) continue;
    let byId = result.get(comment.filePath);
    if (byId == null) {
      byId = new Map();
      result.set(comment.filePath, byId);
    }
    byId.set(comment.id, comment);
  }
  return result;
}

// Merge saved comments into a file's annotations. Consumed entries are removed
// from `savedById` so the caller can append leftovers as new annotations.
function reconcileFileAnnotations(
  existing: readonly CommentAnnotation[],
  savedById: Map<string, CommentExportRecord>,
): { annotations: CommentAnnotation[]; changed: boolean } {
  const annotations: CommentAnnotation[] = [];
  let changed = false;

  for (const annotation of existing) {
    if (annotation.metadata.kind !== "comment") {
      annotations.push(annotation);
      continue;
    }
    const saved = savedById.get(annotation.metadata.id);
    if (saved == null) {
      changed = true;
      continue;
    }
    const same =
      annotation.metadata.body === saved.body &&
      annotation.side === saved.side &&
      annotation.lineNumber === saved.lineNumber;
    if (same) {
      annotations.push(annotation);
    } else {
      changed = true;
      annotations.push({
        ...annotation,
        side: saved.side,
        lineNumber: saved.lineNumber,
        metadata: {
          ...annotation.metadata,
          body: saved.body,
          kind: "comment",
          previousBody: undefined,
        },
      });
    }
    savedById.delete(annotation.metadata.id);
  }

  for (const saved of savedById.values()) {
    changed = true;
    annotations.push({
      side: saved.side,
      lineNumber: saved.lineNumber,
      metadata: {
        body: saved.body,
        id: saved.id,
        kind: "comment",
      },
    });
  }

  return { annotations, changed };
}

// Merge the saved-comments snapshot into the current per-file annotation map,
// returning the previous reference when nothing actually changed so React can
// bail out of the state update.
function mergeSavedComments(
  current: CommentAnnotationsByFile,
  savedByFile: Map<string, Map<string, CommentExportRecord>>,
): CommentAnnotationsByFile {
  let changed = false;
  const next: CommentAnnotationsByFile = {};
  const allPaths = new Set<string>([...Object.keys(current), ...savedByFile.keys()]);

  for (const path of allPaths) {
    const existing = current[path] ?? EMPTY_ANNOTATIONS;
    const savedById = savedByFile.get(path) ?? new Map<string, CommentExportRecord>();
    const { annotations, changed: fileChanged } = reconcileFileAnnotations(existing, savedById);
    if (fileChanged) changed = true;
    if (annotations.length > 0) {
      next[path] = annotations;
    }
  }

  return changed ? next : current;
}

// Files at or above this changed-line count freeze the main thread for several
// seconds inside @pierre/diffs (its virtualizer doesn't actually window the
// DOM render for these — every line gets a node, e.g. ~84k DOM nodes for a
// 24k-line yarn.lock diff). For files at this scale we swap in a custom
// windowed renderer that only mounts the rows currently in view, trading
// syntax highlighting / line-level features for a responsive UI.
const HEAVY_DIFF_LINE_THRESHOLD = 2000;

const FileDiffSection = memo(function FileDiffSection({
  collapsed,
  commentAnnotations,
  diffOptions,
  file,
  fileDiff,
  onAnnotationsChange,
  onCollapsedChange,
  onCommentDeleted,
  onCommentAgentCancel,
  onCommentSaved,
  onSelectedLinesChange,
  onViewedChange,
  optimisticQueueingIds,
  queueItemsByCommentId,
  selectedLines,
  viewed,
}: {
  collapsed: boolean;
  commentAnnotations: CommentAnnotation[];
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  file: DiffFileSummary;
  fileDiff: FileDiffMetadata | null;
  onAnnotationsChange: (
    path: string,
    updater: (current: CommentAnnotation[]) => CommentAnnotation[],
  ) => void;
  onCollapsedChange: (path: string, value: boolean) => void;
  onCommentDeleted: (id: string) => void;
  onCommentAgentCancel: (id: string) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onSelectedLinesChange: (path: string, range: SelectedLineRange | null) => void;
  onViewedChange: (path: string, value: boolean) => void;
  optimisticQueueingIds?: ReadonlySet<string>;
  queueItemsByCommentId: ReadonlyMap<string, AgentQueueItem>;
  selectedLines: SelectedLineRange | null;
  viewed: boolean;
}) {
  const [unresolvedFile, setUnresolvedFile] = useState<FileContents | null>(null);
  const [unresolvedError, setUnresolvedError] = useState<string | null>(null);
  const [unresolvedLoading, setUnresolvedLoading] = useState(false);

  const isHeavyFile = file.additions + file.deletions >= HEAVY_DIFF_LINE_THRESHOLD;

  const handleHeaderCollapsedChange = useCallback(
    (next: boolean) => {
      onCollapsedChange(file.path, next);
    },
    [file.path, onCollapsedChange],
  );

  const handleHeaderViewedChange = useCallback(
    (next: boolean) => {
      onViewedChange(file.path, next);
      onCollapsedChange(file.path, next);
    },
    [file.path, onCollapsedChange, onViewedChange],
  );

  const renderHeader = useCallback(
    (metadataFileDiff: FileDiffMetadata) => (
      <CustomFileHeader
        collapsed={collapsed}
        fileDiff={metadataFileDiff}
        hasMergeConflicts={file.hasMergeConflicts === true}
        onCollapsedChange={handleHeaderCollapsedChange}
        onViewedChange={handleHeaderViewedChange}
        viewed={viewed}
      />
    ),
    [
      collapsed,
      file.hasMergeConflicts,
      handleHeaderCollapsedChange,
      handleHeaderViewedChange,
      viewed,
    ],
  );

  useEffect(() => {
    if (file.hasMergeConflicts !== true) return;
    const params = new URLSearchParams({ path: file.path });
    let cancelled = false;
    setUnresolvedLoading(true);
    setUnresolvedError(null);
    void fetchJson<FileContents>(`/api/unresolved-file?${params.toString()}`)
      .then((contents) => {
        if (!cancelled) setUnresolvedFile(contents);
      })
      .catch((error) => {
        if (!cancelled) {
          setUnresolvedError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setUnresolvedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file.hasMergeConflicts, file.path]);

  const filePath = file.path;

  const commentAnnotationsRef = useRef(commentAnnotations);
  commentAnnotationsRef.current = commentAnnotations;

  const addCommentAtLine = useCallback(
    (side: AnnotationSide, lineNumber: number) => {
      onAnnotationsChange(filePath, (current) => {
        if (
          current.some(
            (annotation) =>
              annotation.side === side &&
              annotation.lineNumber === lineNumber &&
              annotation.metadata.kind === "comment-form",
          )
        ) {
          return current;
        }
        return [...current, createCommentAnnotation(side, lineNumber)];
      });
    },
    [filePath, onAnnotationsChange],
  );

  const handleLineSelectionEnd = useCallback(
    (range: SelectedLineRange | null) => {
      onSelectedLinesChange(filePath, range);
      diffOptions?.onLineSelectionEnd?.(range);
      diffOptions?.onLineSelected?.(range);
      if (range == null) return;
      const side: AnnotationSide =
        (range.endSide ?? range.side) === "deletions" ? "deletions" : "additions";
      addCommentAtLine(side, Math.max(range.start, range.end));
    },
    [addCommentAtLine, diffOptions, filePath, onSelectedLinesChange],
  );

  const handleCommentCancel = useCallback(
    (id: string) => {
      onAnnotationsChange(filePath, (current) => {
        const target = current.find((annotation) => annotation.metadata.id === id);
        const previousBody = target?.metadata.previousBody;
        if (previousBody !== undefined) {
          return patchAnnotationMeta(current, id, {
            body: previousBody,
            kind: "comment",
            previousBody: undefined,
          });
        }
        return current.filter((annotation) => annotation.metadata.id !== id);
      });
      onSelectedLinesChange(filePath, null);
      diffOptions?.onLineSelected?.(null);
    },
    [diffOptions, filePath, onAnnotationsChange, onSelectedLinesChange],
  );

  const handleCommentEdit = useCallback(
    (id: string) => {
      onAnnotationsChange(filePath, (current) => {
        const target = current.find((annotation) => annotation.metadata.id === id);
        if (target == null || target.metadata.kind !== "comment") return current;
        return patchAnnotationMeta(current, id, {
          kind: "comment-form",
          previousBody: target.metadata.body,
        });
      });
    },
    [filePath, onAnnotationsChange],
  );

  const handleCommentDelete = useCallback(
    (id: string) => {
      onAnnotationsChange(filePath, (current) =>
        current.filter((annotation) => annotation.metadata.id !== id),
      );
      onCommentDeleted(id);
    },
    [filePath, onAnnotationsChange, onCommentDeleted],
  );

  const handleCommentBodyChange = useCallback(
    (id: string, body: string) => {
      onAnnotationsChange(filePath, (current) => {
        let changed = false;
        const next = current.map((annotation) => {
          if (annotation.metadata.id !== id || annotation.metadata.body === body) return annotation;
          changed = true;
          return { ...annotation, metadata: { ...annotation.metadata, body } };
        });
        return changed ? next : current;
      });
    },
    [filePath, onAnnotationsChange],
  );

  const handleCommentSubmit = useCallback(
    (id: string, body: string) => {
      const submittedAnnotation = commentAnnotationsRef.current.find(
        (item) => item.metadata.id === id,
      );
      if (submittedAnnotation == null) return;

      const normalizedBody = body.trim().length > 0 ? body.trim() : "Needs review before merging.";
      onAnnotationsChange(filePath, (current) =>
        patchAnnotationMeta(current, id, {
          body: normalizedBody,
          kind: "comment",
          previousBody: undefined,
        }),
      );
      onCommentSaved({
        body: normalizedBody,
        contextLines: buildCommentContext({
          fileDiff: file.hasMergeConflicts === true ? null : fileDiff,
          lineNumber: submittedAnnotation.lineNumber,
          side: submittedAnnotation.side,
          unresolvedFile,
        }),
        filePath,
        id,
        lineNumber: submittedAnnotation.lineNumber,
        side: submittedAnnotation.side,
      });
      onSelectedLinesChange(filePath, null);
      diffOptions?.onLineSelected?.(null);
    },
    [
      diffOptions,
      file.hasMergeConflicts,
      filePath,
      fileDiff,
      onAnnotationsChange,
      onCommentSaved,
      onSelectedLinesChange,
      unresolvedFile,
    ],
  );

  const hasOpenCommentForm = useMemo(
    () => commentAnnotations.some((annotation) => annotation.metadata.kind === "comment-form"),
    [commentAnnotations],
  );

  const fileDiffOptions = useMemo(
    () => ({
      ...diffOptions,
      collapsed,
      enableGutterUtility: !hasOpenCommentForm,
      enableLineSelection: !hasOpenCommentForm,
      onLineSelectionEnd: handleLineSelectionEnd,
    }),
    [collapsed, diffOptions, handleLineSelectionEnd, hasOpenCommentForm],
  );

  const renderCommentAnnotation = useCallback(
    (annotation: unknown) => {
      const commentAnnotation = annotation as CommentAnnotation;
      const queueItem = queueItemsByCommentId.get(commentAnnotation.metadata.id);
      const isOptimisticallyQueueing =
        optimisticQueueingIds?.has(commentAnnotation.metadata.id) === true;
      const agentStatus = queueItem?.status ?? (isOptimisticallyQueueing ? "queueing" : null);
      return (
        <CommentAnnotationView
          annotation={commentAnnotation}
          agentError={queueItem?.error}
          agentLivePreview={queueItem?.livePreview}
          agentResponse={queueItem?.response}
          agentStatus={agentStatus}
          onAgentCancel={onCommentAgentCancel}
          onBodyChange={handleCommentBodyChange}
          onCancel={handleCommentCancel}
          onDelete={handleCommentDelete}
          onEdit={handleCommentEdit}
          onSubmit={handleCommentSubmit}
        />
      );
    },
    [
      handleCommentBodyChange,
      handleCommentCancel,
      handleCommentDelete,
      handleCommentEdit,
      handleCommentSubmit,
      onCommentAgentCancel,
      optimisticQueueingIds,
      queueItemsByCommentId,
    ],
  );

  if (file.hasMergeConflicts === true) {
    if (unresolvedError != null) {
      return (
        <div
          role="alert"
          className="app-diff-state app-diff-state-error grid place-items-center p-6 text-xs"
        >
          <span className="inline-flex items-center gap-2">
            <span className="font-mono" translate="no">
              {file.path}
            </span>
            <span>{unresolvedError}</span>
          </span>
        </div>
      );
    }

    if (unresolvedLoading || unresolvedFile == null) {
      return (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="app-diff-state grid place-items-center p-6 text-xs text-muted-foreground"
        >
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-foreground/70" translate="no">
              {file.path}
            </span>
            <span>Loading merge conflict…</span>
          </span>
        </div>
      );
    }

    return (
      <UnresolvedFile
        file={unresolvedFile}
        options={{
          ...fileDiffOptions,
          hunkSeparators:
            typeof fileDiffOptions.hunkSeparators === "function"
              ? "line-info"
              : fileDiffOptions.hunkSeparators,
          mergeConflictActionsType: "default",
          maxContextLines: 3,
          onPostRender: undefined,
        }}
        selectedLines={selectedLines}
        lineAnnotations={commentAnnotations}
        renderAnnotation={renderCommentAnnotation}
        renderCustomHeader={renderHeader}
        disableWorkerPool
      />
    );
  }

  if (file.isBinary === true) {
    const headerStub = { name: file.path, hunks: [] } as unknown as FileDiffMetadata;
    return (
      <>
        {renderHeader(headerStub)}
        {collapsed ? null : <UnsupportedFileBody path={file.path} />}
      </>
    );
  }

  if (fileDiff == null) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="app-diff-state grid place-items-center p-6 text-xs text-muted-foreground"
      >
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-foreground/70" translate="no">
            {file.path}
          </span>
          <span>Loading…</span>
        </span>
      </div>
    );
  }

  if (isHeavyFile) {
    return (
      <HeavyFileDiff collapsed={collapsed} fileDiff={fileDiff} header={renderHeader(fileDiff)} />
    );
  }

  return (
    <FileDiff
      fileDiff={fileDiff}
      options={fileDiffOptions}
      selectedLines={selectedLines}
      lineAnnotations={commentAnnotations}
      renderAnnotation={renderCommentAnnotation}
      renderCustomHeader={renderHeader}
    />
  );
});

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "tif",
  "tiff",
  "avif",
  "heic",
  "heif",
]);

function getFileExtension(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

function UnsupportedFileBody({ path }: { path: string }) {
  const extension = getFileExtension(path);
  const isImage = IMAGE_EXTENSIONS.has(extension);
  const label = isImage ? "Image preview not supported" : "Binary file not shown";
  const description = isImage
    ? "Image diffs aren't rendered in the viewer yet."
    : "This file's contents are binary and can't be shown as a text diff.";
  return (
    <div
      role="note"
      className="app-diff-state grid place-items-center p-6 text-center text-xs text-muted-foreground"
    >
      <div className="space-y-1">
        <p className="font-medium text-foreground">{label}</p>
        <p className="leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
