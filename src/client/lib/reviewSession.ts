import type { AnnotationSide } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { CommentExportRecord } from "./commentExport.js";

export const REVIEW_SESSION_VERSION = 1;

export type ReviewCommentKind = "comment-form" | "comment";
export type ReviewCommentStatus = "open" | "resolved" | "stale";

export interface ReviewAnnotationMetadata {
  body: string;
  id: string;
  kind: ReviewCommentKind;
  previousBody?: string;
}

export interface ReviewAnnotation {
  side: AnnotationSide;
  lineNumber: number;
  metadata: ReviewAnnotationMetadata;
}

export interface ReviewFilters {
  binary: boolean;
  conflicts: boolean;
  dependency: boolean;
  extensions: string[];
  changeSizes: string[];
  hideDeleted: boolean;
  hideGenerated: boolean;
  hideLock: boolean;
  hideViewed: boolean;
  path: string;
  statuses: string[];
}

export interface ReviewSessionFile {
  diffId: string;
  path: string;
  prevPath?: string;
}

export interface ReviewSessionSnapshot {
  diffArgs: string[];
  files: ReviewSessionFile[];
  repoRoot: string;
  snapshotId: string;
}

export interface ReviewSessionState {
  annotationsByFile: Record<string, ReviewAnnotation[]>;
  collapsedPaths: string[];
  commentExports: CommentExportRecord[];
  fileIdentities: Record<string, string>;
  filters: ReviewFilters;
  identity: string;
  selectedPath: string | null;
  snapshotId: string;
  version: typeof REVIEW_SESSION_VERSION;
  viewedPaths: string[];
}

export const emptyReviewFilters: ReviewFilters = {
  binary: false,
  conflicts: false,
  dependency: false,
  extensions: [],
  changeSizes: [],
  hideDeleted: false,
  hideGenerated: false,
  hideLock: false,
  hideViewed: false,
  path: "",
  statuses: [],
};

