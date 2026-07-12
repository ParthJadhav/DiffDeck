import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  FileDiff,
  UnresolvedFile,
  type FileContents,
  type FileDiffMetadata,
} from "@pierre/diffs/react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AnnotationSide, SelectedLineRange } from "@pierre/diffs";
import { AlertCircle, FileWarning, ImageOff, LoaderCircle } from "lucide-react";
import { customHunkSeparatorCSS, stickyFileHeaderCSS } from "../lib/constants.js";
import { fetchJson } from "../lib/api.js";
import { buildCommentContext, type CommentExportRecord } from "../lib/commentExport.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "../lib/uiTypes.js";
import type { DiffFileSummary, SessionPayload } from "../types.js";
import { isDependencyPath } from "../lib/fileFilters.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.js";
import { Button } from "./ui/button.js";
import { Skeleton } from "./ui/skeleton.js";
import { CommentAnnotationView } from "./diff/CommentAnnotation.js";
import {
  createCommentAnnotation,
  patchAnnotationMeta,
  type CommentAnnotation,
} from "./diff/commentAnnotationModel.js";
import { CustomFileHeader } from "./diff/CustomFileHeader.js";
import { HeavyFileDiff } from "./diff/HeavyFileDiff.js";
import { ImageDiff } from "./diff/ImageDiff.js";
import { DependencyDiff } from "./diff/DependencyDiff.js";
import { FileReviewActions } from "./diff/FileReviewActions.js";
import { installHunkExpansionFallback } from "./diff/hunkExpansionFallback.js";

export interface DiffWorkspaceProps {
  annotationsByFile: Readonly<Record<string, CommentAnnotation[]>>;
  capabilities?: SessionPayload["capabilities"];
  collapsedFilePaths: ReadonlySet<string>;
  diffStyle: DiffLayout;
  disableBackground: boolean;
  expandUnchanged: boolean;
  files: DiffFileSummary[];
  fileDiffs: Record<string, FileDiffMetadata>;
  fileDiffErrors: Record<string, string>;
  hunkSeparators: HunkSeparatorMode;
  onAnnotationsChange: (
    path: string,
    updater: (current: CommentAnnotation[]) => CommentAnnotation[],
  ) => void;
  onCollapsedFileChange: (path: string, value: boolean) => void;
  onCommentDeleted: (id: string) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onRequestFileDiff: (path: string) => void;
  onRetryFileDiff: (path: string) => void;
  onSessionRefresh: () => void;
  onViewedFileChange: (path: string, value: boolean) => void;
  onVisiblePathChange: (path: string) => void;
  overflow: OverflowMode;
  scrollSignal: number;
  selectedFile: DiffFileSummary | null;
  selectedPath: string | null;
  snapshotId: string;
  sessionRevision: number;
  showLineNumbers: boolean;
  themeType: ThemeChoice;
  viewedFilePaths: ReadonlySet<string>;
}

