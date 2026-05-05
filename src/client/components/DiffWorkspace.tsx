import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileDiff,
  UnresolvedFile,
  type FileContents,
  type FileDiffMetadata,
} from "@pierre/diffs/react";
// Note: Virtualizer from @pierre/diffs is still used internally by the diff
// renderers (line-level windowing inside a single file). At the file-list
// level we use react-virtuoso instead, because @pierre/diffs' Virtualizer
// renders all of its direct children verbatim — fine for one file's lines,
// but catastrophic for 23k file cards.
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AnnotationSide, SelectedLineRange } from "@pierre/diffs";
import { customHunkSeparatorCSS } from "../lib/constants.js";
import { fetchJson } from "../lib/api.js";
import { buildCommentContext, type CommentExportRecord } from "../lib/commentExport.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "../lib/uiTypes.js";
import type { DiffFileSummary } from "../types.js";
import {
  CommentAnnotationView,
  createCommentAnnotation,
  type CommentAnnotation,
} from "./diff/CommentAnnotation.js";
import { CustomFileHeader } from "./diff/CustomFileHeader.js";
import { HeavyFileDiff } from "./diff/HeavyFileDiff.js";
import { installHunkExpansionFallback } from "./diff/hunkExpansionFallback.js";

export interface DiffWorkspaceProps {
  collapsedFilePaths: ReadonlySet<string>;
  diffStyle: DiffLayout;
  disableBackground: boolean;
  expandUnchanged: boolean;
  files: DiffFileSummary[];
  fileDiffs: Record<string, FileDiffMetadata>;
  hunkSeparators: HunkSeparatorMode;
  onCollapsedFileChange: (path: string, value: boolean) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onRequestFileDiff: (path: string) => void;
  onViewedFileChange: (path: string, value: boolean) => void;
  onVisiblePathChange: (path: string) => void;
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
    collapsedFilePaths,
    diffStyle,
    disableBackground,
    expandUnchanged,
    files,
    fileDiffs,
    hunkSeparators,
    onCollapsedFileChange,
    onCommentSaved,
    onRequestFileDiff,
    onViewedFileChange,
    onVisiblePathChange,
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
      unsafeCSS: hunkSeparators === "custom" ? customHunkSeparatorCSS : undefined,
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
          diffOptions={diffOptions}
          collapsedFilePaths={collapsedFilePaths}
          fileDiffs={fileDiffs}
          files={files}
          onCollapsedFileChange={onCollapsedFileChange}
          onCommentSaved={onCommentSaved}
          onRequestFileDiff={onRequestFileDiff}
          onViewedFileChange={onViewedFileChange}
          onVisiblePathChange={onVisiblePathChange}
          scrollSignal={scrollSignal}
          selectedPath={selectedPath}
          viewedFilePaths={viewedFilePaths}
        />
      </section>
    </main>
  );
}

// react-virtuoso's overscan is in pixels (when given as a number) — we mount
// roughly one extra viewport above and below so lazy-loaded diffs are ready
// by the time the user scrolls them into view, and so the visible-path
// observer never has to consult an unmounted row.
const VIRTUOSO_OVERSCAN_PX = 1200;
const VIRTUOSO_INCREASE_VIEWPORT_PX = 600;

type CommentDrafts = Record<string, string>;
type CommentAnnotationsByFile = Record<string, CommentAnnotation[]>;
type SelectedLinesByFile = Record<string, SelectedLineRange | null>;

