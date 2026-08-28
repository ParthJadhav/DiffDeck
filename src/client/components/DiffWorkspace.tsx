import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  FileDiff,
  UnresolvedFile,
  type FileContents,
  type FileDiffMetadata,
} from "@pierre/diffs/react";
import type { AnnotationSide, SelectedLineRange } from "@pierre/diffs";
import { AlertCircle, FileWarning, ImageOff, LoaderCircle } from "lucide-react";
import { customHunkSeparatorCSS, stickyFileHeaderCSS } from "../lib/constants.js";
import { fetchJson } from "../lib/api.js";
import {
  focusRenderedReviewNote,
  scrollToRenderedDiffLine,
  type NavigateLineDetail,
} from "../lib/diffDom.js";
import { readDiffLocation } from "../lib/deepLink.js";
import { getHunkTargets } from "../lib/hunkNavigation.js";
import { buildCommentContext, type CommentExportRecord } from "../lib/commentExport.js";
import type { DiffLayout, HunkSeparatorMode, OverflowMode, ThemeChoice } from "../lib/uiTypes.js";
import type { DiffFileSummary, SessionPayload } from "../types.js";
import { isDependencyPath } from "../lib/fileFilters.js";
import { Card, CardContent, CardDescription, CardHeader } from "./ui/card.js";
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
import { FileActions } from "./diff/FileActions.js";
import { installHunkExpansionFallback } from "./diff/hunkExpansionFallback.js";
import { MultiFileScroller } from "./diff/MultiFileScroller.js";
import type { ReviewSurface } from "../lib/reviewSession.js";

const AccessiblePatchView = lazy(async () => {
  const module = await import("./AccessiblePatchView.js");
  return { default: module.AccessiblePatchView };
});

const EMPTY_ANNOTATIONS: CommentAnnotation[] = [];
const LINE_NAVIGATION_RETRY_ATTEMPTS = 160;
const LINE_NAVIGATION_RETRY_MS = 50;

