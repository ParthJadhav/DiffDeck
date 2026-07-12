import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
import { Toaster } from "sonner";
import { prepareFileTreeInput } from "@pierre/trees";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Sidebar, type SidebarProps } from "./components/Sidebar.js";
import { DiffWorkspace, type DiffWorkspaceProps } from "./components/DiffWorkspace.js";
import { DiffControls, type DiffControlsProps } from "./components/DiffControls.js";
import { CopyCommentsButton } from "./components/CopyCommentsButton.js";
import { CommandMenu } from "./components/CommandMenu.js";
import { ReviewFiltersBar } from "./components/ReviewFiltersBar.js";
import { ReReviewSummary } from "./components/ReReviewSummary.js";
import { ShellState } from "./components/ShellState.js";
import { useSession } from "./hooks/useSession.js";
import { useFileDiff } from "./hooks/useFileDiff.js";
import { useReviewSession } from "./hooks/useReviewSession.js";
import { useWatchEvents } from "./hooks/useWatchEvents.js";
import { useDiffTree } from "./hooks/useDiffTree.js";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { fileTreeShapeOptions, highlighterLangs, themeOptions } from "./lib/constants.js";
import { filterDiffFiles } from "./lib/fileFilters.js";
import type { CommentExportRecord } from "./lib/commentExport.js";
import type { ReviewSessionSnapshot } from "./lib/reviewSession.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "./lib/uiTypes.js";
import type { SessionPayload } from "./types.js";
import { workerFactory } from "./workerFactory.js";

const lineDiffType = "word-alt" as const;
const hunkSeparators: HunkSeparatorMode = "custom";
const LARGE_DIFF_LINE_THRESHOLD = 800;

export function App() {
  const { session, loading, refreshing, error, revision, refresh } = useSession();

  if (loading) {
    return <ShellState>Loading diff session…</ShellState>;
  }

  if (error != null) {
    return <ShellState variant="error">{error}</ShellState>;
  }

  if (session == null) {
    return <ShellState>No session data available.</ShellState>;
  }

  return (
    <>
      <Toaster richColors position="bottom-right" />
      <WorkerPoolContextProvider
        poolOptions={{ workerFactory }}
        highlighterOptions={{
          langs: [...highlighterLangs],
          theme: themeOptions,
          lineDiffType,
        }}
      >
        <WorkerPoolRenderOptionsSync />
        <DiffDeckSession
          refresh={refresh}
          refreshing={refreshing}
          revision={revision}
          session={session}
        />
      </WorkerPoolContextProvider>
    </>
  );
}

