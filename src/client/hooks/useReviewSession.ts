import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommentExportRecord } from "../lib/commentExport.js";
import {
  createReviewSession,
  createReviewSessionIdentity,
  parseReviewSession,
  reconcileReviewSession,
  reconcileCommentAnchors,
  reconcileAnnotationsToComments,
  serializeReviewSession,
  updateReviewAnnotations,
  updateReviewPathSet,
  type ReviewAnnotation,
  type FileOrder,
  type FileViewMode,
  type ReviewFilters,
  type ReviewMode,
  type ReviewSurface,
  type ReviewSessionSnapshot,
  type ReviewSessionState,
} from "../lib/reviewSession.js";

export interface UseReviewSessionResult {
  state: ReviewSessionState;
  collapsedPaths: ReadonlySet<string>;
  viewedPaths: ReadonlySet<string>;
  clearComments: () => void;
  deleteComment: (id: string) => void;
  setCollapsed: (path: string, value: boolean) => void;
  setFilters: (filters: ReviewFilters) => void;
  setFileCommentDraft: (path: string, body: string) => void;
  setFileOrder: (order: FileOrder) => void;
  setFileViewMode: (mode: FileViewMode) => void;
  setReviewMode: (mode: ReviewMode) => void;
  setReviewSurface: (surface: ReviewSurface) => void;
  setSelectedPath: (path: string | null) => void;
  setViewed: (path: string, value: boolean) => void;
  reconcileComments: (
    fileDiffs: Parameters<typeof reconcileCommentAnchors>[1],
    snapshotId: string,
  ) => void;
  removeCommentsByStatus: (status: "resolved" | "stale") => void;
  resetReview: () => void;
  updateAnnotations: (
    path: string,
    updater: (current: ReviewAnnotation[]) => ReviewAnnotation[],
  ) => void;
  upsertComment: (comment: CommentExportRecord) => void;
}