export interface DiffWorkspaceProps {
  annotationsByFile: Readonly<Record<string, CommentAnnotation[]>>;
  capabilities?: SessionPayload["capabilities"];
  collapsedFilePaths: ReadonlySet<string>;
  commentExports: readonly CommentExportRecord[];
  diffStyle: DiffLayout;
  disableBackground: boolean;
  expandUnchanged: boolean;
  fileCommentDrafts: Readonly<Record<string, string>>;
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
  onFileCommentDraftChange: (path: string, body: string) => void;
  onRequestFileDiff: (path: string) => void;
  onRetryFileDiff: (path: string) => void;
  onReviewSurfaceChange: (surface: ReviewSurface) => void;
  onSessionReload: () => void;
  onViewedFileChange: (path: string, value: boolean) => void;
  onVisiblePathChange: (path: string) => void;
  overflow: OverflowMode;
  reviewSurface: ReviewSurface;
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
    commentExports,
    diffStyle,
    disableBackground,
    expandUnchanged,
    fileCommentDrafts,
    files,
    fileDiffs,
    fileDiffErrors,
    hunkSeparators,
    onAnnotationsChange,
    onCollapsedFileChange,
    onCommentDeleted,
    onCommentSaved,
    onFileCommentDraftChange,
    onRequestFileDiff,
    onRetryFileDiff,
    onReviewSurfaceChange,
    onSessionReload,
    onViewedFileChange,
    onVisiblePathChange,
    overflow,
    reviewSurface,
    scrollSignal,
    selectedFile,
    selectedPath,
    snapshotId,
    sessionRevision,
    showLineNumbers,
    themeType,
    viewedFilePaths,
  } = props;

  useEffect(() => {
    let navigationGeneration = 0;
    let timer = 0;
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<NavigateLineDetail>).detail;
      const generation = ++navigationGeneration;
      let attempts = 0;
      const tryScroll = () => {
        if (generation !== navigationGeneration) return;
        if (scrollToRenderedDiffLine(detail)) return;
        attempts += 1;
        if (attempts < LINE_NAVIGATION_RETRY_ATTEMPTS) {
          timer = window.setTimeout(tryScroll, LINE_NAVIGATION_RETRY_MS);
        }
      };
      window.requestAnimationFrame(tryScroll);
    };
    window.addEventListener("diffdeck:navigate-line", navigate);
    return () => {
      navigationGeneration += 1;
      window.clearTimeout(timer);
      window.removeEventListener("diffdeck:navigate-line", navigate);
    };
  }, []);

  useEffect(() => {
    let generation = 0;
    let timer = 0;
    const focusNote = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; path: string; scope: "file" | "line" }>)
        .detail;
      const requestGeneration = ++generation;
      let attempts = 0;
      const tryFocus = () => {
        if (requestGeneration !== generation) return;
        if (focusRenderedReviewNote(detail)) return;
        attempts += 1;
        if (attempts < LINE_NAVIGATION_RETRY_ATTEMPTS) {
          timer = window.setTimeout(tryFocus, LINE_NAVIGATION_RETRY_MS);
        }
      };
      window.requestAnimationFrame(tryFocus);
    };
    window.addEventListener("diffdeck:focus-note", focusNote);
    return () => {
      generation += 1;
      window.clearTimeout(timer);
      window.removeEventListener("diffdeck:focus-note", focusNote);
    };
  }, []);

  const handleShortcutComment = useEffectEvent((event: Event) => {
    const path = (event as CustomEvent<string>).detail;
    const fileDiff = fileDiffs[path];
    if (fileDiff == null) return;
    const target = getHunkTargets(fileDiff)[0];
    if (target == null) return;
    onAnnotationsChange(path, (current) => {
      if (
        current.some(
          (annotation) =>
            annotation.side === target.side &&
            annotation.lineNumber === target.line &&
            annotation.metadata.kind === "comment-form",
        )
      ) {
        return current;
      }
      return [...current, createCommentAnnotation(target.side, target.line)];
    });
  });

  useEffect(() => {
    window.addEventListener("diffdeck:add-comment", handleShortcutComment);
    return () => window.removeEventListener("diffdeck:add-comment", handleShortcutComment);
  }, []);

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
      overflow,
      onPostRender: patchRenderedDiffAccessibility,
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
              <h1 className="text-xl font-semibold leading-none tracking-normal">
                No diff to render
              </h1>
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

  if (reviewSurface === "accessible") {
    return (
      <Suspense
        fallback={
          <main
            id="main"
            aria-label={`Accessible patch for ${selectedFile.path}`}
            className="grid h-full min-h-0 min-w-0 place-items-center bg-background text-xs text-muted-foreground"
          >
            Loading linear patch…
          </main>
        }
      >
        <AccessiblePatchView
          comments={commentExports.filter((comment) => comment.filePath === selectedFile.path)}
          error={fileDiffErrors[selectedFile.path]}
          file={selectedFile}
          fileDiff={fileDiffs[selectedFile.path]}
          onAnnotationsChange={onAnnotationsChange}
          onCommentSaved={onCommentSaved}
          onRetry={onRetryFileDiff}
          onReturnToRich={() => onReviewSurfaceChange("rich")}
        />
      </Suspense>
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
          collapsedFilePaths={collapsedFilePaths}
          files={files}
          onRequestFileDiff={onRequestFileDiff}
          onVisiblePathChange={onVisiblePathChange}
          renderFile={(file, selectedLines, onSelectedLinesChange) => (
            <FileDiffSection
              collapsed={collapsedFilePaths.has(file.path)}
              capabilities={capabilities}
              commentAnnotations={annotationsByFile[file.path] ?? EMPTY_ANNOTATIONS}
              diffOptions={diffOptions}
              file={file}
              fileDiff={fileDiffs[file.path] ?? null}
              fileDiffError={fileDiffErrors[file.path] ?? null}
              fileCommentDraft={fileCommentDrafts[file.path] ?? ""}
              onAnnotationsChange={onAnnotationsChange}
              onCollapsedChange={onCollapsedFileChange}
              onCommentDeleted={onCommentDeleted}
              onCommentSaved={onCommentSaved}
              onFileCommentDraftChange={onFileCommentDraftChange}
              onRetryFileDiff={onRetryFileDiff}
              onSessionReload={onSessionReload}
              onSelectedLinesChange={onSelectedLinesChange}
              onViewedChange={onViewedFileChange}
              selectedLines={selectedLines}
              sessionRevision={sessionRevision}
              snapshotId={snapshotId}
              viewed={viewedFilePaths.has(file.path)}
            />
          )}
          scrollSignal={scrollSignal}
          selectedPath={selectedPath}
        />
      </section>
    </main>
  );
}

