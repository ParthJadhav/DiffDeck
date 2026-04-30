import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
import type { SelectedLineRange } from "@pierre/diffs";
import { prepareFileTreeInput } from "@pierre/trees";
import { Sidebar } from "./components/Sidebar.js";
import { DiffWorkspace } from "./components/DiffWorkspace.js";
import { DiffControls } from "./components/DiffControls.js";
import { ShellState } from "./components/ShellState.js";
import { useSession } from "./hooks/useSession.js";
import { useFileDiff } from "./hooks/useFileDiff.js";
import { useRawDiff } from "./hooks/useRawDiff.js";
import { useDiffTree } from "./hooks/useDiffTree.js";
import { highlighterLangs, themeOptions } from "./lib/constants.js";
import type {
  DiffIndicatorMode,
  DiffLayout,
  DiffLineMode,
  DiffView,
  HunkSeparatorMode,
  OverflowMode,
  ThemeChoice,
} from "./lib/uiTypes.js";
import { workerFactory } from "./workerFactory.js";

export function App() {
  const { session, loading, error, setError } = useSession();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [themeType, setThemeType] = useState<ThemeChoice>("system");
  const [diffView, setDiffView] = useState<DiffView>("file");
  const [diffStyle, setDiffStyle] = useState<DiffLayout>("split");
  const [diffIndicators, setDiffIndicators] =
    useState<DiffIndicatorMode>("bars");
  const [lineDiffType, setLineDiffType] = useState<DiffLineMode>("word-alt");
  const [hunkSeparators, setHunkSeparators] =
    useState<HunkSeparatorMode>("custom");
  const [overflow, setOverflow] = useState<OverflowMode>("scroll");
  const [disableBackground, setDisableBackground] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [expandUnchanged, setExpandUnchanged] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedFilePaths, setCollapsedFilePaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [viewedFilePaths, setViewedFilePaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [selection, setSelection] = useState<SelectedLineRange | null>(null);

  const reportError = useCallback(
    (message: string) => setError(message),
    [setError],
  );

  const orderedFiles = useMemo(() => {
    if (session == null) return [];
    const filesByPath = new Map(session.files.map((f) => [f.path, f]));
    const prepared = prepareFileTreeInput(session.files.map((f) => f.path));
    const ordered: typeof session.files = [];
    for (const path of prepared.paths) {
      const file = filesByPath.get(path);
      if (file != null) ordered.push(file);
    }
    // Append any paths that weren't represented in the prepared input
    // (e.g. directory-only entries) — defensive, normally empty.
    for (const file of session.files) {
      if (!prepared.paths.includes(file.path)) ordered.push(file);
    }
    return ordered;
  }, [session]);

  useEffect(() => {
    if (session != null && selectedPath == null) {
      setSelectedPath(orderedFiles[0]?.path ?? null);
    }
  }, [session, selectedPath, orderedFiles]);

  const { fileDiffs, requestPath } = useFileDiff(reportError);
  const selectedDiff =
    selectedPath == null ? null : (fileDiffs[selectedPath] ?? null);
  const [scrollSignal, setScrollSignal] = useState(0);

  const handleTreeSelection = useCallback((path: string | null) => {
    setSelectedPath(path);
    if (path != null) setScrollSignal((n) => n + 1);
  }, []);

  const handleVisiblePathChange = useCallback((path: string) => {
    setSelectedPath((current) => (current === path ? current : path));
  }, []);

  const handleReveal = useCallback((path: string) => {
    setSelectedPath(path);
    setDiffView("file");
    setScrollSignal((n) => n + 1);
  }, []);

  const handleDiffViewChange = useCallback((view: DiffView) => {
    setDiffView(view);
    if (view === "patch") {
      setSelection(null);
    }
  }, []);

  const handleCollapsedFileChange = useCallback(
    (path: string, value: boolean) => {
      setCollapsedFilePaths((current) => {
        const next = new Set(current);
        if (value) {
          next.add(path);
        } else {
          next.delete(path);
        }
        return next;
      });
    },
    [],
  );

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
  const { rawDiff, loading: rawDiffLoading } = useRawDiff(
    diffView,
    session?.rawDiffAvailable ?? false,
    reportError,
  );

  const treeModel = useDiffTree({
    session,
    selectedPath,
    viewedPaths: viewedFilePaths,
    onSelectionChange: handleTreeSelection,
  });

  useEffect(() => {
    setSelection(null);
  }, [diffView, selectedPath]);

  const selectedFile =
    session?.files.find((file) => file.path === selectedPath) ?? null;

  const copyToClipboard = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        setError(`Unable to copy "${value}" to the clipboard in this browser.`);
      }
    },
    [setError],
  );

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
      <WorkerPoolRenderOptionsSync lineDiffType={lineDiffType} />
      <div className="grid h-screen w-screen overflow-hidden grid-cols-1 lg:[grid-template-columns:17rem_minmax(0,1fr)] bg-background text-foreground">
        <Sidebar
          diffArgs={session.diffArgs}
          fileCount={session.files.length}
          footer={
            <DiffControls
              collapsed={collapsed}
              diffIndicators={diffIndicators}
              diffStyle={diffStyle}
              diffView={diffView}
              disableBackground={disableBackground}
              expandUnchanged={expandUnchanged}
              hunkSeparators={hunkSeparators}
              lineDiffType={lineDiffType}
              onCollapsedChange={setCollapsed}
              onDiffIndicatorsChange={setDiffIndicators}
              onDiffStyleChange={setDiffStyle}
              onDiffViewChange={handleDiffViewChange}
              onDisableBackgroundChange={setDisableBackground}
              onExpandUnchangedChange={setExpandUnchanged}
              onHunkSeparatorsChange={setHunkSeparators}
              onLineDiffTypeChange={setLineDiffType}
              onOverflowChange={setOverflow}
              onShowLineNumbersChange={setShowLineNumbers}
              onThemeTypeChange={setThemeType}
              overflow={overflow}
              selection={selection}
              showLineNumbers={showLineNumbers}
              themeType={themeType}
            />
          }
          onViewedPathChange={handleViewedFileChange}
          onCopyPath={(path) => void copyToClipboard(path)}
          onRevealPath={handleReveal}
          treeModel={treeModel}
          viewedPaths={viewedFilePaths}
        />
        <DiffWorkspace
          collapsed={collapsed}
          collapsedFilePaths={collapsedFilePaths}
          diffIndicators={diffIndicators}
          diffStyle={diffStyle}
          diffView={diffView}
          disableBackground={disableBackground}
          expandUnchanged={expandUnchanged}
          fileDiffs={fileDiffs}
          files={orderedFiles}
          hunkSeparators={hunkSeparators}
          lineDiffType={lineDiffType}
          onCollapsedChange={setCollapsed}
          onCollapsedFileChange={handleCollapsedFileChange}
          onDiffStyleChange={setDiffStyle}
          onDiffViewChange={handleDiffViewChange}
          onExpandUnchangedChange={setExpandUnchanged}
          onHunkSeparatorsChange={setHunkSeparators}
          onLineDiffTypeChange={setLineDiffType}
          onOverflowChange={setOverflow}
          onRequestFileDiff={requestPath}
          onSelectionChange={setSelection}
          onShowLineNumbersChange={setShowLineNumbers}
          onThemeTypeChange={setThemeType}
          onViewedFileChange={handleViewedFileChange}
          onVisiblePathChange={handleVisiblePathChange}
          overflow={overflow}
          rawDiff={rawDiff}
          rawDiffLoading={rawDiffLoading}
          scrollSignal={scrollSignal}
          selectedDiff={selectedDiff}
          selectedFile={selectedFile}
          selectedPath={selectedPath}
          selection={selection}
          showLineNumbers={showLineNumbers}
          themeType={themeType}
          viewedFilePaths={viewedFilePaths}
        />
      </div>
    </WorkerPoolContextProvider>
  );
}

// When the worker pool is active, options like `lineDiffType` passed to
// individual <FileDiff /> instances are ignored — they must be applied to the
// pool itself. This child sits inside the provider so it can call
// setRenderOptions whenever the user toggles the value.
function WorkerPoolRenderOptionsSync({
  lineDiffType,
}: {
  lineDiffType: DiffLineMode;
}) {
  const pool = useWorkerPool();
  useEffect(() => {
    if (pool == null) return;
    void pool.setRenderOptions({ lineDiffType });
  }, [pool, lineDiffType]);
  return null;
}
