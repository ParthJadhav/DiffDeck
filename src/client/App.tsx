import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { highlighterLangs, themeOptions } from "./lib/constants.js";
import type { CommentExportRecord } from "./lib/commentExport.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "./lib/uiTypes.js";
import { workerFactory } from "./workerFactory.js";

const lineDiffType = "word-alt" as const;

export function App() {
  const { session, loading, error, setError } = useSession();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [themeType, setThemeType] = useState<ThemeChoice>("system");
  const [diffStyle, setDiffStyle] = useState<DiffLayout>("split");
  const hunkSeparators: HunkSeparatorMode = "custom";
  const [overflow, setOverflow] = useState<OverflowMode>("scroll");
  const [disableBackground, setDisableBackground] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [expandUnchanged, setExpandUnchanged] = useState(false);
  const [collapsedFilePaths, setCollapsedFilePaths] = useState<Set<string>>(() => new Set());
  const [viewedFilePaths, setViewedFilePaths] = useState<Set<string>>(() => new Set());
  const [commentExports, setCommentExports] = useState<CommentExportRecord[]>([]);
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)");

  const reportError = useCallback((message: string) => setError(message), [setError]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", themeType === "light");
    root.classList.toggle("dark", themeType === "dark");
  }, [themeType]);

  const sessionFilesByPath = useMemo(() => {
    if (session == null) return null;
    return new Map(session.files.map((file) => [file.path, file]));
  }, [session]);

  const orderedFiles = useMemo(() => {
    if (session == null) return [];
    const filesByPath = sessionFilesByPath ?? new Map();
    const prepared = prepareFileTreeInput(session.files.map((f) => f.path));
    const ordered: typeof session.files = [];
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
  }, [session, sessionFilesByPath]);

  useEffect(() => {
    if (session != null && selectedPath == null) {
      setSelectedPath(orderedFiles[0]?.path ?? null);
    }
  }, [session, selectedPath, orderedFiles]);

  const { fileDiffs, requestPath } = useFileDiff(reportError);
  const [scrollSignal, setScrollSignal] = useState(0);

  useEffect(() => {
    if (selectedPath == null) return;
    const selectedFile = sessionFilesByPath?.get(selectedPath);
    if (selectedFile?.hasMergeConflicts === true) return;
    requestPath(selectedPath);
  }, [requestPath, selectedPath, sessionFilesByPath]);

  const handleTreeSelection = useCallback((path: string | null) => {
    setSelectedPath(path);
    if (path != null) setScrollSignal((n) => n + 1);
  }, []);

  const handleVisiblePathChange = useCallback((path: string) => {
    setSelectedPath((current) => (current === path ? current : path));
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
    setCommentExports((current) => {
      const existingIndex = current.findIndex((item) => item.id === comment.id);
      if (existingIndex === -1) return [...current, comment];

      const next = [...current];
      next[existingIndex] = comment;
      return next;
    });
  }, []);

  const treeModel = useDiffTree({
    session,
    selectedPath,
    viewedPaths: viewedFilePaths,
    onSelectionChange: handleTreeSelection,
  });

  const selectedFile =
    selectedPath == null ? null : (sessionFilesByPath?.get(selectedPath) ?? null);

  const orderedCommentExports = useMemo(() => {
    const fileOrder = new Map(orderedFiles.map((file, index) => [file.path, index]));
    const commentOrder = new Map(commentExports.map((comment, index) => [comment.id, index]));
    let ordered: CommentExportRecord[] = [];

    for (const comment of commentExports) {
      const insertIndex = ordered.findIndex(
        (current) => compareCommentExports(comment, current, fileOrder, commentOrder) < 0,
      );
      ordered =
        insertIndex === -1
          ? [...ordered, comment]
          : [...ordered.slice(0, insertIndex), comment, ...ordered.slice(insertIndex)];
    }

    return ordered;
  }, [commentExports, orderedFiles]);

  const controlsProps = {
    diffStyle,
    disableBackground,
    expandUnchanged,
    onDiffStyleChange: setDiffStyle,
    onDisableBackgroundChange: setDisableBackground,
    onExpandUnchangedChange: setExpandUnchanged,
    onOverflowChange: setOverflow,
    onShowLineNumbersChange: setShowLineNumbers,
    onThemeTypeChange: setThemeType,
    overflow,
    showLineNumbers,
    themeType,
  } satisfies DiffControlsProps;

  const sidebarProps = {
    diffArgs: session?.diffArgs ?? [],
    fileCount: session?.files.length ?? 0,
    treeModel,
  } satisfies Omit<SidebarProps, "footer">;

  const workspaceProps = {
    collapsedFilePaths,
    diffStyle,
    disableBackground,
    expandUnchanged,
    fileDiffs,
    files: orderedFiles,
    hunkSeparators,
    onCollapsedFileChange: handleCollapsedFileChange,
    onCommentSaved: handleCommentSaved,
    onRequestFileDiff: requestPath,
    onViewedFileChange: handleViewedFileChange,
    onVisiblePathChange: handleVisiblePathChange,
    overflow,
    scrollSignal,
    selectedFile,
    selectedPath,
    showLineNumbers,
    themeType,
    viewedFilePaths,
  } satisfies DiffWorkspaceProps;

  if (loading) {
    return <ShellState>Loading diff session…</ShellState>;
  }

  if (error != null) {
    return <ShellState variant="error">{error}</ShellState>;
  }

  if (session == null) {
    return <ShellState>No session data available.</ShellState>;
  }

  const sidebarFooter = (
    <SidebarFooter comments={orderedCommentExports} controlsProps={controlsProps} />
  );

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
      <div className="h-dvh w-screen overflow-hidden bg-background text-foreground">
        {isDesktopLayout ? (
          <PanelGroup id="cli-diff-layout" orientation="horizontal" className="flex h-full w-full">
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
          <div className="grid h-full w-full grid-cols-1 grid-rows-[minmax(13rem,40dvh)_minmax(0,1fr)] overflow-hidden">
            <Sidebar {...sidebarProps} footer={sidebarFooter} />
            <DiffWorkspace {...workspaceProps} />
          </div>
        )}
      </div>
    </WorkerPoolContextProvider>
  );
}

function SidebarFooter({
  comments,
  controlsProps,
}: {
  comments: CommentExportRecord[];
  controlsProps: DiffControlsProps;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <DiffControls {...controlsProps} />
      <CopyCommentsButton comments={comments} />
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
