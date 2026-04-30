import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileDiff,
  UnresolvedFile,
  MultiFileDiff,
  PatchDiff,
  type FileContents,
  Virtualizer,
  type FileDiffMetadata,
} from "@pierre/diffs/react";
import type {
  AnnotationSide,
  DiffLineAnnotation,
  ExpansionDirections,
  SelectedLineRange,
} from "@pierre/diffs";
import { customHunkSeparatorCSS, virtualizerConfig } from "../lib/constants.js";
import { fetchJson } from "../lib/api.js";
import { buildSnippetCompare } from "../lib/diff.js";
import type {
  DiffIndicatorMode,
  DiffLayout,
  DiffLineMode,
  DiffView,
  HunkSeparatorMode,
  OverflowMode,
  ThemeChoice,
} from "../lib/uiTypes.js";
import type { DiffFileSummary } from "../types.js";
import { renderHeaderMetadata } from "./Annotations.js";
import { Button } from "./ui/button.js";

type CommentAnnotationMetadata =
  | {
      id: string;
      kind: "comment-form";
    }
  | {
      body: string;
      id: string;
      kind: "comment";
    };

type CommentAnnotation = DiffLineAnnotation<CommentAnnotationMetadata>;

type HunkExpansionInstance = {
  expandHunk: (
    hunkIndex: number,
    direction: ExpansionDirections,
    expansionLineCountOverride?: number,
  ) => void;
};

const hunkExpansionFallbackNodes = new WeakSet<HTMLElement>();
const hunkExpansionFallbackRoots = new WeakSet<EventTarget>();
const hunkExpansionFallbackInstances = new WeakMap<HTMLElement, HunkExpansionInstance>();

function installHunkExpansionFallback(node: HTMLElement, instance: HunkExpansionInstance) {
  hunkExpansionFallbackInstances.set(node, instance);
  if (!hunkExpansionFallbackNodes.has(node)) {
    hunkExpansionFallbackNodes.add(node);
    addHunkExpansionFallbackRoot(node);
  }
  if (node.shadowRoot != null) {
    addHunkExpansionFallbackRoot(node.shadowRoot);
  }
}

function addHunkExpansionFallbackRoot(root: EventTarget) {
  if (hunkExpansionFallbackRoots.has(root)) return;
  hunkExpansionFallbackRoots.add(root);
  root.addEventListener("click", handleHunkExpansionFallback, {
    capture: true,
  });
}

function handleHunkExpansionFallback(event: Event) {
  const currentTarget = event.currentTarget;
  const node = currentTarget instanceof ShadowRoot ? currentTarget.host : currentTarget;
  if (!(node instanceof HTMLElement)) return;
  const instance = hunkExpansionFallbackInstances.get(node);
  if (instance == null) return;

  let direction: ExpansionDirections = "both";
  let expandAll = false;
  let foundExpandable = false;
  let hunkIndex: number | null = null;

  for (const target of event.composedPath()) {
    if (!(target instanceof HTMLElement)) continue;
    if (target === node) break;

    if (
      !foundExpandable &&
      (target.hasAttribute("data-expand-button") || target.hasAttribute("data-unmodified-lines"))
    ) {
      foundExpandable = true;
      expandAll = target.hasAttribute("data-expand-all-button");
      if (target.hasAttribute("data-expand-up")) {
        direction = "up";
      } else if (target.hasAttribute("data-expand-down")) {
        direction = "down";
      }
    }

    if (foundExpandable && target.hasAttribute("data-expand-index")) {
      const parsed = Number.parseInt(target.getAttribute("data-expand-index") ?? "", 10);
      if (Number.isFinite(parsed)) hunkIndex = parsed;
      break;
    }
  }

  if (hunkIndex == null) return;
  event.preventDefault();
  event.stopPropagation();
  const shouldExpandAll = expandAll || (event instanceof MouseEvent && event.shiftKey);
  instance.expandHunk(
    hunkIndex,
    shouldExpandAll ? "both" : direction,
    shouldExpandAll ? Number.POSITIVE_INFINITY : undefined,
  );
}