export function DiffWorkspace(props: DiffWorkspaceProps) {
  const {
    annotationsByFile,
    capabilities,
    collapsedFilePaths,
    diffStyle,
    disableBackground,
    expandUnchanged,
    files,
    fileDiffs,
    fileDiffErrors,
    hunkSeparators,
    onAnnotationsChange,
    onCollapsedFileChange,
    onCommentDeleted,
    onCommentSaved,
    onRequestFileDiff,
    onRetryFileDiff,
    onSessionRefresh,
    onViewedFileChange,
    onVisiblePathChange,
    overflow,
    scrollSignal,
    selectedFile,
    selectedPath,
    snapshotId,
    sessionRevision,
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
        aria-label="Diff review workspace"
        tabIndex={-1}
        className="flex h-full min-h-0 min-w-0 flex-col bg-background focus:outline-none"
      >
        <div className="grid flex-1 place-items-center p-8 text-center">
          <Card className="max-w-sm">
            <CardHeader>
              <CardTitle className="text-xl">No diff to render</CardTitle>
              <CardDescription className="leading-relaxed">
                Run the CLI inside a repository with pending changes, or pass{" "}
                <code className="font-mono text-foreground/80" translate="no">
                  git diff
                </code>{" "}
                arguments to compare revisions.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main"
      aria-label="Diff review workspace"
      tabIndex={-1}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background focus:outline-none"
    >
      <section className="min-h-0 min-w-0 flex-1">
        <MultiFileScroller
          key={sessionRevision}
          annotationsByFile={annotationsByFile}
          capabilities={capabilities}
          diffOptions={diffOptions}
          collapsedFilePaths={collapsedFilePaths}
          fileDiffs={fileDiffs}
          fileDiffErrors={fileDiffErrors}
          files={files}
          onAnnotationsChange={onAnnotationsChange}
          onCollapsedFileChange={onCollapsedFileChange}
          onCommentDeleted={onCommentDeleted}
          onCommentSaved={onCommentSaved}
          onRequestFileDiff={onRequestFileDiff}
          onRetryFileDiff={onRetryFileDiff}
          onSessionRefresh={onSessionRefresh}
          onViewedFileChange={onViewedFileChange}
          onVisiblePathChange={onVisiblePathChange}
          scrollSignal={scrollSignal}
          selectedPath={selectedPath}
          snapshotId={snapshotId}
          sessionRevision={sessionRevision}
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

type SelectedLinesByFile = Record<string, SelectedLineRange | null>;

function MultiFileScroller(props: {
  annotationsByFile: Readonly<Record<string, CommentAnnotation[]>>;
  capabilities?: SessionPayload["capabilities"];
  collapsedFilePaths: ReadonlySet<string>;
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  fileDiffs: Record<string, FileDiffMetadata>;
  fileDiffErrors: Record<string, string>;
  files: DiffFileSummary[];
  onAnnotationsChange: (
    path: string,
    updater: (current: CommentAnnotation[]) => CommentAnnotation[],
  ) => void;
  onCollapsedFileChange: (path: string, value: boolean) => void;
  onCommentDeleted: (id: string) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onRequestFileDiff: (path: string) => void;
  onRetryFileDiff: (path: string) => void;
  onSessionRefresh: () => void;
  onViewedFileChange: (path: string, value: boolean) => void;
  onVisiblePathChange: (path: string) => void;
  scrollSignal: number;
  selectedPath: string | null;
  snapshotId: string;
  sessionRevision: number;
  viewedFilePaths: ReadonlySet<string>;
}) {
  const {
    annotationsByFile,
    capabilities,
    collapsedFilePaths,
    diffOptions,
    fileDiffs,
    fileDiffErrors,
    files,
    onAnnotationsChange,
    onCollapsedFileChange,
    onCommentDeleted,
    onCommentSaved,
    onRequestFileDiff,
    onRetryFileDiff,
    onSessionRefresh,
    onViewedFileChange,
    onVisiblePathChange,
    scrollSignal,
    selectedPath,
    snapshotId,
    sessionRevision,
    viewedFilePaths,
  } = props;

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const lastReportedPathRef = useRef<string | null>(null);
  const suppressObserverUntilRef = useRef(
    typeof performance === "undefined" ? 0 : performance.now() + 1_000,
  );
  const pinnedPathRef = useRef<string | null>(selectedPath);
  const visibleObserverCleanupRef = useRef<(() => void) | null>(null);
  const fileIndexByPath = useMemo(
    () => new Map(files.map((file, index) => [file.path, index])),
    [files],
  );

  // Per-file UI state lives here, not inside FileDiffSection, so a row that
  // scrolls out of the virtualized window doesn't lose its selection or its
  // half-typed comment when it remounts.
  const [selectedLines, setSelectedLines] = useState<SelectedLinesByFile>({});

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

  const handleRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      for (let i = range.startIndex; i <= range.endIndex; i++) {
        const file = files[i];
        if (file == null) continue;
        if (file.hasMergeConflicts === true || file.isBinary === true) continue;
        if (collapsedFilePaths.has(file.path)) continue;
        onRequestFileDiff(file.path);
      }
    },
    [collapsedFilePaths, files, onRequestFileDiff],
  );

  const handleScrollerRef = useCallback(
    (ref: HTMLElement | Window | null) => {
      visibleObserverCleanupRef.current?.();
      visibleObserverCleanupRef.current = null;
      if (!(ref instanceof HTMLElement)) return;
      visibleObserverCleanupRef.current = installVisiblePathObserver(ref, {
        lastReportedPathRef,
        onVisiblePathChange,
        pinnedPathRef,
        suppressObserverUntilRef,
      });
    },
    [onVisiblePathChange],
  );

  useEffect(() => {
    return cleanupVisibleObserver(visibleObserverCleanupRef);
  }, []);

  const handledScrollRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedPath == null) return;
    const scrollRequest = `${scrollSignal}:${selectedPath}`;
    if (handledScrollRequestRef.current === scrollRequest) return;
    const index = fileIndexByPath.get(selectedPath);
    if (index == null) return;
    handledScrollRequestRef.current = scrollRequest;
    lastReportedPathRef.current = selectedPath;
    pinnedPathRef.current = selectedPath;
    suppressObserverUntilRef.current = performance.now() + 350;
    const scrollToSelected = () => virtuosoRef.current?.scrollToIndex({ index, align: "start" });
    scrollToSelected();
    const animationFrame = window.requestAnimationFrame(scrollToSelected);
    const retryTimer = window.setTimeout(scrollToSelected, 250);

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
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(retryTimer);
      window.clearTimeout(timer);
      release();
    };
  }, [fileIndexByPath, scrollSignal, selectedPath]);

  const itemContent = useCallback(
    (_index: number, file: DiffFileSummary) => (
      <Card
        aria-current={file.path === selectedPath ? "location" : undefined}
        data-file-path={file.path}
        data-selected={file.path === selectedPath ? "true" : undefined}
        className="app-file-card m-2.5 scroll-mt-2.5 overflow-clip rounded-lg border-border"
      >
        <FileDiffSection
          collapsed={collapsedFilePaths.has(file.path)}
          capabilities={capabilities}
          commentAnnotations={annotationsByFile[file.path] ?? EMPTY_ANNOTATIONS}
          diffOptions={diffOptions}
          file={file}
          fileDiff={fileDiffs[file.path] ?? null}
          fileDiffError={fileDiffErrors[file.path] ?? null}
          onAnnotationsChange={onAnnotationsChange}
          onCollapsedChange={onCollapsedFileChange}
          onCommentDeleted={onCommentDeleted}
          onCommentSaved={onCommentSaved}
          onRetryFileDiff={onRetryFileDiff}
          onSessionRefresh={onSessionRefresh}
          onSelectedLinesChange={handleSelectedLinesChange}
          onViewedChange={onViewedFileChange}
          selectedLines={selectedLines[file.path] ?? null}
          sessionRevision={sessionRevision}
          snapshotId={snapshotId}
          viewed={viewedFilePaths.has(file.path)}
        />
      </Card>
    ),
    [
      annotationsByFile,
      capabilities,
      collapsedFilePaths,
      diffOptions,
      fileDiffs,
      fileDiffErrors,
      handleSelectedLinesChange,
      onCollapsedFileChange,
      onCommentDeleted,
      onCommentSaved,
      onRetryFileDiff,
      onSessionRefresh,
      onAnnotationsChange,
      onViewedFileChange,
      selectedLines,
      selectedPath,
      sessionRevision,
      snapshotId,
      viewedFilePaths,
    ],
  );

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
      initialTopMostItemIndex={fileIndexByPath.get(selectedPath ?? "") ?? 0}
      scrollerRef={handleScrollerRef}
      className="app-virtuoso h-full"
    />
  );
}

