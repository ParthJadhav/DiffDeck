import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
import { Toaster, toast } from "sonner";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Accessibility, ArrowLeft, Files } from "lucide-react";
import { FOCUS_FILE_SEARCH_EVENT, Sidebar, type SidebarProps } from "./components/Sidebar.js";
import { DiffWorkspace, type DiffWorkspaceProps } from "./components/DiffWorkspace.js";
import { DiffControls, type DiffControlsProps } from "./components/DiffControls.js";
import { CommandMenu } from "./components/CommandMenu.js";
import { ReReviewSummary } from "./components/ReReviewSummary.js";
import { ReviewNotesHub } from "./components/ReviewNotesHub.js";
import { ReviewNavigator } from "./components/ReviewNavigator.js";
import { HandoffBar, PacketPreview } from "./components/ReviewHandoff.js";
import { ShellState } from "./components/ShellState.js";
import { ConfirmationDialog } from "./components/ui/confirmation-dialog.js";
import { Button } from "./components/ui/button.js";
import { useSession } from "./hooks/useSession.js";
import { useFileDiff } from "./hooks/useFileDiff.js";
import { useReviewSession } from "./hooks/useReviewSession.js";
import { useWatchEvents } from "./hooks/useWatchEvents.js";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { highlighterLangs, themeOptions } from "./lib/constants.js";
import { filterDiffFiles } from "./lib/fileFilters.js";
import { buildDiffDeepLink, buildSelectedFileUrl, readDiffLocation } from "./lib/deepLink.js";
import { getHunkNavigation, type HunkTarget } from "./lib/hunkNavigation.js";
import { getReviewNavigation } from "./lib/reviewNavigation.js";
import { orderDiffFiles } from "./lib/fileOrder.js";
import { cn } from "./lib/cn.js";
import type { CommentExportRecord } from "./lib/commentExport.js";
import { emptyReviewFilters, type ReviewSessionSnapshot } from "./lib/reviewSession.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "./lib/uiTypes.js";
import type { DiffWhitespaceMode, SessionPayload } from "./types.js";
import { workerFactory } from "./workerFactory.js";

const lineDiffType = "word-alt" as const;
const hunkSeparators: HunkSeparatorMode = "custom";
const LARGE_DIFF_LINE_THRESHOLD = 800;

export function App() {
  const { session, loading, refreshing, error, revision, refresh, reload, setWhitespaceMode } =
    useSession();

  if (loading) {
    return <ShellState>Loading diff session…</ShellState>;
  }

  if (error != null) {
    return (
      <ShellState variant="error">
        <div className="space-y-3">
          <p>{error}</p>
          <Button onClick={reload} size="sm" variant="outline">
            Retry session
          </Button>
        </div>
      </ShellState>
    );
  }

  if (session == null) {
    return <ShellState>No session data available.</ShellState>;
  }

  return (
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
        reload={reload}
        refreshing={refreshing}
        revision={revision}
        session={session}
        setWhitespaceMode={setWhitespaceMode}
      />
    </WorkerPoolContextProvider>
  );
}

type DiffDeckSessionProps = {
  refresh: () => void;
  reload: () => void;
  refreshing: boolean;
  revision: number;
  session: SessionPayload;
  setWhitespaceMode: (mode: DiffWhitespaceMode) => Promise<void>;
};

function DiffDeckSession(props: DiffDeckSessionProps) {
  return <DiffDeckSessionView {...useDiffDeckSessionModel(props)} />;
}