export interface DiffWorkspaceProps {
  collapsed: boolean;
  collapsedFilePaths: ReadonlySet<string>;
  diffIndicators: DiffIndicatorMode;
  diffStyle: DiffLayout;
  diffView: DiffView;
  disableBackground: boolean;
  expandUnchanged: boolean;
  files: DiffFileSummary[];
  fileDiffs: Record<string, FileDiffMetadata>;
  hunkSeparators: HunkSeparatorMode;
  lineDiffType: DiffLineMode;
  onCollapsedChange: (value: boolean) => void;
  onCollapsedFileChange: (path: string, value: boolean) => void;
  onDiffStyleChange: (value: DiffLayout) => void;
  onDiffViewChange: (value: DiffView) => void;
  onExpandUnchangedChange: (value: boolean) => void;
  onHunkSeparatorsChange: (value: HunkSeparatorMode) => void;
  onLineDiffTypeChange: (value: DiffLineMode) => void;
  onOverflowChange: (value: OverflowMode) => void;
  onRequestFileDiff: (path: string) => void;
  onSelectionChange: (range: SelectedLineRange | null) => void;
  onShowLineNumbersChange: (value: boolean) => void;
  onThemeTypeChange: (value: ThemeChoice) => void;
  onViewedFileChange: (path: string, value: boolean) => void;
  onVisiblePathChange: (path: string) => void;
  overflow: OverflowMode;
  rawDiff: string | null;
  rawDiffLoading: boolean;
  scrollSignal: number;
  selectedDiff: FileDiffMetadata | null;
  selectedFile: DiffFileSummary | null;
  selectedPath: string | null;
  selection: SelectedLineRange | null;
  showLineNumbers: boolean;
  themeType: ThemeChoice;
  viewedFilePaths: ReadonlySet<string>;
}