export function createReviewSessionIdentity(snapshot: ReviewSessionSnapshot): string {
  const source = JSON.stringify([snapshot.repoRoot, snapshot.diffArgs]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `diffdeck.review.${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createReviewSession(
  snapshot: ReviewSessionSnapshot,
  autoCollapsedPaths: readonly string[] = [],
): ReviewSessionState {
  return {
    annotationsByFile: {},
    collapsedPaths: uniqueExistingPaths(autoCollapsedPaths, snapshot.files),
    commentExports: [],
    fileIdentities: buildFileIdentities(snapshot.files),
    filters: { ...emptyReviewFilters },
    identity: createReviewSessionIdentity(snapshot),
    selectedPath: snapshot.files[0]?.path ?? null,
    snapshotId: snapshot.snapshotId,
    version: REVIEW_SESSION_VERSION,
    viewedPaths: [],
  };
}

export function parseReviewSession(
  raw: string | null,
  snapshot: ReviewSessionSnapshot,
  autoCollapsedPaths: readonly string[] = [],
): ReviewSessionState {
  if (raw == null) return createReviewSession(snapshot, autoCollapsedPaths);

  try {
    const candidate = JSON.parse(raw) as Partial<ReviewSessionState>;
    if (
      candidate.version !== REVIEW_SESSION_VERSION ||
      candidate.identity !== createReviewSessionIdentity(snapshot)
    ) {
      return createReviewSession(snapshot, autoCollapsedPaths);
    }

    const hydrated: ReviewSessionState = {
      annotationsByFile: sanitizeAnnotations(candidate.annotationsByFile),
      collapsedPaths: sanitizeStringArray(candidate.collapsedPaths),
      commentExports: sanitizeCommentExports(candidate.commentExports),
      fileIdentities: sanitizeStringRecord(candidate.fileIdentities),
      filters: sanitizeFilters(candidate.filters),
      identity: candidate.identity,
      selectedPath: typeof candidate.selectedPath === "string" ? candidate.selectedPath : null,
      snapshotId: typeof candidate.snapshotId === "string" ? candidate.snapshotId : "",
      version: REVIEW_SESSION_VERSION,
      viewedPaths: sanitizeStringArray(candidate.viewedPaths),
    };
    return reconcileReviewSession(hydrated, snapshot, autoCollapsedPaths);
  } catch {
    return createReviewSession(snapshot, autoCollapsedPaths);
  }
}

export function serializeReviewSession(state: ReviewSessionState): string {
  return JSON.stringify(state);
}

export function reconcileReviewSession(
  current: ReviewSessionState,
  snapshot: ReviewSessionSnapshot,
  autoCollapsedPaths: readonly string[] = [],
): ReviewSessionState {
  const identity = createReviewSessionIdentity(snapshot);
  if (current.identity !== identity) return createReviewSession(snapshot, autoCollapsedPaths);
  if (current.snapshotId === snapshot.snapshotId) {
    return normalizeCurrentPaths(current, snapshot.files);
  }

  const nextIdentities = buildFileIdentities(snapshot.files);
  const currentPaths = new Set(snapshot.files.map((file) => file.path));
  const renamedPaths = new Map(
    snapshot.files.flatMap((file) =>
      file.prevPath != null && file.prevPath !== file.path ? [[file.prevPath, file.path]] : [],
    ),
  );
  const changedPaths = new Set<string>();
  for (const [path, diffId] of Object.entries(current.fileIdentities)) {
    if (nextIdentities[path] !== diffId) changedPaths.add(path);
  }

  const nextComments = current.commentExports.map((comment) => {
    const renamedPath = renamedPaths.get(comment.filePath);
    return changedPaths.has(comment.filePath) ||
      renamedPath != null ||
      !currentPaths.has(comment.filePath)
      ? { ...comment, filePath: renamedPath ?? comment.filePath, status: "stale" as const }
      : comment;
  });
  const nextAnnotations = { ...current.annotationsByFile };
  for (const [previousPath, nextPath] of renamedPaths) {
    if (nextAnnotations[previousPath] == null) continue;
    nextAnnotations[nextPath] = nextAnnotations[previousPath];
    delete nextAnnotations[previousPath];
  }
  const nextViewed = current.viewedPaths.filter(
    (path) => currentPaths.has(path) && !changedPaths.has(path),
  );
  const nextCollapsed = uniqueExistingPaths(
    [...current.collapsedPaths, ...autoCollapsedPaths.filter((path) => changedPaths.has(path))],
    snapshot.files,
  );
  const selectedPath =
    current.selectedPath == null
      ? (snapshot.files[0]?.path ?? null)
      : (renamedPaths.get(current.selectedPath) ??
        (currentPaths.has(current.selectedPath)
          ? current.selectedPath
          : (snapshot.files[0]?.path ?? null)));

  return {
    ...current,
    annotationsByFile: nextAnnotations,
    collapsedPaths: nextCollapsed,
    commentExports: nextComments,
    fileIdentities: nextIdentities,
    selectedPath,
    snapshotId: snapshot.snapshotId,
    viewedPaths: nextViewed,
  };
}

export function updateReviewPathSet(
  values: readonly string[],
  path: string,
  enabled: boolean,
): string[] {
  const next = new Set(values);
  if (enabled) next.add(path);
  else next.delete(path);
  return sortedStrings(next);
}

export function updateReviewAnnotations(
  annotationsByFile: Readonly<Record<string, ReviewAnnotation[]>>,
  path: string,
  updater: (current: ReviewAnnotation[]) => ReviewAnnotation[],
): Record<string, ReviewAnnotation[]> {
  const previous = annotationsByFile[path] ?? [];
  const next = updater(previous);
  if (next === previous) return annotationsByFile as Record<string, ReviewAnnotation[]>;
  if (next.length === 0) {
    if (!(path in annotationsByFile))
      return annotationsByFile as Record<string, ReviewAnnotation[]>;
    const { [path]: _removed, ...rest } = annotationsByFile;
    return rest;
  }
  return { ...annotationsByFile, [path]: next };
}

export function reconcileCommentAnchors(
  comments: readonly CommentExportRecord[],
  fileDiffs: Readonly<Record<string, FileDiffMetadata>>,
  snapshotId: string,
): CommentExportRecord[] {
  let changed = false;
  const next = comments.map((comment) => {
    if (comment.status !== "stale") return comment;
    const fileDiff = fileDiffs[comment.filePath];
    if (fileDiff == null) return comment;
    const target = comment.contextLines.find((line) => line.target)?.content.trimEnd();
    if (target == null) return comment;
    const matches = findMatchingLines(fileDiff, comment.side, target);
    if (matches.length === 1) {
      changed = true;
      return { ...comment, lineNumber: matches[0]!, snapshotId, status: "open" as const };
    }
    if (matches.length === 0) {
      changed = true;
      return { ...comment, snapshotId, status: "resolved" as const };
    }
    return comment;
  });
  return changed ? next : (comments as CommentExportRecord[]);
}

export function reconcileAnnotationsToComments(
  annotationsByFile: Readonly<Record<string, ReviewAnnotation[]>>,
  comments: readonly CommentExportRecord[],
): Record<string, ReviewAnnotation[]> {
  const anchors = new Map(comments.map((comment) => [comment.id, comment]));
  let changed = false;
  const next = Object.fromEntries(
    Object.entries(annotationsByFile).map(([path, annotations]) => [
      path,
      annotations.map((annotation) => {
        const anchor = anchors.get(annotation.metadata.id);
        if (
          anchor == null ||
          (anchor.lineNumber === annotation.lineNumber && anchor.side === annotation.side)
        ) {
          return annotation;
        }
        changed = true;
        return { ...annotation, lineNumber: anchor.lineNumber, side: anchor.side };
      }),
    ]),
  );
  return changed ? next : (annotationsByFile as Record<string, ReviewAnnotation[]>);
}

function findMatchingLines(
  fileDiff: FileDiffMetadata,
  side: AnnotationSide,
  target: string,
): number[] {
  const source = side === "additions" ? fileDiff.additionLines : fileDiff.deletionLines;
  const matches: number[] = [];
  if (!fileDiff.isPartial) {
    source.forEach((line, index) => {
      if (line.replace(/\r?\n$/, "").trimEnd() === target) matches.push(index + 1);
    });
    return matches;
  }
  for (const hunk of fileDiff.hunks) {
    const start = side === "additions" ? hunk.additionStart : hunk.deletionStart;
    const count = side === "additions" ? hunk.additionCount : hunk.deletionCount;
    const lineIndex = side === "additions" ? hunk.additionLineIndex : hunk.deletionLineIndex;
    for (let offset = 0; offset < count; offset += 1) {
      if (source[lineIndex + offset]?.replace(/\r?\n$/, "").trimEnd() === target) {
        matches.push(start + offset);
      }
    }
  }
  return matches;
}

function normalizeCurrentPaths(
  current: ReviewSessionState,
  files: readonly ReviewSessionFile[],
): ReviewSessionState {
  const paths = new Set(files.map((file) => file.path));
  return {
    ...current,
    collapsedPaths: current.collapsedPaths.filter((path) => paths.has(path)),
    selectedPath:
      current.selectedPath != null && paths.has(current.selectedPath)
        ? current.selectedPath
        : (files[0]?.path ?? null),
    viewedPaths: current.viewedPaths.filter((path) => paths.has(path)),
  };
}

function buildFileIdentities(files: readonly ReviewSessionFile[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file.path, file.diffId]));
}

function uniqueExistingPaths(
  values: readonly string[],
  files: readonly ReviewSessionFile[],
): string[] {
  const paths = new Set(files.map((file) => file.path));
  return sortedStrings(new Set(values.filter((path) => paths.has(path))));
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? sortedStrings(new Set(value.filter((item): item is string => typeof item === "string")))
    : [];
}

function sortedStrings(values: Iterable<string>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const index = result.findIndex((current) => current.localeCompare(value) > 0);
    if (index === -1) result.push(value);
    else result.splice(index, 0, value);
  }
  return result;
}

function sanitizeStringRecord(value: unknown): Record<string, string> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function sanitizeAnnotations(value: unknown): Record<string, ReviewAnnotation[]> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, ReviewAnnotation[]> = {};
  for (const [path, annotations] of Object.entries(value)) {
    if (!Array.isArray(annotations)) continue;
    const valid = annotations.filter(isReviewAnnotation);
    if (valid.length > 0) result[path] = valid;
  }
  return result;
}

function isReviewAnnotation(value: unknown): value is ReviewAnnotation {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Partial<ReviewAnnotation>;
  const metadata = candidate.metadata as Partial<ReviewAnnotationMetadata> | undefined;
  return (
    (candidate.side === "additions" || candidate.side === "deletions") &&
    typeof candidate.lineNumber === "number" &&
    metadata != null &&
    typeof metadata.id === "string" &&
    typeof metadata.body === "string" &&
    (metadata.kind === "comment" || metadata.kind === "comment-form")
  );
}

function sanitizeCommentExports(value: unknown): CommentExportRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CommentExportRecord => {
    if (item == null || typeof item !== "object") return false;
    const candidate = item as Partial<CommentExportRecord>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.body === "string" &&
      typeof candidate.filePath === "string" &&
      typeof candidate.lineNumber === "number" &&
      (candidate.side === "additions" || candidate.side === "deletions") &&
      Array.isArray(candidate.contextLines)
    );
  });
}

function sanitizeFilters(value: unknown): ReviewFilters {
  if (value == null || typeof value !== "object") return { ...emptyReviewFilters };
  const candidate = value as Partial<ReviewFilters>;
  return {
    binary: candidate.binary === true,
    conflicts: candidate.conflicts === true,
    dependency: candidate.dependency === true,
    extensions: sanitizeStringArray(candidate.extensions),
    changeSizes: sanitizeStringArray(candidate.changeSizes),
    hideDeleted: candidate.hideDeleted === true,
    hideGenerated: candidate.hideGenerated === true,
    hideLock: candidate.hideLock === true,
    hideViewed: candidate.hideViewed === true,
    path: typeof candidate.path === "string" ? candidate.path : "",
    statuses: sanitizeStringArray(candidate.statuses),
  };
}