function MultiFileScroller(props: {
  collapsedFilePaths: ReadonlySet<string>;
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  fileDiffs: Record<string, FileDiffMetadata>;
  files: DiffFileSummary[];
  onCollapsedFileChange: (path: string, value: boolean) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onRequestFileDiff: (path: string) => void;
  onViewedFileChange: (path: string, value: boolean) => void;
  onVisiblePathChange: (path: string) => void;
  scrollSignal: number;
  selectedPath: string | null;
  viewedFilePaths: ReadonlySet<string>;
}) {
  const {
    collapsedFilePaths,
    diffOptions,
    fileDiffs,
    files,
    onCollapsedFileChange,
    onCommentSaved,
    onRequestFileDiff,
    onViewedFileChange,
    onVisiblePathChange,
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
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const fileIndexByPath = useMemo(
    () => new Map(files.map((file, index) => [file.path, index])),
    [files],
  );

  // Lift per-file UI state up so it survives row unmounting by the
  // virtualizer. Without this, scrolling a file off-screen would discard a
  // half-typed comment and the user's line selection.
  const [commentAnnotations, setCommentAnnotations] = useState<CommentAnnotationsByFile>({});
  const [selectedLines, setSelectedLines] = useState<SelectedLinesByFile>({});
  const [commentDrafts, setCommentDrafts] = useState<CommentDrafts>({});

  const handleAnnotationsChange = useCallback(
    (path: string, updater: (current: CommentAnnotation[]) => CommentAnnotation[]) => {
      setCommentAnnotations((current) => {
        const previous = current[path] ?? [];
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

  const handleDraftChange = useCallback((id: string, body: string) => {
    setCommentDrafts((current) => {
      if (current[id] === body) return current;
      if (body.length === 0) {
        if (!(id in current)) return current;
        const { [id]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [id]: body };
    });
  }, []);

  const handleDraftClear = useCallback((id: string) => {
    setCommentDrafts((current) => {
      if (!(id in current)) return current;
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  // Drop per-file UI state for files that are no longer in the diff. This
  // matters when the user re-runs `git diff` against a different revision —
  // stale annotations would otherwise leak indefinitely.
  useEffect(() => {
    setCommentAnnotations((current) => {
      let changed = false;
      const next: CommentAnnotationsByFile = {};
      for (const path of Object.keys(current)) {
        if (filesByPath.has(path)) {
          next[path] = current[path];
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setSelectedLines((current) => {
      let changed = false;
      const next: SelectedLinesByFile = {};
      for (const path of Object.keys(current)) {
        if (filesByPath.has(path)) {
          next[path] = current[path];
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [filesByPath]);

  // Range-based lazy load. Virtuoso reports the index window of mounted rows
  // (visible + overscan). For each path in that window we ask the parent to
  // start fetching its diff. The hook in useFileDiff dedupes and queues, so
  // calling repeatedly is safe.
  //
  // We also poke the visible-path observer so it (re)observes any
  // freshly-mounted DOM nodes. We do this synchronously in a microtask so
  // the new nodes are guaranteed to be in the DOM by the time we query for
  // them — Virtuoso reports the range slightly ahead of the actual mount.
  const observerAdoptRef = useRef<(() => void) | null>(null);
  const handleRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      for (let i = range.startIndex; i <= range.endIndex; i++) {
        const file = files[i];
        if (file == null) continue;
        if (file.hasMergeConflicts === true || file.isBinary === true) continue;
        onRequestFileDiffRef.current(file.path);
      }
      // Defer past Virtuoso's commit so any newly-mounted [data-file-path]
      // nodes are queryable by the time we adopt them. queueMicrotask runs
      // before the commit that adds them, so we use a frame instead.
      requestAnimationFrame(() => observerAdoptRef.current?.());
    },
    [files],
  );

  // Visible-path tracking. We use a single IntersectionObserver scoped to
  // Virtuoso's scroller, plus a MutationObserver that auto-observes any
  // newly-mounted file card the moment it enters the DOM. The mounted set
  // is bounded by the overscan window (typically a few dozen rows), so the
  // intersection bookkeeping is cheap even on a 23k-file PR.
  useEffect(() => {
    const root = scrollerEl;
    if (root == null) return;
    const visibility = new Map<string, number>();
    const observed = new WeakSet<Element>();
    const ABOVE_THRESHOLD = 24;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const path = (entry.target as HTMLElement).dataset.filePath;
          if (path == null) continue;
          if (entry.isIntersecting) {
            visibility.set(path, entry.intersectionRatio);
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
        for (const path of visibility.keys()) {
          // We rely on a current DOM lookup rather than a cached node so
          // the math stays correct when virtuoso recycles row positions.
          const node = root.querySelector<HTMLElement>(`[data-file-path="${cssEscapePath(path)}"]`);
          if (node == null) continue;
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
    const adoptAll = () => {
      const nodes = root.querySelectorAll<HTMLElement>("[data-file-path]");
      for (const node of nodes) {
        if (!observed.has(node)) {
          observed.add(node);
          intersectionObserver.observe(node);
        }
      }
    };
    observerAdoptRef.current = adoptAll;
    adoptAll();
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
      observerAdoptRef.current = null;
    };
  }, [scrollerEl]);

  // Programmatic scroll to a selected file. With variable-height rows and
  // not-yet-loaded diffs, Virtuoso's scrollToIndex measures rows on demand
  // and follows up with corrective scrolls as content loads — exactly what
  // the previous scrollIntoView call simulated for the small case.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (scrollSignal === 0 && didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    if (selectedPath == null) return;
    const index = fileIndexByPath.get(selectedPath);
    if (index == null) return;
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

  // Force the selected file to fetch even if it's outside the rendered range
  // (e.g. user clicked deep in the tree before virtuoso scrolled there).
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
    (index: number, file: DiffFileSummary) => (
      // The wrapping div restores the inter-card spacing the previous
      // `grid gap-2.5 p-2.5` layout provided. Padding-bottom gives the
      // gap; horizontal padding gives the inset from the scroll container.
      // The last item inherits the same padding-bottom for symmetry.
      <div className="px-2.5 pb-2.5">
        <div
          data-file-path={file.path}
          className="app-file-card scroll-mt-2.5 overflow-hidden rounded-lg"
        >
          <FileDiffSection
            collapsed={collapsedFilePaths.has(file.path)}
            commentAnnotations={commentAnnotations[file.path] ?? EMPTY_ANNOTATIONS}
            commentDrafts={commentDrafts}
            diffOptions={diffOptions}
            file={file}
            fileDiff={fileDiffs[file.path] ?? null}
            onAnnotationsChange={handleAnnotationsChange}
            onCollapsedChange={onCollapsedFileChange}
            onCommentSaved={onCommentSaved}
            onDraftChange={handleDraftChange}
            onDraftClear={handleDraftClear}
            onSelectedLinesChange={handleSelectedLinesChange}
            onViewedChange={onViewedFileChange}
            selectedLines={selectedLines[file.path] ?? null}
            viewed={viewedFilePaths.has(file.path)}
          />
        </div>
      </div>
    ),
    [
      collapsedFilePaths,
      commentAnnotations,
      commentDrafts,
      diffOptions,
      fileDiffs,
      handleAnnotationsChange,
      handleDraftChange,
      handleDraftClear,
      handleSelectedLinesChange,
      onCollapsedFileChange,
      onCommentSaved,
      onViewedFileChange,
      selectedLines,
      viewedFilePaths,
    ],
  );

  const computeItemKey = useCallback((index: number, file: DiffFileSummary) => file.path, []);

  // Stable callback: Virtuoso re-passes the same scroller element across
  // renders, but a fresh closure here would null-then-set state on each
  // render and trigger a render loop with our other effects.
  const handleScrollerRef = useCallback((ref: HTMLElement | Window | null) => {
    setScrollerEl(ref instanceof HTMLElement ? ref : null);
  }, []);

  return (
    <Virtuoso<DiffFileSummary>
      ref={virtuosoRef}
      data={files}
      itemContent={itemContent}
      computeItemKey={computeItemKey}
      rangeChanged={handleRangeChanged}
      overscan={VIRTUOSO_OVERSCAN_PX}
      increaseViewportBy={VIRTUOSO_INCREASE_VIEWPORT_PX}
      scrollerRef={handleScrollerRef}
      className="app-virtuoso h-full"
    />
  );
}

const EMPTY_ANNOTATIONS: CommentAnnotation[] = [];

// Minimal CSS.escape polyfill for attribute selectors. Some file paths
// contain quotes, brackets, or other characters that would break a literal
// `[data-file-path="…"]` selector.
function cssEscapePath(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/(["\\[\]])/g, "\\$1");
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
  commentDrafts,
  diffOptions,
  file,
  fileDiff,
  onAnnotationsChange,
  onCollapsedChange,
  onCommentSaved,
  onDraftChange,
  onDraftClear,
  onSelectedLinesChange,
  onViewedChange,
  selectedLines,
  viewed,
}: {
  collapsed: boolean;
  commentAnnotations: CommentAnnotation[];
  commentDrafts: CommentDrafts;
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  file: DiffFileSummary;
  fileDiff: FileDiffMetadata | null;
  onAnnotationsChange: (
    path: string,
    updater: (current: CommentAnnotation[]) => CommentAnnotation[],
  ) => void;
  onCollapsedChange: (path: string, value: boolean) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onDraftChange: (id: string, body: string) => void;
  onDraftClear: (id: string) => void;
  onSelectedLinesChange: (path: string, range: SelectedLineRange | null) => void;
  onViewedChange: (path: string, value: boolean) => void;
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
      onAnnotationsChange(filePath, (current) =>
        current.filter((annotation) => annotation.metadata.id !== id),
      );
      onDraftClear(id);
      onSelectedLinesChange(filePath, null);
      diffOptions?.onLineSelected?.(null);
    },
    [diffOptions, filePath, onAnnotationsChange, onDraftClear, onSelectedLinesChange],
  );

  const handleCommentSubmit = useCallback(
    (id: string, body: string) => {
      const submittedAnnotation = commentAnnotations.find((item) => item.metadata.id === id);
      if (submittedAnnotation == null) return;

      const normalizedBody = body.trim().length > 0 ? body.trim() : "Needs review before merging.";
      onAnnotationsChange(filePath, (current) =>
        current.map((annotation) =>
          annotation.metadata.id === id
            ? {
                ...annotation,
                metadata: {
                  ...annotation.metadata,
                  body: normalizedBody,
                  kind: "comment",
                },
              }
            : annotation,
        ),
      );
      onDraftClear(id);
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
      commentAnnotations,
      diffOptions,
      file.hasMergeConflicts,
      filePath,
      fileDiff,
      onAnnotationsChange,
      onCommentSaved,
      onDraftClear,
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
        renderAnnotation={(annotation) => {
          const id = (annotation as CommentAnnotation).metadata.id;
          return (
            <CommentAnnotationView
              annotation={annotation as CommentAnnotation}
              body={commentDrafts[id] ?? ""}
              onBodyChange={(next) => onDraftChange(id, next)}
              onCancel={handleCommentCancel}
              onSubmit={handleCommentSubmit}
            />
          );
        }}
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
      renderAnnotation={(annotation) => (
        <CommentAnnotationView
          annotation={annotation as CommentAnnotation}
          onCancel={handleCommentCancel}
          onSubmit={handleCommentSubmit}
        />
      )}
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
