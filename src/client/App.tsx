import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
import { prepareFileTreeInput } from "@pierre/trees";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Sidebar, type SidebarProps } from "./components/Sidebar.js";
import { DiffWorkspace, type DiffWorkspaceProps } from "./components/DiffWorkspace.js";
import { DiffControls, type DiffControlsProps } from "./components/DiffControls.js";
import { CopyCommentsButton } from "./components/CopyCommentsButton.js";
import { ShellState } from "./components/ShellState.js";
import { useSession } from "./hooks/useSession.js";
import { useFileDiff } from "./hooks/useFileDiff.js";
import { useDiffTree } from "./hooks/useDiffTree.js";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { fileTreeShapeOptions, highlighterLangs, themeOptions } from "./lib/constants.js";
import type { CommentExportRecord } from "./lib/commentExport.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "./lib/uiTypes.js";
import type { SessionPayload } from "./types.js";
import { workerFactory } from "./workerFactory.js";

const lineDiffType = "word-alt" as const;
const hunkSeparators: HunkSeparatorMode = "custom";
const LARGE_DIFF_LINE_THRESHOLD = 800;

export function App() {
  const { session, loading, refreshing, error, revision, refresh, setError } = useSession();

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
        key={revision}
        refresh={refresh}
        refreshing={refreshing}
        revision={revision}
        session={session}
        setError={setError}
      />
    </WorkerPoolContextProvider>
  );
}

function DiffDeckSession({
  refresh,
  refreshing,
  revision,
  session,
  setError,
}: {
  refresh: () => void;
  refreshing: boolean;
  revision: number;
  session: SessionPayload;
  setError: (message: string | null) => void;
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
  const sessionFilesByPath = useMemo(
    () => new Map(session.files.map((file) => [file.path, file])),
    [session],
  );
  const orderedFiles = useMemo(
    () => orderSessionFiles(session, sessionFilesByPath),
    [session, sessionFilesByPath],
  );
  const [selectionState, setSelectionState] = useState<{
    scrollSignal: number;
    selectedPath: string | null;
  }>(() => ({
    scrollSignal: 0,
    selectedPath: orderedFiles[0]?.path ?? null,
  }));
  const [collapsedFilePaths, setCollapsedFilePaths] = useState<Set<string>>(
    () => new Set(getAutoCollapsedPaths(orderedFiles)),
  );
  const [viewedFilePaths, setViewedFilePaths] = useState<Set<string>>(() => new Set());
  const [commentsState, setCommentsState] = useState<{
    clearSignal: number;
    exports: CommentExportRecord[];
  }>(() => ({ clearSignal: 0, exports: [] }));
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)");
  const supportsSplitDiff = useMediaQuery("(min-width: 640px)");
  const effectiveDiffStyle = supportsSplitDiff ? diffStyle : "unified";
  const { scrollSignal, selectedPath } = selectionState;
  const { clearSignal: clearCommentsSignal, exports: commentExports } = commentsState;

  const reportError = useCallback((message: string) => setError(message), [setError]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", themeType === "light");
    root.classList.toggle("dark", themeType === "dark");
  }, [themeType]);

  const { fileDiffs, requestPath } = useFileDiff(reportError);

  const handleTreeSelection = useCallback(
    (path: string | null) => {
      setSelectionState((current) => ({
        scrollSignal: path == null ? current.scrollSignal : current.scrollSignal + 1,
        selectedPath: path,
      }));
      const selectedFile = path == null ? null : sessionFilesByPath.get(path);
      if (selectedFile?.hasMergeConflicts !== true && selectedFile?.isBinary !== true) {
        if (path != null) requestPath(path);
      }
    },
    [requestPath, sessionFilesByPath],
  );

  const handleVisiblePathChange = useCallback((path: string) => {
    setSelectionState((current) =>
      current.selectedPath === path ? current : { ...current, selectedPath: path },
    );
  }, []);

  const handleCollapsedFileChange = useCallback((path: string, value: boolean) => {
    setCollapsedFilePaths((current) => {
      const next = new Set(current);
      if (value) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }, []);

  const handleViewedFileChange = useCallback((path: string, value: boolean) => {
    setViewedFilePaths((current) => {
      const next = new Set(current);
      if (value) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }, []);

  const handleCommentSaved = useCallback((comment: CommentExportRecord) => {
    setCommentsState((current) => {
      const existingIndex = current.exports.findIndex((item) => item.id === comment.id);
      if (existingIndex === -1) {
        return { ...current, exports: [...current.exports, comment] };
      }

      const next = [...current.exports];
      next[existingIndex] = comment;
      return { ...current, exports: next };
    });
  }, []);

  const handleCommentDeleted = useCallback((id: string) => {
    setCommentsState((current) => ({
      ...current,
      exports: current.exports.filter((comment) => comment.id !== id),
    }));
  }, []);

  const handleClearAllComments = useCallback(() => {
    setCommentsState((current) => ({
      clearSignal: current.clearSignal + 1,
      exports: [],
    }));
  }, []);

  const treeModel = useDiffTree({
    session,
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
    diffStyle: effectiveDiffStyle,
    disableBackground,
    expandUnchanged,
    onDiffStyleChange: (next) => {
      if (supportsSplitDiff || next === "unified") {
        setDiffStyle(next);
      }
    },
    onDisableBackgroundChange: setDisableBackground,
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
    for (const file of orderedFiles) {
      additions += file.additions;
      deletions += file.deletions;
    }
    return { additions, deletions };
  }, [orderedFiles]);

  const sidebarProps = {
    diffArgs: session.diffArgs,
    fileCount: session.files.length,
    onRefresh: refresh,
    refreshing,
    totals: diffTotals,
    treeModel,
  } satisfies Omit<SidebarProps, "footer">;

  const workspaceProps = {
    clearCommentsSignal,
    collapsedFilePaths,
    diffStyle: effectiveDiffStyle,
    disableBackground,
    expandUnchanged,
    fileDiffs,
    files: orderedFiles,
    hunkSeparators,
    onCollapsedFileChange: handleCollapsedFileChange,
    onCommentDeleted: handleCommentDeleted,
    onCommentSaved: handleCommentSaved,
    onRequestFileDiff: requestPath,
    onViewedFileChange: handleViewedFileChange,
    onVisiblePathChange: handleVisiblePathChange,
    overflow,
    scrollSignal,
    selectedFile,
    selectedPath,
    sessionRevision: revision,
    showLineNumbers,
    themeType,
    viewedFilePaths,
  } satisfies DiffWorkspaceProps;

  const sidebarFooter = (
    <div className="flex flex-col gap-2">
      <CopyCommentsButton comments={orderedCommentExports} onClearAll={handleClearAllComments} />
      <DiffControls {...controlsProps} />
    </div>
  );

  return (
    <DiffDeckLayout
      isDesktopLayout={isDesktopLayout}
      sidebarFooter={sidebarFooter}
      sidebarProps={sidebarProps}
      workspaceProps={workspaceProps}
    />
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
          <PanelResizeHandle className="app-resize-handle group relative w-px">
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
