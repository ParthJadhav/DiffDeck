import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAgentQueue } from "./hooks/useAgentQueue.js";
import { fileTreeShapeOptions, highlighterLangs, themeOptions } from "./lib/constants.js";
import type { CommentExportRecord } from "./lib/commentExport.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "./lib/uiTypes.js";
import { workerFactory } from "./workerFactory.js";

const lineDiffType = "word-alt" as const;

export function App() {
  const { session, loading, error, refreshSession, setError } = useSession();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [themeType, setThemeType] = useLocalStorage<ThemeChoice>(
    "diffdeck.settings.themeType",
    "system",
  );
  const [diffStyle, setDiffStyle] = useLocalStorage<DiffLayout>(
    "diffdeck.settings.diffStyle",
    "split",
  );
  const hunkSeparators: HunkSeparatorMode = "custom";
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
  const [collapsedFilePaths, setCollapsedFilePaths] = useState<Set<string>>(() => new Set());
  const autoCollapsedRef = useRef(false);
  const [viewedFilePaths, setViewedFilePaths] = useState<Set<string>>(() => new Set());
  const [commentExports, setCommentExports] = useState<CommentExportRecord[]>([]);
  const [clearCommentsSignal, setClearCommentsSignal] = useState(0);
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)");
  const {
    snapshot: agentQueue,
    cancelComment,
    clearQueue,
    deleteComment,
    enqueueComment,
    setAgentType,
    setExecutionMode,
    setPaused,
  } = useAgentQueue();
  const [optimisticQueueingIds, setOptimisticQueueingIds] = useState<Set<string>>(() => new Set());

  const reportError = useCallback((message: string) => setError(message), [setError]);

  useEffect(() => {
    if (agentQueue == null) return;
    setCommentExports((current) => {
      const nextById = new Map<string, CommentExportRecord>();
      for (const item of agentQueue.items) {
        nextById.set(item.id, item.comment);
      }
      for (const comment of current) {
        if (optimisticQueueingIds.has(comment.id) && !nextById.has(comment.id)) {
          nextById.set(comment.id, comment);
        }
      }
      let changed = false;

      if (current.length !== nextById.size) {
        changed = true;
      }
      if (!changed) {
        for (const currentComment of current) {
          const next = nextById.get(currentComment.id);
          if (next == null || !isSameCommentExport(currentComment, next)) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) return current;

      return [...nextById.values()];
    });
  }, [agentQueue, optimisticQueueingIds]);

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
    const prepared = prepareFileTreeInput(
      session.files.map((f) => f.path),
      fileTreeShapeOptions,
    );
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

  useEffect(() => {
    if (session == null || autoCollapsedRef.current) return;
    autoCollapsedRef.current = true;
    const LARGE_DIFF_LINE_THRESHOLD = 800;
    const largePaths = orderedFiles
      .filter((file) => file.additions + file.deletions >= LARGE_DIFF_LINE_THRESHOLD)
      .map((file) => file.path);
    if (largePaths.length === 0) return;
    setCollapsedFilePaths((current) => {
      const next = new Set(current);
      for (const path of largePaths) next.add(path);
      return next;
    });
  }, [session, orderedFiles]);

  const { fileDiffs, requestPath, reset: resetFileDiffs } = useFileDiff(reportError);
  const [scrollSignal, setScrollSignal] = useState(0);
  const lastHandledDoneUpdateByIdRef = useRef<Map<string, number>>(new Map());
  const diffRefreshTimeoutRef = useRef<number | null>(null);
  const pendingRefreshPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (selectedPath == null) return;
    const selectedFile = sessionFilesByPath?.get(selectedPath);
    if (selectedFile?.hasMergeConflicts === true) return;
    requestPath(selectedPath);
  }, [requestPath, selectedPath, sessionFilesByPath]);

  useEffect(() => {
    if (agentQueue == null) return;
    let shouldRefreshDiff = false;
    for (const item of agentQueue.items) {
      const previousHandled = lastHandledDoneUpdateByIdRef.current.get(item.id) ?? 0;
      if ((item.status === "done" || item.status === "needs_input") && item.updatedAt > previousHandled) {
        lastHandledDoneUpdateByIdRef.current.set(item.id, item.updatedAt);
        pendingRefreshPathsRef.current.add(item.comment.filePath);
        shouldRefreshDiff = true;
      }
    }
    if (!shouldRefreshDiff) return;

    if (diffRefreshTimeoutRef.current != null) {
      window.clearTimeout(diffRefreshTimeoutRef.current);
    }
    diffRefreshTimeoutRef.current = window.setTimeout(() => {
      diffRefreshTimeoutRef.current = null;
      pendingRefreshPathsRef.current.clear();
      void fetch("/api/session/refresh", { method: "POST" })
        .then(async () => {
          await refreshSession();
          resetFileDiffs();
        })
        .catch((requestError) => {
          reportError(requestError instanceof Error ? requestError.message : String(requestError));
        });
    }, 400);
  }, [agentQueue, refreshSession, reportError, resetFileDiffs]);

  useEffect(() => {
    return () => {
      if (diffRefreshTimeoutRef.current != null) {
        window.clearTimeout(diffRefreshTimeoutRef.current);
      }
    };
  }, []);

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
    setOptimisticQueueingIds((current) => new Set(current).add(comment.id));
    void enqueueComment(comment).finally(() => {
      setOptimisticQueueingIds((current) => {
        const next = new Set(current);
        next.delete(comment.id);
        return next;
      });
    });
  }, [enqueueComment]);

  const handleCommentDeleted = useCallback((id: string) => {
    setCommentExports((current) => current.filter((comment) => comment.id !== id));
    void deleteComment(id);
  }, [deleteComment]);

  const handleCommentAgentCancel = useCallback((id: string) => {
    void cancelComment(id);
  }, [cancelComment]);

  const handleClearAllComments = useCallback(() => {
    setCommentExports([]);
    setClearCommentsSignal((n) => n + 1);
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
    agentType:
      agentQueue?.agentType === "codex" ? "codex" : "opencode",
    diffStyle,
    disableBackground,
    executionMode: agentQueue?.executionMode ?? "shared_session",
    expandUnchanged,
    onAgentTypeChange: (value: "opencode" | "codex") => {
      void setAgentType(value);
    },
    onDiffStyleChange: setDiffStyle,
    onDisableBackgroundChange: setDisableBackground,
    onExecutionModeChange: (value: "shared_session" | "isolated") => {
      void setExecutionMode(value);
    },
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
    diffArgs: session?.diffArgs ?? [],
    fileCount: session?.files.length ?? 0,
    totals: diffTotals,
    treeModel,
  } satisfies Omit<SidebarProps, "footer">;

  const workspaceProps = {
    comments: orderedCommentExports,
    clearCommentsSignal,
    collapsedFilePaths,
    diffStyle,
    disableBackground,
    expandUnchanged,
    fileDiffs,
    files: orderedFiles,
    hunkSeparators,
    onCollapsedFileChange: handleCollapsedFileChange,
    onCommentAgentCancel: handleCommentAgentCancel,
    onCommentDeleted: handleCommentDeleted,
    onCommentSaved: handleCommentSaved,
    onRequestFileDiff: requestPath,
    onViewedFileChange: handleViewedFileChange,
    onVisiblePathChange: handleVisiblePathChange,
    optimisticQueueingIds,
    queueItemsByCommentId: new Map((agentQueue?.items ?? []).map((item) => [item.id, item])),
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
    <div className="flex flex-col gap-2">
      <QueueStatusRow
        health={agentQueue?.health}
        paused={agentQueue?.paused ?? false}
        processing={agentQueue?.processing ?? false}
        items={agentQueue?.items ?? []}
        onClearQueue={() => {
          handleClearAllComments();
          void clearQueue();
        }}
        onTogglePaused={() => {
          void setPaused(!(agentQueue?.paused ?? false));
        }}
      />
      <CopyCommentsButton comments={orderedCommentExports} onClearAll={handleClearAllComments} />
      <DiffControls {...controlsProps} />
    </div>
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
          <div className="grid h-full w-full grid-cols-1 grid-rows-[minmax(13rem,40dvh)_minmax(0,1fr)] overflow-hidden">
            <Sidebar {...sidebarProps} footer={sidebarFooter} />
            <DiffWorkspace {...workspaceProps} />
          </div>
        )}
      </div>
    </WorkerPoolContextProvider>
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