function installVisiblePathObserver(
  root: HTMLElement,
  refs: {
    lastReportedPathRef: { current: string | null };
    onVisiblePathChange: (path: string) => void;
    pinnedPathRef: { current: string | null };
    suppressObserverUntilRef: { current: number };
  },
): () => void {
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
      if (performance.now() < refs.suppressObserverUntilRef.current) {
        return;
      }
      if (refs.pinnedPathRef.current != null && visibility.has(refs.pinnedPathRef.current)) {
        if (refs.lastReportedPathRef.current !== refs.pinnedPathRef.current) {
          refs.lastReportedPathRef.current = refs.pinnedPathRef.current;
          refs.onVisiblePathChange(refs.pinnedPathRef.current);
        }
        return;
      }
      refs.pinnedPathRef.current = null;
      const rootTop = root.getBoundingClientRect().top;
      let above: { path: string; top: number } | null = null;
      let below: { path: string; top: number } | null = null;
      for (const [path, node] of visibility) {
        const top = node.getBoundingClientRect().top - rootTop;
        if (top <= ABOVE_THRESHOLD) {
          if (above == null || top > above.top) above = { path, top };
        } else if (below == null || top < below.top) {
          below = { path, top };
        }
      }
      const best = above ?? below;
      if (best != null && best.path !== refs.lastReportedPathRef.current) {
        refs.lastReportedPathRef.current = best.path;
        refs.onVisiblePathChange(best.path);
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
}

function cleanupVisibleObserver(ref: { current: (() => void) | null }) {
  const cleanup = ref.current;
  return () => {
    cleanup?.();
    if (ref.current === cleanup) {
      ref.current = null;
    }
  };
}

// Files at or above this changed-line count freeze the main thread for several
// seconds inside @pierre/diffs (its virtualizer doesn't actually window the
// DOM render for these — every line gets a node, e.g. ~84k DOM nodes for a
// 24k-line yarn.lock diff). For files at this scale we swap in a custom
// windowed renderer that only mounts the rows currently in view, trading
// syntax highlighting / line-level features for a responsive UI.
const HEAVY_DIFF_LINE_THRESHOLD = 2000;

type UnresolvedFileState = {
  error: string | null;
  file: FileContents | null;
  loading: boolean;
};

const idleUnresolvedFileState: UnresolvedFileState = {
  error: null,
  file: null,
  loading: false,
};

const FileDiffSection = memo(function FileDiffSection({
  collapsed,
  capabilities,
  commentAnnotations,
  diffOptions,
  file,
  fileDiff,
  fileDiffError,
  onAnnotationsChange,
  onCollapsedChange,
  onCommentDeleted,
  onCommentSaved,
  onRetryFileDiff,
  onSessionRefresh,
  onSelectedLinesChange,
  onViewedChange,
  selectedLines,
  sessionRevision,
  snapshotId,
  viewed,
}: {
  collapsed: boolean;
  capabilities?: SessionPayload["capabilities"];
  commentAnnotations: CommentAnnotation[];
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  file: DiffFileSummary;
  fileDiff: FileDiffMetadata | null;
  fileDiffError: string | null;
  onAnnotationsChange: (
    path: string,
    updater: (current: CommentAnnotation[]) => CommentAnnotation[],
  ) => void;
  onCollapsedChange: (path: string, value: boolean) => void;
  onCommentDeleted: (id: string) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onRetryFileDiff: (path: string) => void;
  onSessionRefresh: () => void;
  onSelectedLinesChange: (path: string, range: SelectedLineRange | null) => void;
  onViewedChange: (path: string, value: boolean) => void;
  selectedLines: SelectedLineRange | null;
  sessionRevision: number;
  snapshotId: string;
  viewed: boolean;
}) {
  const [unresolvedState, dispatchUnresolvedState] = useReducer(
    (_current: UnresolvedFileState, next: UnresolvedFileState) => next,
    idleUnresolvedFileState,
  );
  const [structuralOutput, setStructuralOutput] = useState<string | null>(null);

  const isHeavyFile = file.additions + file.deletions >= HEAVY_DIFF_LINE_THRESHOLD;

  useEffect(() => setStructuralOutput(null), [file.path, sessionRevision]);

  const headerActions = useMemo(
    () => (
      <FileReviewActions
        capabilities={capabilities}
        hunkCount={fileDiff?.hunks.length ?? 0}
        onRefresh={onSessionRefresh}
        onStructuralChange={setStructuralOutput}
        path={file.path}
        snapshotId={snapshotId}
        structuralActive={structuralOutput != null}
      />
    ),
    [
      capabilities,
      file.path,
      fileDiff?.hunks.length,
      onSessionRefresh,
      snapshotId,
      structuralOutput,
    ],
  );

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
        actions={headerActions}
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
      headerActions,
    ],
  );

  useEffect(() => {
    if (file.hasMergeConflicts !== true) {
      dispatchUnresolvedState(idleUnresolvedFileState);
      return;
    }
    const params = new URLSearchParams({ path: file.path });
    let cancelled = false;
    dispatchUnresolvedState({ error: null, file: null, loading: true });
    void fetchJson<FileContents>(`/api/unresolved-file?${params.toString()}`)
      .then((contents) => {
        if (!cancelled) dispatchUnresolvedState({ error: null, file: contents, loading: false });
      })
      .catch((error) => {
        if (!cancelled) {
          dispatchUnresolvedState({
            error: error instanceof Error ? error.message : String(error),
            file: null,
            loading: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file.hasMergeConflicts, file.path, sessionRevision]);

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

  useEffect(() => {
    const handleShortcutComment = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== filePath || fileDiff == null) return;
      const firstHunk = fileDiff.hunks[0];
      if (firstHunk == null) return;
      const side: AnnotationSide = firstHunk.additionCount > 0 ? "additions" : "deletions";
      const line = side === "additions" ? firstHunk.additionStart : firstHunk.deletionStart;
      addCommentAtLine(side, Math.max(1, line));
    };
    window.addEventListener("diffdeck:add-comment", handleShortcutComment);
    return () => window.removeEventListener("diffdeck:add-comment", handleShortcutComment);
  }, [addCommentAtLine, fileDiff, filePath]);

  const handleLineSelectionEnd = useCallback(
    (range: SelectedLineRange | null) => {
      onSelectedLinesChange(filePath, range);
      diffOptions?.onLineSelectionEnd?.(range);
      diffOptions?.onLineSelected?.(range);
      if (range == null) return;
      const side: AnnotationSide =
        (range.endSide ?? range.side) === "deletions" ? "deletions" : "additions";
      addCommentAtLine(side, Math.max(range.start, range.end));
      window.dispatchEvent(
        new CustomEvent("diffdeck:line-selected", {
          detail: { line: Math.max(range.start, range.end), side },
        }),
      );
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
          unresolvedFile: unresolvedState.file,
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
      unresolvedState.file,
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
    (annotation: unknown) => (
      <CommentAnnotationView
        annotation={annotation as CommentAnnotation}
        onBodyChange={handleCommentBodyChange}
        onCancel={handleCommentCancel}
        onDelete={handleCommentDelete}
        onEdit={handleCommentEdit}
        onSubmit={handleCommentSubmit}
      />
    ),
    [
      handleCommentBodyChange,
      handleCommentCancel,
      handleCommentDelete,
      handleCommentEdit,
      handleCommentSubmit,
    ],
  );

  if (file.hasMergeConflicts === true) {
    if (unresolvedState.error != null) {
      return (
        <div
          role="alert"
          className="app-diff-state app-diff-state-error grid place-items-center p-6 text-xs"
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="font-mono" translate="no">
              {file.path}
            </span>
            <span>{unresolvedState.error}</span>
          </span>
        </div>
      );
    }

    if (unresolvedState.loading || unresolvedState.file == null) {
      return (
        <output
          aria-live="polite"
          aria-busy="true"
          className="app-diff-state grid place-items-center p-6 text-xs text-muted-foreground"
        >
          <span className="inline-flex items-center gap-2">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            <span className="font-mono text-foreground/70" translate="no">
              {file.path}
            </span>
            <span>Loading merge conflict…</span>
          </span>
        </output>
      );
    }

    return (
      <UnresolvedFile
        file={unresolvedState.file}
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
        <CustomFileHeader
          actions={headerActions}
          collapsed={collapsed}
          fileDiff={headerStub}
          onCollapsedChange={handleHeaderCollapsedChange}
          onViewedChange={handleHeaderViewedChange}
          viewed={viewed}
        />
        {collapsed ? null : IMAGE_EXTENSIONS.has(getFileExtension(file.path)) ? (
          <ImageDiff path={file.path} />
        ) : (
          <UnsupportedFileBody path={file.path} />
        )}
      </>
    );
  }

  if (fileDiff == null && collapsed) {
    const headerStub = { name: file.path, hunks: [] } as unknown as FileDiffMetadata;
    return (
      <CustomFileHeader
        actions={headerActions}
        collapsed
        fileDiff={headerStub}
        onCollapsedChange={handleHeaderCollapsedChange}
        onViewedChange={handleHeaderViewedChange}
        viewed={viewed}
      />
    );
  }

  if (fileDiff == null && fileDiffError != null) {
    return (
      <div
        role="alert"
        className="app-diff-state app-diff-state-error grid place-items-center gap-3 p-6 text-xs"
      >
        <span className="inline-flex items-center gap-2">
          <AlertCircle className="size-3.5" />
          <span className="font-mono">{file.path}</span>
          <span>{fileDiffError}</span>
        </span>
        <Button
          variant="outline"
          className="h-8 text-xs"
          onClick={() => onRetryFileDiff(file.path)}
        >
          Retry file diff
        </Button>
      </div>
    );
  }

  if (fileDiff == null) {
    return (
      <output
        aria-live="polite"
        aria-busy="true"
        className="app-diff-state grid place-items-center p-6 text-xs text-muted-foreground"
      >
        <CardContent className="w-full max-w-lg space-y-2 p-0">
          <div className="flex items-center gap-2">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            <span className="font-mono text-foreground/70" translate="no">
              {file.path}
            </span>
            <span>Loading…</span>
          </div>
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-2/3" />
        </CardContent>
      </output>
    );
  }

  if (structuralOutput != null) {
    return (
      <>
        <CustomFileHeader
          actions={headerActions}
          collapsed={collapsed}
          fileDiff={fileDiff}
          onCollapsedChange={handleHeaderCollapsedChange}
          onViewedChange={handleHeaderViewedChange}
          viewed={viewed}
        />
        {collapsed ? null : (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
            {structuralOutput}
          </pre>
        )}
      </>
    );
  }

  const sourceDiff = isHeavyFile ? (
    <HeavyFileDiff
      collapsed={collapsed}
      fileDiff={fileDiff}
      header={
        <CustomFileHeader
          collapsed={collapsed}
          fileDiff={fileDiff}
          onCollapsedChange={handleHeaderCollapsedChange}
          onViewedChange={handleHeaderViewedChange}
          viewed={viewed}
        />
      }
    />
  ) : (
    <FileDiff
      fileDiff={fileDiff}
      options={fileDiffOptions}
      selectedLines={selectedLines}
      lineAnnotations={commentAnnotations}
      renderAnnotation={renderCommentAnnotation}
      renderCustomHeader={renderHeader}
    />
  );

  return isDependencyPath(file.path) && !collapsed ? (
    <DependencyDiff fileDiff={fileDiff} header={renderHeader(fileDiff)} source={sourceDiff} />
  ) : (
    sourceDiff
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
  const Icon = isImage ? ImageOff : FileWarning;
  const label = isImage ? "Image preview not supported" : "Binary file not shown";
  const description = isImage
    ? "Image diffs aren't rendered in the viewer yet."
    : "This file's contents are binary and can't be shown as a text diff.";
  return (
    <div
      role="note"
      className="app-diff-state app-unsupported-file-state grid place-items-center p-4 text-center text-xs text-muted-foreground"
    >
      <CardContent className="flex max-w-sm flex-col items-center gap-2 p-0">
        <span className="app-unsupported-file-icon inline-flex size-8 items-center justify-center rounded-md">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="space-y-1">
          <p className="font-medium text-foreground">{label}</p>
          <p className="leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </div>
  );
}