function useDiffDeckSessionModel({
  refresh,
  reload,
  refreshing,
  revision,
  session,
  setWhitespaceMode,
}: DiffDeckSessionProps) {
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
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
  useWatchEvents(session.capabilities?.watch === true, reload, autoRefresh);
  const sessionFilesByPath = useMemo(
    () => new Map(session.files.map((file) => [file.path, file])),
    [session],
  );
  const canonicalFiles = useMemo(() => orderDiffFiles(session.files, "path"), [session.files]);
  const reviewSnapshot = useMemo<ReviewSessionSnapshot>(
    () => ({
      diffArgs: session.diffArgs,
      files: canonicalFiles.map((file) => ({
        diffId: file.diffId,
        path: file.path,
        prevPath: file.prevPath,
      })),
      repoRoot: session.repoRoot,
      snapshotId: session.snapshotId,
    }),
    [canonicalFiles, session.diffArgs, session.repoRoot, session.snapshotId],
  );
  const [preferredSelectedPath] = useState(() =>
    new URLSearchParams(window.location.search).get("file"),
  );
  const autoCollapsedPaths = useMemo(
    () => getAutoCollapsedPaths(canonicalFiles).filter((path) => path !== preferredSelectedPath),
    [canonicalFiles, preferredSelectedPath],
  );
  const {
    fileDiffErrors,
    fileDiffs,
    requestPath,
    reset: resetFileDiffs,
    retryPath,
  } = useFileDiff();
  const reviewSession = useReviewSession(
    reviewSnapshot,
    autoCollapsedPaths,
    fileDiffs,
    preferredSelectedPath,
  );
  const orderedFiles = useMemo(
    () => orderDiffFiles(session.files, reviewSession.state.fileOrder),
    [reviewSession.state.fileOrder, session.files],
  );
  const [initialDiffLocation] = useState(() => readDiffLocation(window.location.href));
  const [storedSelectedLocation, setSelectedLocation] = useState<
    ({ path: string } & Pick<HunkTarget, "line" | "side">) | null
  >(() => {
    return initialDiffLocation.file != null &&
      initialDiffLocation.line != null &&
      initialDiffLocation.side != null
      ? {
          line: initialDiffLocation.line,
          path: initialDiffLocation.file,
          side: initialDiffLocation.side,
        }
      : null;
  });
  const [scrollSignal, setScrollSignal] = useState(0);
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)");
  const supportsSplitDiff = useMediaQuery("(min-width: 900px)");
  const effectiveDiffStyle = supportsSplitDiff ? diffStyle : "unified";
  const selectedPath = reviewSession.state.selectedPath;
  const selectedLocation = useMemo(
    () =>
      storedSelectedLocation?.path === selectedPath
        ? { line: storedSelectedLocation.line, side: storedSelectedLocation.side }
        : null,
    [selectedPath, storedSelectedLocation],
  );
  const collapsedFilePaths = reviewSession.collapsedPaths;
  const viewedFilePaths = reviewSession.viewedPaths;
  const commentExports = reviewSession.state.commentExports;
  const deepLinkIdentityRef = useRef<string | null>(null);
  const visibleFiles = useMemo(
    () => filterDiffFiles(orderedFiles, reviewSession.state.filters, viewedFilePaths),
    [orderedFiles, reviewSession.state.filters, viewedFilePaths],
  );
  const reviewNavigation = useMemo(
    () => getReviewNavigation(visibleFiles, selectedPath, viewedFilePaths),
    [selectedPath, viewedFilePaths, visibleFiles],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", themeType === "light");
    root.classList.toggle("dark", themeType === "dark");
  }, [themeType]);

  // Reset the diff cache during render rather than in an effect: comment
  // reconciliation must never observe diffs fetched for a previous snapshot,
  // or stale notes would be re-anchored against outdated content.
  const [diffCacheRevision, setDiffCacheRevision] = useState(revision);
  if (diffCacheRevision !== revision) {
    setDiffCacheRevision(revision);
    resetFileDiffs();
  }

  const requestSessionFileDiff = useCallback(
    (path: string) => {
      // Virtualized cards can outlive their session entry for one paint after
      // a write action removes a file; requesting those paths would 404.
      if (sessionFilesByPath.has(path)) requestPath(path);
    },
    [requestPath, sessionFilesByPath],
  );

  useEffect(() => {
    if (selectedPath == null) return;
    const selectedFile = sessionFilesByPath.get(selectedPath);
    // A write action can remove the selected file from the session before the
    // selection is renormalized; requesting its diff would 404.
    if (selectedFile == null) return;
    if (selectedFile.hasMergeConflicts === true || selectedFile.isBinary === true) return;
    requestPath(selectedPath);
  }, [requestPath, selectedPath, sessionFilesByPath]);

  useEffect(() => {
    if (deepLinkIdentityRef.current === reviewSession.state.identity) return;
    deepLinkIdentityRef.current = reviewSession.state.identity;
    const requestedPath = new URLSearchParams(window.location.search).get("file");
    if (requestedPath != null && sessionFilesByPath.has(requestedPath)) {
      reviewSession.setSelectedPath(requestedPath);
    }
  }, [reviewSession, sessionFilesByPath]);

  useEffect(() => {
    const restoreLocation = () => {
      const location = readDiffLocation(window.location.href);
      const path =
        location.file != null && sessionFilesByPath.has(location.file)
          ? location.file
          : (orderedFiles[0]?.path ?? null);
      const lineLocation =
        path != null && location.file === path && location.line != null && location.side != null
          ? { line: location.line, path, side: location.side }
          : null;
      setSelectedLocation(
        lineLocation == null
          ? null
          : { line: lineLocation.line, path: lineLocation.path, side: lineLocation.side },
      );
      if (lineLocation != null && collapsedFilePaths.has(path)) {
        reviewSession.setCollapsed(path, false);
        requestPath(path);
      }
      reviewSession.setSelectedPath(path);
      setScrollSignal((current) => current + 1);
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [collapsedFilePaths, orderedFiles, requestPath, reviewSession, sessionFilesByPath]);

  useEffect(() => {
    if (selectedPath != null && visibleFiles.some((file) => file.path === selectedPath)) return;
    reviewSession.setSelectedPath(visibleFiles[0]?.path ?? null);
  }, [reviewSession, selectedPath, visibleFiles]);

  useEffect(() => {
    const nextHref = buildSelectedFileUrl(window.location.href, selectedPath);
    window.history.replaceState(null, "", nextHref);
  }, [selectedPath]);

  useEffect(() => {
    const updateLine = (event: Event) => {
      const detail = (
        event as CustomEvent<{ line: number; path: string; side: HunkTarget["side"] }>
      ).detail;
      if (detail.path !== selectedPath) return;
      setSelectedLocation({ line: detail.line, path: detail.path, side: detail.side });
      window.history.replaceState(
        null,
        "",
        buildDiffDeepLink(window.location.href, detail.path, detail),
      );
    };
    window.addEventListener("diffdeck:line-selected", updateLine);
    return () => window.removeEventListener("diffdeck:line-selected", updateLine);
  }, [selectedPath]);

  const handleTreeSelection = useCallback(
    (path: string | null) => {
      if (path !== selectedPath) {
        setSelectedLocation(null);
        window.history.pushState(null, "", buildSelectedFileUrl(window.location.href, path));
      }
      reviewSession.setSelectedPath(path);
      if (path != null) setScrollSignal((current) => current + 1);
      const selectedFile = path == null ? null : sessionFilesByPath.get(path);
      if (selectedFile?.hasMergeConflicts !== true && selectedFile?.isBinary !== true) {
        if (path != null) requestPath(path);
      }
    },
    [requestPath, reviewSession, selectedPath, sessionFilesByPath],
  );

  const handleHubCommentUpdate = useCallback(
    (comment: CommentExportRecord) => {
      reviewSession.updateAnnotations(comment.filePath, (current) =>
        current.map((annotation) =>
          annotation.metadata.id === comment.id
            ? {
                ...annotation,
                metadata: { ...annotation.metadata, body: comment.body },
              }
            : annotation,
        ),
      );
      reviewSession.upsertComment(comment);
    },
    [reviewSession],
  );

  const handleHubCommentDelete = useCallback(
    (comment: CommentExportRecord) => {
      reviewSession.updateAnnotations(comment.filePath, (current) =>
        current.filter((annotation) => annotation.metadata.id !== comment.id),
      );
      reviewSession.deleteComment(comment.id);
    },
    [reviewSession],
  );

  const handleJumpToComment = useCallback(
    (comment: CommentExportRecord) => {
      if (!visibleFiles.some((file) => file.path === comment.filePath)) {
        reviewSession.setFilters({ ...emptyReviewFilters });
        toast.info("Cleared review filters to show this note");
      }
      handleTreeSelection(comment.filePath);
      const status = comment.status ?? "open";
      const scope = comment.scope ?? "line";
      if (scope === "line" && status === "open") {
        const target = { line: comment.lineNumber, path: comment.filePath, side: comment.side };
        setSelectedLocation(target);
        window.history.replaceState(
          null,
          "",
          buildDiffDeepLink(window.location.href, comment.filePath, target),
        );
        window.dispatchEvent(
          new CustomEvent("diffdeck:navigate-line", {
            detail: { ...target, path: comment.filePath },
          }),
        );
      }
      window.dispatchEvent(
        new CustomEvent("diffdeck:focus-note", {
          detail: {
            id: comment.id,
            path: comment.filePath,
            scope: scope === "line" && status === "open" ? "line" : "file",
          },
        }),
      );
    },
    [handleTreeSelection, reviewSession, visibleFiles],
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

  const selectedFile =
    selectedPath == null ? null : (visibleFiles.find((file) => file.path === selectedPath) ?? null);
  const hunkNavigation = useMemo(
    () =>
      getHunkNavigation(
        selectedPath == null ? null : (fileDiffs[selectedPath] ?? null),
        selectedLocation,
      ),
    [fileDiffs, selectedLocation, selectedPath],
  );
  const handleNavigateHunk = useCallback(
    (target: HunkTarget) => {
      if (selectedPath == null) return;
      if (collapsedFilePaths.has(selectedPath)) handleCollapsedFileChange(selectedPath, false);
      setSelectedLocation({ ...target, path: selectedPath });
      window.history.replaceState(
        null,
        "",
        buildDiffDeepLink(window.location.href, selectedPath, target),
      );
      window.dispatchEvent(
        new CustomEvent("diffdeck:navigate-line", {
          detail: { line: target.line, path: selectedPath, side: target.side },
        }),
      );
    },
    [collapsedFilePaths, handleCollapsedFileChange, selectedPath],
  );
  const workspaceFiles =
    reviewSession.state.reviewMode === "focus" && selectedFile != null
      ? [selectedFile]
      : visibleFiles;

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
    onWhitespaceModeChange: (mode) => void setWhitespaceMode(mode),
    overflow,
    showLineNumbers,
    themeType,
    whitespaceMode: session.preferences?.whitespaceMode ?? "normal",
    whitespaceModeChanging: refreshing,
  } satisfies DiffControlsProps;

  const diffTotals = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const file of orderedFiles) {
      additions += file.additions;
      deletions += file.deletions;
    }
    return { additions, deletions };
  }, [orderedFiles]);

  const noteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of commentExports) {
      counts.set(comment.filePath, (counts.get(comment.filePath) ?? 0) + 1);
    }
    return counts;
  }, [commentExports]);

  const viewedCount = useMemo(
    () => orderedFiles.filter((file) => viewedFilePaths.has(file.path)).length,
    [orderedFiles, viewedFilePaths],
  );

  const sidebarProps = {
    diffArgs: session.diffArgs,
    fileOrder: reviewSession.state.fileOrder,
    files: visibleFiles,
    fileViewMode: reviewSession.state.fileViewMode,
    filters: reviewSession.state.filters,
    noteCounts,
    notesCount: commentExports.length,
    onFileOrderChange: reviewSession.setFileOrder,
    onFileViewModeChange: reviewSession.setFileViewMode,
    onFiltersChange: reviewSession.setFilters,
    onRefresh: refresh,
    onSelectPath: handleTreeSelection,
    onViewedChange: handleViewedFileChange,
    refreshing,
    repoRoot: session.repoRoot,
    selectedPath,
    staleNotesCount: commentExports.filter((comment) => comment.status === "stale").length,
    totalFileCount: orderedFiles.length,
    totals: diffTotals,
    viewedCount,
    viewedPaths: viewedFilePaths,
  } satisfies Omit<SidebarProps, "footer" | "headerActions" | "notesPanel">;

  const workspaceProps = {
    annotationsByFile: reviewSession.state.annotationsByFile,
    collapsedFilePaths,
    commentExports: orderedCommentExports,
    capabilities: session.capabilities,
    diffStyle: effectiveDiffStyle,
    disableBackground,
    expandUnchanged,
    fileCommentDrafts: reviewSession.state.fileCommentDrafts,
    fileDiffs,
    fileDiffErrors,
    files: workspaceFiles,
    hunkSeparators,
    onAnnotationsChange: reviewSession.updateAnnotations,
    onCollapsedFileChange: handleCollapsedFileChange,
    onCommentDeleted: handleCommentDeleted,
    onCommentSaved: handleCommentSaved,
    onFileCommentDraftChange: reviewSession.setFileCommentDraft,
    onRequestFileDiff: requestSessionFileDiff,
    onRetryFileDiff: retryPath,
    onReviewSurfaceChange: reviewSession.setReviewSurface,
    onViewedFileChange: handleViewedFileChange,
    onVisiblePathChange: handleVisiblePathChange,
    onSessionReload: reload,
    overflow,
    reviewSurface: reviewSession.state.reviewSurface,
    scrollSignal,
    selectedFile,
    selectedPath,
    snapshotId: session.snapshotId,
    sessionRevision: revision,
    showLineNumbers,
    themeType,
    viewedFilePaths,
  } satisfies DiffWorkspaceProps;

  return {
    collapsedFilePaths,
    controlsProps,
    handleClearAllComments,
    handleCollapsedFileChange,
    handleHubCommentDelete,
    handleHubCommentUpdate,
    handleJumpToComment,
    handleNavigateHunk,
    handleTreeSelection,
    handleViewedFileChange,
    hunkNavigation,
    isDesktopLayout,
    orderedCommentExports,
    orderedFiles,
    resetConfirmationOpen,
    reviewNavigation,
    reviewSession,
    selectedPath,
    session,
    setResetConfirmationOpen,
    sidebarProps,
    themeType,
    viewedFilePaths,
    visibleFiles,
    workspaceProps,
  };
}