function DiffDeckSession({
  refresh,
  refreshing,
  revision,
  session,
}: {
  refresh: () => void;
  refreshing: boolean;
  revision: number;
  session: SessionPayload;
}) {
  const [themeType, setThemeType] = useLocalStorage<ThemeChoice>(
    "diffdeck.settings.themeType",
    "system",
  );
  const [diffStyle, setDiffStyle] = useLocalStorage<DiffLayout>(
    "diffdeck.settings.diffStyle",
    "split",
  );
  const [overflow, setOverflow] = useLocalStorage<OverflowMode>(
    "diffdeck.settings.overflow",
    "scroll",
  );
  const [disableBackground, setDisableBackground] = useLocalStorage(
    "diffdeck.settings.disableBackground",
    false,
  );
  const [showLineNumbers, setShowLineNumbers] = useLocalStorage(
    "diffdeck.settings.showLineNumbers",
    true,
  );
  const [expandUnchanged, setExpandUnchanged] = useLocalStorage(
    "diffdeck.settings.expandUnchanged",
    false,
  );
  const [autoRefresh, setAutoRefresh] = useLocalStorage("diffdeck.settings.autoRefresh", false);
  useWatchEvents(session.capabilities?.watch === true, refresh, autoRefresh);
  const sessionFilesByPath = useMemo(
    () => new Map(session.files.map((file) => [file.path, file])),
    [session],
  );
  const orderedFiles = useMemo(
    () => orderSessionFiles(session, sessionFilesByPath),
    [session, sessionFilesByPath],
  );
  const reviewSnapshot = useMemo<ReviewSessionSnapshot>(
    () => ({
      diffArgs: session.diffArgs,
      files: orderedFiles.map((file) => ({
        diffId: file.diffId,
        path: file.path,
        prevPath: file.prevPath,
      })),
      repoRoot: session.repoRoot,
      snapshotId: session.snapshotId,
    }),
    [orderedFiles, session.diffArgs, session.repoRoot, session.snapshotId],
  );
  const autoCollapsedPaths = useMemo(() => getAutoCollapsedPaths(orderedFiles), [orderedFiles]);
  const [preferredSelectedPath] = useState(() =>
    new URLSearchParams(window.location.search).get("file"),
  );
  const reviewSession = useReviewSession(reviewSnapshot, autoCollapsedPaths, preferredSelectedPath);
  const [scrollSignal, setScrollSignal] = useState(0);
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)");
  const supportsSplitDiff = useMediaQuery("(min-width: 640px)");
  const effectiveDiffStyle = supportsSplitDiff ? diffStyle : "unified";
  const selectedPath = reviewSession.state.selectedPath;
  const collapsedFilePaths = reviewSession.collapsedPaths;
  const viewedFilePaths = reviewSession.viewedPaths;
  const commentExports = reviewSession.state.commentExports;
  const reconcileComments = reviewSession.reconcileComments;
  const deepLinkIdentityRef = useRef<string | null>(null);
  const visibleFiles = useMemo(
    () => filterDiffFiles(orderedFiles, reviewSession.state.filters, viewedFilePaths),
    [orderedFiles, reviewSession.state.filters, viewedFilePaths],
  );
  const visibleSession = useMemo(
    () => ({ ...session, files: visibleFiles }),
    [session, visibleFiles],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", themeType === "light");
    root.classList.toggle("dark", themeType === "dark");
  }, [themeType]);

  const {
    fileDiffErrors,
    fileDiffs,
    requestPath,
    reset: resetFileDiffs,
    retryPath,
  } = useFileDiff();

  useEffect(() => {
    resetFileDiffs();
  }, [resetFileDiffs, revision]);

  useEffect(() => {
    reconcileComments(fileDiffs, session.snapshotId);
  }, [fileDiffs, reconcileComments, session.snapshotId]);

  useEffect(() => {
    if (deepLinkIdentityRef.current === reviewSession.state.identity) return;
    deepLinkIdentityRef.current = reviewSession.state.identity;
    const requestedPath = new URLSearchParams(window.location.search).get("file");
    if (requestedPath != null && sessionFilesByPath.has(requestedPath)) {
      reviewSession.setSelectedPath(requestedPath);
    }
  }, [reviewSession, sessionFilesByPath]);

  useEffect(() => {
    if (selectedPath != null && visibleFiles.some((file) => file.path === selectedPath)) return;
    reviewSession.setSelectedPath(visibleFiles[0]?.path ?? null);
  }, [reviewSession, selectedPath, visibleFiles]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedPath == null) url.searchParams.delete("file");
    else url.searchParams.set("file", selectedPath);
    window.history.replaceState(null, "", url);
  }, [selectedPath]);

  useEffect(() => {
    const updateLine = (event: Event) => {
      const detail = (event as CustomEvent<{ line: number; side: string }>).detail;
      const url = new URL(window.location.href);
      url.searchParams.set("line", String(detail.line));
      url.searchParams.set("side", detail.side);
      window.history.replaceState(null, "", url);
    };
    window.addEventListener("diffdeck:line-selected", updateLine);
    return () => window.removeEventListener("diffdeck:line-selected", updateLine);
  }, []);

  const handleTreeSelection = useCallback(
    (path: string | null) => {
      reviewSession.setSelectedPath(path);
      if (path != null) setScrollSignal((current) => current + 1);
      const selectedFile = path == null ? null : sessionFilesByPath.get(path);
      if (selectedFile?.hasMergeConflicts !== true && selectedFile?.isBinary !== true) {
        if (path != null) requestPath(path);
      }
    },
    [requestPath, reviewSession, sessionFilesByPath],
  );

  const handleVisiblePathChange = useCallback(
    (path: string) => {
      reviewSession.setSelectedPath(path);
    },
    [reviewSession],
  );

  const handleCollapsedFileChange = useCallback(
    (path: string, value: boolean) => {
      reviewSession.setCollapsed(path, value);
      if (!value) requestPath(path);
    },
    [requestPath, reviewSession],
  );

  const handleViewedFileChange = useCallback(
    (path: string, value: boolean) => reviewSession.setViewed(path, value),
    [reviewSession],
  );

  const handleCommentSaved = useCallback(
    (comment: CommentExportRecord) =>
      reviewSession.upsertComment({ ...comment, snapshotId: session.snapshotId, status: "open" }),
    [reviewSession, session.snapshotId],
  );

  const handleCommentDeleted = useCallback(
    (id: string) => reviewSession.deleteComment(id),
    [reviewSession],
  );

  const handleClearAllComments = reviewSession.clearComments;

  const treeModel = useDiffTree({
    session: visibleSession,
    selectedPath,
    viewedPaths: viewedFilePaths,
    onSelectionChange: handleTreeSelection,
  });

  const selectedFile = selectedPath == null ? null : (sessionFilesByPath.get(selectedPath) ?? null);

  const orderedCommentExports = useMemo(() => {
    const fileOrder = new Map(orderedFiles.map((file, index) => [file.path, index]));
    const commentOrder = new Map(commentExports.map((comment, index) => [comment.id, index]));
    const ordered: CommentExportRecord[] = [];

    for (const comment of commentExports) {
      let low = 0;
      let high = ordered.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (compareCommentExports(comment, ordered[mid]!, fileOrder, commentOrder) < 0) {
          high = mid;
        } else {
          low = mid + 1;
        }
      }
      ordered.splice(low, 0, comment);
    }

    return ordered;
  }, [commentExports, orderedFiles]);

  const controlsProps = {
    autoRefresh,
    diffStyle: effectiveDiffStyle,
    disableBackground,
    expandUnchanged,
    onDiffStyleChange: (next) => {
      if (supportsSplitDiff || next === "unified") {
        setDiffStyle(next);
      }
    },
    onDisableBackgroundChange: setDisableBackground,
    onAutoRefreshChange: setAutoRefresh,
    onExpandUnchangedChange: setExpandUnchanged,
    onOverflowChange: setOverflow,
    onShowLineNumbersChange: setShowLineNumbers,
    onThemeTypeChange: setThemeType,
    overflow,
    showLineNumbers,
    themeType,
  } satisfies DiffControlsProps;

  const diffTotals = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const file of visibleFiles) {
      additions += file.additions;
      deletions += file.deletions;
    }
    return { additions, deletions };
  }, [visibleFiles]);

  const sidebarProps = {
    diffArgs: session.diffArgs,
    fileCount: visibleFiles.length,
    onRefresh: refresh,
    refreshing,
    totals: diffTotals,
    treeModel,
    viewedCount: viewedFilePaths.size,
  } satisfies Omit<SidebarProps, "footer">;

  const workspaceProps = {
    annotationsByFile: reviewSession.state.annotationsByFile,
    collapsedFilePaths,
    capabilities: session.capabilities,
    diffStyle: effectiveDiffStyle,
    disableBackground,
    expandUnchanged,
    fileDiffs,
    fileDiffErrors,
    files: visibleFiles,
    hunkSeparators,
    onAnnotationsChange: reviewSession.updateAnnotations,
    onCollapsedFileChange: handleCollapsedFileChange,
    onCommentDeleted: handleCommentDeleted,
    onCommentSaved: handleCommentSaved,
    onRequestFileDiff: requestPath,
    onRetryFileDiff: retryPath,
    onViewedFileChange: handleViewedFileChange,
    onVisiblePathChange: handleVisiblePathChange,
    onSessionRefresh: refresh,
    overflow,
    scrollSignal,
    selectedFile,
    selectedPath,
    snapshotId: session.snapshotId,
    sessionRevision: revision,
    showLineNumbers,
    themeType,
    viewedFilePaths,
  } satisfies DiffWorkspaceProps;

  const sidebarFooter = (
    <div className="flex flex-col gap-2">
      <ReviewFiltersBar
        filters={reviewSession.state.filters}
        onChange={reviewSession.setFilters}
        resultCount={visibleFiles.length}
        totalCount={orderedFiles.length}
      />
      <ReReviewSummary
        comments={orderedCommentExports}
        onRemoveStatus={reviewSession.removeCommentsByStatus}
      />
      <CopyCommentsButton
        comments={orderedCommentExports}
        diffArgs={session.diffArgs}
        onClearAll={handleClearAllComments}
        repoRoot={session.repoRoot}
        snapshotId={session.snapshotId}
        totalFiles={orderedFiles.length}
        viewedFiles={viewedFilePaths.size}
      />
      <DiffControls {...controlsProps} />
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Reset all review progress, filters, drafts, and comments?")) {
            reviewSession.resetReview();
          }
        }}
        className="h-7 text-left text-[10.5px] text-muted-foreground hover:text-foreground"
      >
        Reset review state
      </button>
    </div>
  );

  return (
    <>
      <CommandMenu
        collapsedPaths={collapsedFilePaths}
        editorEnabled={session.capabilities?.editor === true}
        files={visibleFiles}
        onCollapsedChange={handleCollapsedFileChange}
        onSelectPath={handleTreeSelection}
        onViewedChange={handleViewedFileChange}
        selectedPath={selectedPath}
        viewedPaths={viewedFilePaths}
      />
      <DiffDeckLayout
        isDesktopLayout={isDesktopLayout}
        sidebarFooter={sidebarFooter}
        sidebarProps={sidebarProps}
        workspaceProps={workspaceProps}
      />
    </>
  );
}