function isSameCommentExport(a: CommentExportRecord, b: CommentExportRecord) {
  if (
    a.id !== b.id ||
    a.body !== b.body ||
    a.filePath !== b.filePath ||
    a.lineNumber !== b.lineNumber ||
    a.side !== b.side ||
    a.contextLines.length !== b.contextLines.length
  ) {
    return false;
  }
  for (let index = 0; index < a.contextLines.length; index += 1) {
    const left = a.contextLines[index];
    const right = b.contextLines[index];
    if (
      left.content !== right.content ||
      left.lineNumber !== right.lineNumber ||
      left.target !== right.target
    ) {
      return false;
    }
  }
  return true;
}

type QueueHealth = { message: string; status: "green" | "red" | "yellow" };

function QueueStatusRow({
  health,
  paused,
  processing,
  items,
  onClearQueue,
  onTogglePaused,
}: {
  health: QueueHealth | undefined;
  paused: boolean;
  processing: boolean;
  items: ReadonlyArray<{ status: string }>;
  onClearQueue: () => void;
  onTogglePaused: () => void;
}) {
  const dotClass =
    health?.status === "red"
      ? "h-2 w-2 rounded-full bg-destructive"
      : health?.status === "yellow"
        ? "h-2 w-2 rounded-full bg-amber-500"
        : "h-2 w-2 rounded-full bg-emerald-500";
  const stateLabel = paused ? "Paused" : processing ? "Processing" : "Idle";
  const totalCount = items.length;
  const inProgressCount = items.filter((item) => item.status === "in_progress").length;
  const doneCount = items.filter((item) => item.status === "done").length;
  const remainingCount = Math.max(totalCount - inProgressCount - doneCount, 0);

  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium text-muted-foreground">Queue</span>
        <span className={dotClass} title={`Agent health: ${health?.message ?? "unknown"}`} />
        <span className="text-[11px] text-muted-foreground">{health?.message ?? "Unknown"}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{stateLabel}</span>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => {
            if (paused) onTogglePaused();
          }}
          aria-label="Resume queue"
          title="Resume queue"
          disabled={!paused}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M5 3.5v9l7-4.5-7-4.5z" />
          </svg>
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={onTogglePaused}
          aria-label="Pause queue"
          title="Pause queue"
          disabled={paused}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M4 3h3v10H4zM9 3h3v10H9z" />
          </svg>
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-input text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          onClick={onClearQueue}
          aria-label="Clear queue"
          title="Clear queue"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M6.5 2h3l.6 1H13v1H3V3h2.9l.6-1zm-2 3h7l-.6 8.5A1.5 1.5 0 0 1 9.4 15H6.6a1.5 1.5 0 0 1-1.5-1.5L4.5 5zM6 7h1v6H6V7zm3 0h1v6H9V7z" />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
        <span>Total {totalCount}</span>
        <span>In progress {inProgressCount}</span>
        <span>Remaining {remainingCount}</span>
        <span>Done {doneCount}</span>
      </div>
    </div>
  );
}

function WorkerPoolRenderOptionsSync() {
  const pool = useWorkerPool();
  useEffect(() => {
    if (pool == null) return;
    void pool.setRenderOptions({ lineDiffType });
  }, [pool]);
  return null;
}