export function useReviewSession(
  snapshot: ReviewSessionSnapshot,
  autoCollapsedPaths: readonly string[],
  preferredSelectedPath?: string | null,
): UseReviewSessionResult {
  const identity = useMemo(() => createReviewSessionIdentity(snapshot), [snapshot]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const autoCollapsedRef = useRef(autoCollapsedPaths);
  autoCollapsedRef.current = autoCollapsedPaths;

  const [state, setState] = useState<ReviewSessionState>(() =>
    readStoredSession(identity, snapshot, autoCollapsedPaths, preferredSelectedPath),
  );

  useEffect(() => {
    setState((current) => {
      if (current.identity !== identity) {
        return readStoredSession(identity, snapshotRef.current, autoCollapsedRef.current);
      }
      return reconcileReviewSession(current, snapshotRef.current, autoCollapsedRef.current);
    });
  }, [identity, snapshot.snapshotId]);

  useEffect(() => {
    if (typeof window === "undefined" || state.identity !== identity) return;
    try {
      window.localStorage.setItem(identity, serializeReviewSession(state));
    } catch {
      // Review state remains usable in memory if storage is unavailable or full.
    }
  }, [identity, state]);

  const collapsedPaths = useMemo(() => new Set(state.collapsedPaths), [state.collapsedPaths]);
  const viewedPaths = useMemo(() => new Set(state.viewedPaths), [state.viewedPaths]);

  const setSelectedPath = useCallback((path: string | null) => {
    setState((current) =>
      current.selectedPath === path ? current : { ...current, selectedPath: path },
    );
  }, []);

  const setCollapsed = useCallback((path: string, value: boolean) => {
    setState((current) => ({
      ...current,
      collapsedPaths: updateReviewPathSet(current.collapsedPaths, path, value),
    }));
  }, []);

  const setViewed = useCallback((path: string, value: boolean) => {
    setState((current) => ({
      ...current,
      viewedPaths: updateReviewPathSet(current.viewedPaths, path, value),
    }));
  }, []);

  const updateAnnotations = useCallback(
    (path: string, updater: (current: ReviewAnnotation[]) => ReviewAnnotation[]) => {
      setState((current) => ({
        ...current,
        annotationsByFile: updateReviewAnnotations(current.annotationsByFile, path, updater),
      }));
    },
    [],
  );

  const upsertComment = useCallback((comment: CommentExportRecord) => {
    setState((current) => {
      const index = current.commentExports.findIndex((item) => item.id === comment.id);
      if (index === -1) {
        return { ...current, commentExports: [...current.commentExports, comment] };
      }
      const next = [...current.commentExports];
      next[index] = comment;
      return { ...current, commentExports: next };
    });
  }, []);

  const deleteComment = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      commentExports: current.commentExports.filter((comment) => comment.id !== id),
    }));
  }, []);

  const clearComments = useCallback(() => {
    setState((current) => ({ ...current, annotationsByFile: {}, commentExports: [] }));
  }, []);

  const removeCommentsByStatus = useCallback((status: "resolved" | "stale") => {
    setState((current) => {
      const removedIds = new Set(
        current.commentExports
          .filter((comment) => comment.status === status)
          .map((comment) => comment.id),
      );
      if (removedIds.size === 0) return current;
      return {
        ...current,
        annotationsByFile: Object.fromEntries(
          Object.entries(current.annotationsByFile).flatMap(([path, annotations]) => {
            const kept = annotations.filter(
              (annotation) => !removedIds.has(annotation.metadata.id),
            );
            return kept.length > 0 ? [[path, kept]] : [];
          }),
        ),
        commentExports: current.commentExports.filter((comment) => !removedIds.has(comment.id)),
      };
    });
  }, []);

  const resetReview = useCallback(() => {
    setState(createReviewSession(snapshotRef.current, autoCollapsedRef.current));
  }, []);

  const setFilters = useCallback((filters: ReviewFilters) => {
    setState((current) => ({ ...current, filters }));
  }, []);

  const setFileCommentDraft = useCallback((path: string, body: string) => {
    setState((current) => {
      const next = { ...current.fileCommentDrafts };
      if (body.length === 0) delete next[path];
      else next[path] = body;
      return { ...current, fileCommentDrafts: next };
    });
  }, []);

  const setFileOrder = useCallback((fileOrder: FileOrder) => {
    setState((current) => (current.fileOrder === fileOrder ? current : { ...current, fileOrder }));
  }, []);

  const setFileViewMode = useCallback((fileViewMode: FileViewMode) => {
    setState((current) =>
      current.fileViewMode === fileViewMode ? current : { ...current, fileViewMode },
    );
  }, []);

  const setReviewMode = useCallback((reviewMode: ReviewMode) => {
    setState((current) =>
      current.reviewMode === reviewMode ? current : { ...current, reviewMode },
    );
  }, []);

  const setReviewSurface = useCallback((reviewSurface: ReviewSurface) => {
    setState((current) =>
      current.reviewSurface === reviewSurface ? current : { ...current, reviewSurface },
    );
  }, []);

  const reconcileComments = useCallback(
    (fileDiffs: Parameters<typeof reconcileCommentAnchors>[1], snapshotId: string) => {
      setState((current) => {
        const commentExports = reconcileCommentAnchors(
          current.commentExports,
          fileDiffs,
          snapshotId,
        );
        if (commentExports === current.commentExports) return current;
        return {
          ...current,
          annotationsByFile: reconcileAnnotationsToComments(
            current.annotationsByFile,
            commentExports,
          ),
          commentExports,
        };
      });
    },
    [],
  );

  return {
    state,
    collapsedPaths,
    viewedPaths,
    clearComments,
    deleteComment,
    reconcileComments,
    removeCommentsByStatus,
    resetReview,
    setCollapsed,
    setFilters,
    setFileCommentDraft,
    setFileOrder,
    setFileViewMode,
    setReviewMode,
    setReviewSurface,
    setSelectedPath,
    setViewed,
    updateAnnotations,
    upsertComment,
  };
}

function readStoredSession(
  identity: string,
  snapshot: ReviewSessionSnapshot,
  autoCollapsedPaths: readonly string[],
  preferredSelectedPath?: string | null,
): ReviewSessionState {
  if (typeof window === "undefined") return createReviewSession(snapshot, autoCollapsedPaths);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(identity);
  } catch {
    // Treat inaccessible storage like an empty session.
  }
  const parsed = parseReviewSession(raw, snapshot, autoCollapsedPaths);
  return preferredSelectedPath != null &&
    snapshot.files.some((file) => file.path === preferredSelectedPath)
    ? { ...parsed, selectedPath: preferredSelectedPath }
    : parsed;
}