function orderSessionFiles(
  session: SessionPayload,
  filesByPath: ReadonlyMap<string, SessionPayload["files"][number]>,
) {
  const prepared = prepareFileTreeInput(
    session.files.map((file) => file.path),
    fileTreeShapeOptions,
  );
  const ordered: SessionPayload["files"] = [];
  const orderedPaths = new Set<string>();
  for (const path of prepared.paths) {
    const file = filesByPath.get(path);
    if (file != null) {
      ordered.push(file);
      orderedPaths.add(path);
    }
  }
  for (const file of session.files) {
    if (!orderedPaths.has(file.path)) ordered.push(file);
  }
  return ordered;
}

function getAutoCollapsedPaths(files: readonly SessionPayload["files"][number][]): string[] {
  const paths: string[] = [];
  for (const file of files) {
    if (file.additions + file.deletions >= LARGE_DIFF_LINE_THRESHOLD) {
      paths.push(file.path);
    }
  }
  return paths;
}

function DiffDeckLayout({
  isDesktopLayout,
  sidebarFooter,
  sidebarProps,
  workspaceProps,
}: {
  isDesktopLayout: boolean;
  sidebarFooter: ReactNode;
  sidebarProps: Omit<SidebarProps, "footer">;
  workspaceProps: DiffWorkspaceProps;
}) {
  return (
    <div className="h-dvh w-screen overflow-hidden bg-background text-foreground">
      {isDesktopLayout ? (
        <PanelGroup id="diffdeck-layout" orientation="horizontal" className="flex h-full w-full">
          <Panel defaultSize="20%" minSize="12%" maxSize="45%" className="min-h-0">
            <Sidebar {...sidebarProps} footer={sidebarFooter} />
          </Panel>
          <PanelResizeHandle
            aria-label="Resize file tree and diff panels"
            className="app-resize-handle group relative w-px"
          >
            <span className="absolute inset-y-0 -left-1 -right-1" />
          </PanelResizeHandle>
          <Panel minSize="30%" className="min-h-0">
            <DiffWorkspace {...workspaceProps} />
          </Panel>
        </PanelGroup>
      ) : (
        <div
          className="grid h-full w-full grid-cols-1 overflow-hidden"
          style={{ gridTemplateRows: "minmax(11rem, min(28dvh, 13.75rem)) minmax(0, 1fr)" }}
        >
          <Sidebar {...sidebarProps} footer={sidebarFooter} />
          <DiffWorkspace {...workspaceProps} />
        </div>
      )}
    </div>
  );
}

function compareCommentExports(
  a: CommentExportRecord,
  b: CommentExportRecord,
  fileOrder: ReadonlyMap<string, number>,
  commentOrder: ReadonlyMap<string, number>,
) {
  const fileDelta =
    (fileOrder.get(a.filePath) ?? Number.MAX_SAFE_INTEGER) -
    (fileOrder.get(b.filePath) ?? Number.MAX_SAFE_INTEGER);
  if (fileDelta !== 0) return fileDelta;

  const lineDelta = a.lineNumber - b.lineNumber;
  if (lineDelta !== 0) return lineDelta;

  if (a.side !== b.side) return a.side === "deletions" ? -1 : 1;

  return (commentOrder.get(a.id) ?? 0) - (commentOrder.get(b.id) ?? 0);
}

function WorkerPoolRenderOptionsSync() {
  const pool = useWorkerPool();
  useEffect(() => {
    if (pool == null) return;
    void pool.setRenderOptions({ lineDiffType });
  }, [pool]);
  return null;
}