function DiffDeckSessionView({
  collapsedFilePaths,
  controlsProps,
  handleClearAllComments,
  handleCollapsedFileChange,
  handleHubCommentDelete,
  handleHubCommentUpdate,
  handleJumpToComment,
  handleNavigateHunk,
  handleTreeSelection,
  handleViewedFileChange,
  hunkNavigation,
  isDesktopLayout,
  orderedCommentExports,
  orderedFiles,
  resetConfirmationOpen,
  reviewNavigation,
  reviewSession,
  selectedPath,
  session,
  setResetConfirmationOpen,
  sidebarProps,
  themeType,
  viewedFilePaths,
  visibleFiles,
  workspaceProps,
}: ReturnType<typeof useDiffDeckSessionModel>) {
  const packetSource = {
    comments: orderedCommentExports,
    diffArgs: session.diffArgs,
    repoRoot: session.repoRoot,
    snapshotId: session.snapshotId,
    totalFiles: orderedFiles.length,
    viewedFiles: viewedFilePaths.size,
  };
  const accessible = reviewSession.state.reviewSurface === "accessible";
  const sidebar = {
    ...sidebarProps,
    footer: (
      <>
        <ReviewNavigator
          hunkNavigation={hunkNavigation}
          navigation={reviewNavigation}
          onNavigateHunk={handleNavigateHunk}
          onReviewModeChange={reviewSession.setReviewMode}
          onSelectPath={handleTreeSelection}
          reviewMode={reviewSession.state.reviewMode}
        />
        <HandoffBar {...packetSource} />
      </>
    ),
    headerActions: (
      <>
        <button
          type="button"
          aria-label={accessible ? "Return to rich diff view" : "Open accessible linear patch view"}
          aria-pressed={accessible}
          onClick={() => reviewSession.setReviewSurface(accessible ? "rich" : "accessible")}
          title="Toggle accessible patch view (A)"
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            accessible && "bg-accent text-foreground",
          )}
        >
          <Accessibility aria-hidden="true" className="size-3.5" />
        </button>
        <DiffControls {...controlsProps} onResetReview={() => setResetConfirmationOpen(true)} />
      </>
    ),
    notesPanel: (
      <ReviewNotesHub
        comments={orderedCommentExports}
        footer={<PacketPreview {...packetSource} onClearAll={handleClearAllComments} />}
        header={
          <ReReviewSummary
            comments={orderedCommentExports}
            onRemoveStatus={reviewSession.removeCommentsByStatus}
          />
        }
        onDelete={handleHubCommentDelete}
        onJump={handleJumpToComment}
        onUpdate={handleHubCommentUpdate}
      />
    ),
  } satisfies SidebarProps;

  return (
    <>
      <Toaster position="bottom-right" theme={themeType} />
      <CommandMenu
        collapsedPaths={collapsedFilePaths}
        editorEnabled={session.capabilities?.editor === true}
        files={visibleFiles}
        hunkNavigation={hunkNavigation}
        navigation={reviewNavigation}
        onCollapsedChange={handleCollapsedFileChange}
        onNavigateHunk={handleNavigateHunk}
        onReviewModeChange={reviewSession.setReviewMode}
        onReviewSurfaceChange={reviewSession.setReviewSurface}
        onSelectPath={handleTreeSelection}
        onViewedChange={handleViewedFileChange}
        selectedPath={selectedPath}
        reviewMode={reviewSession.state.reviewMode}
        reviewSurface={reviewSession.state.reviewSurface}
        viewedPaths={viewedFilePaths}
      />
      <ConfirmationDialog
        confirmLabel="Reset review"
        description="This clears viewed files, filters, drafts, notes, and review preferences for this diff. Git changes are not affected."
        onConfirm={() => {
          reviewSession.resetReview();
          setResetConfirmationOpen(false);
        }}
        onOpenChange={setResetConfirmationOpen}
        open={resetConfirmationOpen}
        title="Reset all review progress?"
      />
      <DiffDeckLayout
        isDesktopLayout={isDesktopLayout}
        sidebarProps={sidebar}
        workspaceProps={workspaceProps}
      />
    </>
  );
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
  sidebarProps,
  workspaceProps,
}: {
  isDesktopLayout: boolean;
  sidebarProps: SidebarProps;
  workspaceProps: DiffWorkspaceProps;
}) {
  const [desktopLayout, setDesktopLayout] = useLocalStorage<Record<string, number>>(
    "diffdeck.layout.desktop",
    { diff: 80, files: 20 },
  );
  const [narrowNavigationOpen, setNarrowNavigationOpen] = useState(false);
  const [narrowSearchRequested, setNarrowSearchRequested] = useState(false);

  // On narrow screens Files and Review are separate places: jumping to a note
  // returns to the patch, and `/` opens Files with the search focused.
  useEffect(() => {
    if (isDesktopLayout) return;
    const showReview = () => setNarrowNavigationOpen(false);
    const showFileSearch = () => {
      setNarrowSearchRequested(true);
      setNarrowNavigationOpen(true);
    };
    window.addEventListener("diffdeck:focus-note", showReview);
    window.addEventListener(FOCUS_FILE_SEARCH_EVENT, showFileSearch);
    return () => {
      window.removeEventListener("diffdeck:focus-note", showReview);
      window.removeEventListener(FOCUS_FILE_SEARCH_EVENT, showFileSearch);
    };
  }, [isDesktopLayout]);

  const handleNarrowSelectPath = useCallback(
    (path: string) => {
      sidebarProps.onSelectPath(path);
      setNarrowNavigationOpen(false);
    },
    [sidebarProps],
  );

  const selectedLabel = sidebarProps.selectedPath?.split("/").at(-1) ?? "No file selected";

  return (
    <div className="h-dvh w-screen overflow-hidden bg-background text-foreground">
      {isDesktopLayout ? (
        <PanelGroup
          id="diffdeck-layout"
          orientation="horizontal"
          className="flex h-full w-full"
          defaultLayout={desktopLayout}
          onLayoutChanged={setDesktopLayout}
        >
          <Panel id="files" minSize="12%" maxSize="45%" className="min-h-0">
            <Sidebar {...sidebarProps} />
          </Panel>
          <PanelResizeHandle
            aria-label="Resize file tree and diff panels"
            className="app-resize-handle group relative w-px"
          >
            <span className="absolute inset-y-0 -left-1 -right-1" />
          </PanelResizeHandle>
          <Panel id="diff" minSize="30%" className="min-h-0">
            <DiffWorkspace {...workspaceProps} />
          </Panel>
        </PanelGroup>
      ) : (
        <div className="grid h-full w-full grid-rows-[2.75rem_minmax(0,1fr)] overflow-hidden">
          <nav
            aria-label="Narrow layout navigation"
            className="flex min-w-0 items-center gap-2 border-b border-border bg-background px-2"
          >
            <button
              type="button"
              aria-expanded={narrowNavigationOpen}
              onClick={() => {
                setNarrowSearchRequested(false);
                setNarrowNavigationOpen((current) => !current);
              }}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {narrowNavigationOpen ? (
                <ArrowLeft aria-hidden="true" className="size-4" />
              ) : (
                <Files aria-hidden="true" className="size-4" />
              )}
              {narrowNavigationOpen ? "Review" : "Files"}
            </button>
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
              {narrowNavigationOpen ? "Choose a changed file" : selectedLabel}
            </span>
          </nav>
          <div className="min-h-0 overflow-hidden">
            {narrowNavigationOpen ? (
              <Sidebar
                {...sidebarProps}
                focusSearchOnMount={narrowSearchRequested}
                onSelectPath={handleNarrowSelectPath}
              />
            ) : (
              <DiffWorkspace {...workspaceProps} />
            )}
          </div>
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