function patchRenderedDiffAccessibility(node: HTMLElement) {
  queueMicrotask(() => {
    const tree = node.getRootNode();
    const scope = tree instanceof ShadowRoot ? tree : (node.shadowRoot ?? node);
    patchScrollableCodeAccessibility(scope);
  });
}

function patchScrollableCodeAccessibility(scope: ParentNode) {
  for (const code of scope.querySelectorAll<HTMLElement>("code[data-code]")) {
    code.tabIndex = 0;
    const side = code.hasAttribute("data-additions") ? "new" : "old";
    code.setAttribute("aria-label", `Scrollable ${side}-side code`);
  }
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

type FileDiffSectionProps = {
  collapsed: boolean;
  capabilities?: SessionPayload["capabilities"];
  commentAnnotations: CommentAnnotation[];
  diffOptions: Parameters<typeof FileDiff>[0]["options"];
  file: DiffFileSummary;
  fileCommentDraft: string;
  fileDiff: FileDiffMetadata | null;
  fileDiffError: string | null;
  onAnnotationsChange: (
    path: string,
    updater: (current: CommentAnnotation[]) => CommentAnnotation[],
  ) => void;
  onCollapsedChange: (path: string, value: boolean) => void;
  onCommentDeleted: (id: string) => void;
  onCommentSaved: (comment: CommentExportRecord) => void;
  onFileCommentDraftChange: (path: string, body: string) => void;
  onRetryFileDiff: (path: string) => void;
  onSessionReload: () => void;
  onSelectedLinesChange: (path: string, range: SelectedLineRange | null) => void;
  onViewedChange: (path: string, value: boolean) => void;
  selectedLines: SelectedLineRange | null;
  sessionRevision: number;
  snapshotId: string;
  viewed: boolean;
};

const FileDiffSection = memo(function FileDiffSection(props: FileDiffSectionProps) {
  return <FileDiffSectionContent key={`${props.file.path}:${props.sessionRevision}`} {...props} />;
});

function FileDiffSectionContent(props: FileDiffSectionProps) {
  return <FileDiffSectionView {...useFileDiffSectionModel(props)} />;
}

function useFileDiffSectionModel({
  collapsed,
  capabilities,
  commentAnnotations,
  diffOptions,
  file,
  fileCommentDraft,
  fileDiff,
  fileDiffError,
  onAnnotationsChange,
  onCollapsedChange,
  onCommentDeleted,
  onCommentSaved,
  onFileCommentDraftChange,
  onRetryFileDiff,
  onSessionReload,
  onSelectedLinesChange,
  onViewedChange,
  selectedLines,
  sessionRevision,
  snapshotId,
  viewed,
}: FileDiffSectionProps) {
  const [unresolvedState, dispatchUnresolvedState] = useReducer(
    (_current: UnresolvedFileState, next: UnresolvedFileState) => next,
    idleUnresolvedFileState,
  );
  const [structuralOutput, setStructuralOutput] = useState<string | null>(null);

  const handleFileCommentSubmit = useCallback(
    (body: string) => {
      onCommentSaved({
        body,
        contextLines: [],
        filePath: file.path,
        id: `file-${crypto.randomUUID()}`,
        lineNumber: 0,
        scope: "file",
        side: "additions",
      });
      onFileCommentDraftChange(file.path, "");
    },
    [file.path, onCommentSaved, onFileCommentDraftChange],
  );

  const isHeavyFile = file.additions + file.deletions >= HEAVY_DIFF_LINE_THRESHOLD;

  useEffect(() => {
    if (collapsed || fileDiff == null || isHeavyFile) return;
    let attempts = 0;
    let timer = 0;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    const patch = () => {
      if (cancelled) return;
      const card = Array.from(document.querySelectorAll<HTMLElement>("[data-file-path]")).find(
        (candidate) => candidate.dataset.filePath === file.path,
      );
      const shadowRoot = card?.querySelector("diffs-container")?.shadowRoot;
      if (shadowRoot != null) {
        patchScrollableCodeAccessibility(shadowRoot);
        observer = new MutationObserver(() => patchScrollableCodeAccessibility(shadowRoot));
        observer.observe(shadowRoot, { childList: true, subtree: true });
        return;
      }
      attempts += 1;
      if (attempts < 20) timer = window.setTimeout(patch, 25);
    };
    window.requestAnimationFrame(patch);
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, [collapsed, file.path, fileDiff, isHeavyFile]);

  const headerActions = useMemo(
    () => (
      <FileActions
        capabilities={capabilities}
        fileCommentDraft={fileCommentDraft}
        hunkCount={fileDiff?.hunks.length ?? 0}
        onFileCommentDraftChange={(body) => onFileCommentDraftChange(file.path, body)}
        onFileCommentSubmit={handleFileCommentSubmit}
        onReload={onSessionReload}
        onStructuralChange={setStructuralOutput}
        path={file.path}
        snapshotId={snapshotId}
        structuralActive={structuralOutput != null}
      />
    ),
    [
      capabilities,
      fileCommentDraft,
      file.path,
      handleFileCommentSubmit,
      fileDiff?.hunks.length,
      onSessionReload,
      onFileCommentDraftChange,
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

  const handlePostRender = useCallback(
    (...args: Parameters<typeof installHunkExpansionFallback>) => {
      installHunkExpansionFallback(...args);
      const location = readDiffLocation(window.location.href);
      if (location.file !== filePath || location.line == null || location.side == null) {
        return;
      }
      const detail = {
        line: location.line,
        path: filePath,
        side: location.side,
      } satisfies NavigateLineDetail;
      window.requestAnimationFrame(() => {
        scrollToRenderedDiffLine(detail, { source: "render" });
      });
    },
    [filePath],
  );

  const commentAnnotationsRef = useRef(commentAnnotations);

  useEffect(() => {
    commentAnnotationsRef.current = commentAnnotations;
  }, [commentAnnotations]);

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
      window.dispatchEvent(
        new CustomEvent("diffdeck:line-selected", {
          detail: { line: Math.max(range.start, range.end), path: filePath, side },
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
      // Discarding a new composer unmounts the focused textarea; keep focus in
      // the workspace instead of dropping it on <body>.
      window.requestAnimationFrame(() => {
        if (document.activeElement === document.body) {
          document.getElementById("main")?.focus({ preventScroll: true });
        }
      });
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
        scope: "line",
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
      // Pierre 1.2 routes gutter-button pointer events through this callback.
      // The selection-end handler below owns opening the composer so gutter and
      // dragged line selections continue to share one comment path.
      onGutterUtilityClick: () => {},
      onLineSelectionEnd: handleLineSelectionEnd,
      onPostRender: handlePostRender,
    }),
    [collapsed, diffOptions, handleLineSelectionEnd, handlePostRender, hasOpenCommentForm],
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

  return {
    collapsed,
    commentAnnotations,
    file,
    fileDiff,
    fileDiffError,
    fileDiffOptions,
    handleHeaderCollapsedChange,
    handleHeaderViewedChange,
    headerActions,
    isHeavyFile,
    onRetryFileDiff,
    renderCommentAnnotation,
    renderHeader,
    selectedLines,
    structuralOutput,
    unresolvedState,
    viewed,
  };
}

function FileDiffSectionView({
  collapsed,
  commentAnnotations,
  file,
  fileDiff,
  fileDiffError,
  fileDiffOptions,
  handleHeaderCollapsedChange,
  handleHeaderViewedChange,
  headerActions,
  isHeavyFile,
  onRetryFileDiff,
  renderCommentAnnotation,
  renderHeader,
  selectedLines,
  structuralOutput,
  unresolvedState,
  viewed,
}: ReturnType<typeof useFileDiffSectionModel>) {
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
          actions={headerActions}
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
}

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
