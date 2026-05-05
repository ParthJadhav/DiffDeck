import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileDiff,
  UnresolvedFile,
  Virtualizer,
  type FileContents,
  type FileDiffMetadata,
} from "@pierre/diffs/react";
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
        className="flex min-h-0 min-w-0 flex-col bg-background focus:outline-none"
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
      className="flex min-h-0 min-w-0 flex-col bg-background focus:outline-none"
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const lastReportedPathRef = useRef<string | null>(null);
  const suppressObserverUntilRef = useRef(0);
  const pinnedPathRef = useRef<string | null>(null);
  const onVisiblePathChangeRef = useRef(onVisiblePathChange);
  onVisiblePathChangeRef.current = onVisiblePathChange;
  const onRequestFileDiffRef = useRef(onRequestFileDiff);
  onRequestFileDiffRef.current = onRequestFileDiff;
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);

  // Stable callback ref so React doesn't detach + reattach on every parent
  // render (which used to cascade across all 14 file cards on each click).
  const sectionRef = useCallback((node: HTMLDivElement | null) => {
    if (node == null) return;
    const path = node.dataset.filePath;
    if (path == null) return;
    sectionRefs.current.set(path, node);
    if (containerRef.current == null) {
      containerRef.current = (node.parentElement?.parentElement as HTMLDivElement | null) ?? null;
    }
    return () => {
      sectionRefs.current.delete(path);
    };
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (root == null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const path = (entry.target as HTMLElement).dataset.filePath;
          const file = path == null ? null : filesByPath.get(path);
          if (path != null && file?.hasMergeConflicts !== true && file?.isBinary !== true) {
            onRequestFileDiffRef.current(path);
          }
        }
      },
      { root, rootMargin: "600px 0px 600px 0px" },
    );
    for (const node of sectionRefs.current.values()) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [filesByPath]);

  useEffect(() => {
    const root = containerRef.current;
    if (root == null) return;
    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
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
        const ABOVE_THRESHOLD = 24;
        const rootTop = root.getBoundingClientRect().top;
        let above: { path: string; top: number } | null = null;
        let below: { path: string; top: number } | null = null;
        for (const path of visibility.keys()) {
          const node = sectionRefs.current.get(path);
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
      // Single threshold (0) is enough: the path-selection logic below relies
      // on isIntersecting + getBoundingClientRect, not on intersectionRatio.
      // Multi-threshold observers fire many more callbacks per scroll, which
      // showed up as the dominant cost on each click after a giant file was
      // expanded.
      { root, threshold: 0 },
    );
    for (const node of sectionRefs.current.values()) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [files]);

  const didInitialScrollRef = useRef(false);

  useEffect(() => {
    if (scrollSignal === 0 && didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    if (selectedPath == null) return;
    const node = sectionRefs.current.get(selectedPath);
    if (node == null) return;
    lastReportedPathRef.current = selectedPath;
    pinnedPathRef.current = selectedPath;
    suppressObserverUntilRef.current = performance.now() + 350;
    node.scrollIntoView({ block: "start", behavior: "auto" });
    const root = containerRef.current;
    if (root == null) return;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      pinnedPathRef.current = null;
      root.removeEventListener("wheel", release);
      root.removeEventListener("touchstart", release);
      root.removeEventListener("keydown", release);
    };
    root.addEventListener("wheel", release, { passive: true, once: true });
    root.addEventListener("touchstart", release, { passive: true, once: true });
    root.addEventListener("keydown", release, { once: true });
    const timer = window.setTimeout(release, 1500);
    return () => {
      window.clearTimeout(timer);
      release();
    };
  }, [scrollSignal, selectedPath]);

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

  return (
    <Virtualizer className="h-full overflow-auto" contentClassName="grid gap-2.5 p-2.5">
      {files.map((file) => (
        <div
          key={file.path}
          data-file-path={file.path}
          ref={sectionRef}
          className="app-file-card scroll-mt-2.5 overflow-hidden rounded-lg"
        >
          <FileDiffSection
            collapsed={collapsedFilePaths.has(file.path)}
            diffOptions={diffOptions}
            file={file}
            fileDiff={fileDiffs[file.path] ?? null}
            onCollapsedChange={onCollapsedFileChange}
            onCommentSaved={onCommentSaved}
            onViewedChange={onViewedFileChange}
            viewed={viewedFilePaths.has(file.path)}
          />
        </div>
      ))}
    </Virtualizer>
  );
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
  diffOptions,
  file,
  fileDiff,
  onCollapsedChange,
  onCommentSaved,
  onViewedChange,
  viewed,
}: {
  collapsed: boolean;
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  file: DiffFileSummary;
  fileDiff: FileDiffMetadata | null;
  onCollapsedChange: (path: string, value: boolean) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onViewedChange: (path: string, value: boolean) => void;
  viewed: boolean;
}) {
  const [commentAnnotations, setCommentAnnotations] = useState<CommentAnnotation[]>([]);
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null);
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
    [collapsed, file.hasMergeConflicts, handleHeaderCollapsedChange, handleHeaderViewedChange, viewed],
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

  const addCommentAtLine = useCallback((side: AnnotationSide, lineNumber: number) => {
    setCommentAnnotations((current) => {
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
  }, []);

  const handleLineSelectionEnd = useCallback(
    (range: SelectedLineRange | null) => {
      setSelectedLines(range);
      diffOptions?.onLineSelectionEnd?.(range);
      diffOptions?.onLineSelected?.(range);
      if (range == null) return;
      const side: AnnotationSide =
        (range.endSide ?? range.side) === "deletions" ? "deletions" : "additions";
      addCommentAtLine(side, Math.max(range.start, range.end));
    },
    [addCommentAtLine, diffOptions],
  );

  const handleCommentCancel = useCallback(
    (id: string) => {
      setCommentAnnotations((current) =>
        current.filter((annotation) => annotation.metadata.id !== id),
      );
      setSelectedLines(null);
      diffOptions?.onLineSelected?.(null);
    },
    [diffOptions],
  );

  const handleCommentSubmit = useCallback(
    (id: string, body: string) => {
      const submittedAnnotation = commentAnnotations.find((item) => item.metadata.id === id);
      if (submittedAnnotation == null) return;

      const normalizedBody = body.trim().length > 0 ? body.trim() : "Needs review before merging.";
      setCommentAnnotations((current) =>
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
      onCommentSaved({
        body: normalizedBody,
        contextLines: buildCommentContext({
          fileDiff: file.hasMergeConflicts === true ? null : fileDiff,
          lineNumber: submittedAnnotation.lineNumber,
          side: submittedAnnotation.side,
          unresolvedFile,
        }),
        filePath: file.path,
        id,
        lineNumber: submittedAnnotation.lineNumber,
        side: submittedAnnotation.side,
      });
      setSelectedLines(null);
      diffOptions?.onLineSelected?.(null);
    },
    [
      commentAnnotations,
      diffOptions,
      file.hasMergeConflicts,
      file.path,
      fileDiff,
      onCommentSaved,
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
        renderAnnotation={(annotation) => (
          <CommentAnnotationView
            annotation={annotation as CommentAnnotation}
            onCancel={handleCommentCancel}
            onSubmit={handleCommentSubmit}
          />
        )}
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
    return <HeavyFileDiff collapsed={collapsed} fileDiff={fileDiff} header={renderHeader(fileDiff)} />;
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