export function DiffWorkspace(props: DiffWorkspaceProps) {
  const {
    collapsed,
    collapsedFilePaths,
    diffIndicators,
    diffStyle,
    diffView,
    disableBackground,
    expandUnchanged,
    files,
    fileDiffs,
    hunkSeparators,
    onRequestFileDiff,
    onSelectionChange,
    onCollapsedFileChange,
    onViewedFileChange,
    onVisiblePathChange,
    overflow,
    rawDiff,
    rawDiffLoading,
    scrollSignal,
    selectedDiff,
    selectedFile,
    selectedPath,
    showLineNumbers,
    themeType,
    viewedFilePaths,
  } = props;

  const snippetCompare = useMemo(
    () => (selectedDiff == null ? null : buildSnippetCompare(selectedDiff)),
    [selectedDiff],
  );

  const diffOptions = useMemo(
    () => ({
      collapsed,
      collapsedContextThreshold: 1,
      diffIndicators,
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
      onLineSelected: onSelectionChange,
      onPostRender: installHunkExpansionFallback,
      overflow,
      themeType,
      // Note: `theme`, `lineDiffType`, and `tokenizeMaxLineLength` are ignored
      // when the worker pool is active (controlled by WorkerPoolManager).
      // `themeType` remains a per-component concern.
    }),
    [
      collapsed,
      diffIndicators,
      diffStyle,
      disableBackground,
      expandUnchanged,
      hunkSeparators,
      onSelectionChange,
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
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              No diff to render
            </h1>
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
        {diffView === "file" ? (
          <MultiFileScroller
            diffOptions={diffOptions}
            collapsedFilePaths={collapsedFilePaths}
            fileDiffs={fileDiffs}
            files={files}
            onCollapsedFileChange={onCollapsedFileChange}
            onRequestFileDiff={onRequestFileDiff}
            onViewedFileChange={onViewedFileChange}
            onVisiblePathChange={onVisiblePathChange}
            scrollSignal={scrollSignal}
            selectedPath={selectedPath}
            viewedFilePaths={viewedFilePaths}
          />
        ) : null}
        <Virtualizer
          className={`h-full overflow-auto ${diffView === "file" ? "hidden" : ""}`}
          contentClassName="grid gap-4"
          config={virtualizerConfig}
        >
          {diffView === "snippet" && snippetCompare != null ? (
            <MultiFileDiff
              oldFile={snippetCompare.oldFile}
              newFile={snippetCompare.newFile}
              options={{ ...diffOptions, expandUnchanged: false }}
              renderHeaderMetadata={renderHeaderMetadata}
            />
          ) : null}
          {diffView === "patch" ? (
            rawDiffLoading ? (
              <div
                role="status"
                aria-live="polite"
                aria-busy="true"
                className="grid place-items-center p-8 text-sm text-muted-foreground"
              >
                <span className="inline-flex items-center gap-2">
                  <span>Loading patch diff…</span>
                  <span aria-hidden="true" className="inline-flex items-end gap-0.5">
                    <span className="shell-loading-dot" />
                    <span className="shell-loading-dot" />
                    <span className="shell-loading-dot" />
                  </span>
                </span>
              </div>
            ) : rawDiff != null ? (
              <PatchDiff
                patch={rawDiff}
                options={diffOptions}
                renderHeaderMetadata={renderHeaderMetadata}
              />
            ) : (
              <div className="grid place-items-center p-8 text-center text-sm text-muted-foreground">
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">No patch data available</p>
                  <p className="text-xs leading-relaxed">
                    Switch to the File or Snippet view, or rerun the CLI with raw diff enabled.
                  </p>
                </div>
              </div>
            )
          ) : null}
        </Virtualizer>
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

  // Eager-load observer: trigger a fetch whenever a section is near the viewport.
  useEffect(() => {
    const root = containerRef.current;
    if (root == null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const path = (entry.target as HTMLElement).dataset.filePath;
          const file = files.find((candidate) => candidate.path === path);
          if (path != null && file?.hasMergeConflicts !== true) {
            onRequestFileDiffRef.current(path);
          }
        }
      },
      { root, rootMargin: "1500px 0px 1500px 0px" },
    );
    for (const node of sectionRefs.current.values()) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [files]);

  // Visibility observer: track the topmost section in the viewport.
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
        // If a click pinned a path and it's still visible, keep it selected
        // even if its section can't reach the viewport top (clamped scroll).
        if (pinnedPathRef.current != null && visibility.has(pinnedPathRef.current)) {
          if (lastReportedPathRef.current !== pinnedPathRef.current) {
            lastReportedPathRef.current = pinnedPathRef.current;
            onVisiblePathChangeRef.current(pinnedPathRef.current);
          }
          return;
        }
        pinnedPathRef.current = null;
        // Pick the file most-recently scrolled past (largest top among those
        // at/above the viewport top). If none yet, fall back to the topmost
        // section currently below the viewport top.
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
      { root, threshold: [0, 0.01, 0.5, 1] },
    );
    for (const node of sectionRefs.current.values()) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [files]);

  const didInitialScrollRef = useRef(false);

  // Imperatively scroll when the sidebar requests a path change.
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
    // Release the pin once the user scrolls or after a grace period,
    // whichever comes first.
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

  // Make sure the initial selection's diff is requested.
  useEffect(() => {
    const selectedFile = files.find((file) => file.path === selectedPath);
    if (selectedPath != null && selectedFile?.hasMergeConflicts !== true) {
      onRequestFileDiffRef.current(selectedPath);
    }
  }, [files, selectedPath]);

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <div className="grid gap-4 p-1">
        {files.map((file) => (
          <div
            key={file.path}
            data-file-path={file.path}
            ref={(node) => {
              if (node == null) {
                sectionRefs.current.delete(file.path);
              } else {
                sectionRefs.current.set(file.path, node);
              }
            }}
            className="scroll-mt-2"
          >
            <FileDiffSection
              collapsed={collapsedFilePaths.has(file.path)}
              diffOptions={diffOptions}
              file={file}
              fileDiff={fileDiffs[file.path] ?? null}
              onCollapsedChange={onCollapsedFileChange}
              onViewedChange={onViewedFileChange}
              viewed={viewedFilePaths.has(file.path)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FileDiffSection({
  collapsed,
  diffOptions,
  file,
  fileDiff,
  onCollapsedChange,
  onViewedChange,
  viewed,
}: {
  collapsed: boolean;
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  file: DiffFileSummary;
  fileDiff: FileDiffMetadata | null;
  onCollapsedChange: (path: string, value: boolean) => void;
  onViewedChange: (path: string, value: boolean) => void;
  viewed: boolean;
}) {
  const [commentAnnotations, setCommentAnnotations] = useState<CommentAnnotation[]>([]);
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null);
  const [unresolvedFile, setUnresolvedFile] = useState<FileContents | null>(null);
  const [unresolvedLoading, setUnresolvedLoading] = useState(false);

  useEffect(() => {
    if (file.hasMergeConflicts !== true) return;
    const params = new URLSearchParams({ path: file.path });
    let cancelled = false;
    setUnresolvedLoading(true);
    void fetchJson<FileContents>(`/api/unresolved-file?${params.toString()}`)
      .then((contents) => {
        if (!cancelled) setUnresolvedFile(contents);
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
      return [
        ...current,
        {
          side,
          lineNumber,
          metadata: {
            id: `${side}-${lineNumber}-${Date.now()}`,
            kind: "comment-form",
          },
        },
      ];
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
      setCommentAnnotations((current) =>
        current.map((annotation) =>
          annotation.metadata.id === id
            ? {
                ...annotation,
                metadata: {
                  ...annotation.metadata,
                  body: body.trim().length > 0 ? body.trim() : "Needs review before merging.",
                  kind: "comment",
                },
              }
            : annotation,
        ),
      );
      setSelectedLines(null);
      diffOptions?.onLineSelected?.(null);
    },
    [diffOptions],
  );

  const fileDiffOptions = useMemo(
    () => ({
      ...diffOptions,
      collapsed: diffOptions?.collapsed === true || collapsed,
      enableGutterUtility: !commentAnnotations.some(
        (annotation) => annotation.metadata.kind === "comment-form",
      ),
      enableLineSelection: !commentAnnotations.some(
        (annotation) => annotation.metadata.kind === "comment-form",
      ),
      onLineSelectionEnd: handleLineSelectionEnd,
    }),
    [collapsed, commentAnnotations, diffOptions, handleLineSelectionEnd],
  );

  if (file.hasMergeConflicts === true) {
    if (unresolvedLoading || unresolvedFile == null) {
      return (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="grid place-items-center rounded-md border border-border/40 p-6 text-xs text-muted-foreground"
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
        renderCustomHeader={(metadataFileDiff) => (
          <CustomFileHeader
            collapsed={collapsed}
            fileDiff={metadataFileDiff}
            hasMergeConflicts
            onCollapsedChange={(next) => onCollapsedChange(file.path, next)}
            onViewedChange={(next) => {
              onViewedChange(file.path, next);
              onCollapsedChange(file.path, next);
            }}
            viewed={viewed}
          />
        )}
        disableWorkerPool
      />
    );
  }

  if (fileDiff == null) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="grid place-items-center rounded-md border border-border/40 p-6 text-xs text-muted-foreground"
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
      renderCustomHeader={(metadataFileDiff) => (
        <CustomFileHeader
          collapsed={collapsed}
          fileDiff={metadataFileDiff}
          hasMergeConflicts={file.hasMergeConflicts === true}
          onCollapsedChange={(next) => onCollapsedChange(file.path, next)}
          onViewedChange={(next) => {
            onViewedChange(file.path, next);
            onCollapsedChange(file.path, next);
          }}
          viewed={viewed}
        />
      )}
    />
  );
}

function CustomFileHeader({
  collapsed,
  fileDiff,
  hasMergeConflicts = false,
  onCollapsedChange,
  onViewedChange,
  viewed,
}: {
  collapsed: boolean;
  fileDiff: FileDiffMetadata;
  hasMergeConflicts?: boolean;
  onCollapsedChange: (next: boolean) => void;
  onViewedChange: (next: boolean) => void;
  viewed: boolean;
}) {
  const counts = useMemo(
    () =>
      fileDiff.hunks.reduce(
        (total, hunk) => ({
          additions: total.additions + hunk.additionLines,
          deletions: total.deletions + hunk.deletionLines,
        }),
        { additions: 0, deletions: 0 },
      ),
    [fileDiff.hunks],
  );

  return (
    <div
      className={`flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5 ${
        collapsed ? "" : "border-b border-border/70"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label={collapsed ? `Expand ${fileDiff.name}` : `Collapse ${fileDiff.name}`}
          aria-pressed={collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronIcon expanded={!collapsed} />
        </button>
        <FileIcon />
        <span
          className="min-w-0 truncate text-sm font-medium text-foreground"
          translate="no"
          title={fileDiff.name}
        >
          {fileDiff.name}
        </span>
        {hasMergeConflicts ? (
          <span className="inline-flex shrink-0 items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-amber-500">
            Conflict
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums">
        {counts.deletions > 0 || counts.additions === 0 ? (
          <span className="text-diff-deleted">-{counts.deletions}</span>
        ) : null}
        {counts.additions > 0 || counts.deletions === 0 ? (
          <span className="text-diff-added">+{counts.additions}</span>
        ) : null}
        <ViewedButton
          filePath={fileDiff.name}
          viewed={viewed}
          onClick={() => onViewedChange(!viewed)}
        />
      </div>
    </div>
  );
}

function CommentAnnotationView({
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
      <div className="my-3 ml-4 max-w-2xl rounded-md border border-border/70 bg-card p-3 shadow-sm">
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
    <div className="my-3 ml-4 max-w-2xl rounded-md border border-border/70 bg-card p-3 shadow-sm">
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
        placeholder="Leave a comment"
        className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-shadow focus:ring-2 focus:ring-ring"
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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[0.3rem] border border-sky-500 text-sky-500"
    >
      <span className="h-1.5 w-1.5 rounded-sm bg-sky-500" />
    </span>
  );
}

function ViewedButton({
  filePath,
  onClick,
  viewed,
}: {
  filePath: string;
  onClick: () => void;
  viewed: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={viewed ? `Mark ${filePath} unviewed` : `Mark ${filePath} viewed`}
      aria-pressed={viewed}
      onClick={onClick}
      className={`ml-1 inline-flex h-7 items-center gap-1.5 rounded-[0.55rem] border px-2 font-sans text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        viewed
          ? "border-sky-500/75 bg-sky-500/10 text-sky-200 hover:bg-sky-500/15"
          : "border-border/90 bg-black/20 text-muted-foreground hover:border-muted-foreground/50 hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      <ViewedIcon checked={viewed} />
      <span>Viewed</span>
    </button>
  );
}

function ViewedIcon({ checked }: { checked: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-4 w-4 shrink-0">
      <rect
        x="1.75"
        y="1.75"
        width="12.5"
        height="12.5"
        rx="3.5"
        className={checked ? "fill-sky-500 stroke-sky-500" : "stroke-current"}
        strokeWidth="1.6"
      />
      {checked ? (
        <path
          d="M5 8.1l2.05 2.05L11.25 5.8"
          stroke="white"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
