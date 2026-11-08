import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs";
import type { ReviewAnnotationMetadata } from "../../lib/reviewSession.js";

export type CommentAnnotationMetadata = ReviewAnnotationMetadata;

export type CommentAnnotation = DiffLineAnnotation<CommentAnnotationMetadata>;

export function patchAnnotationMeta(
  annotations: CommentAnnotation[],
  id: string,
  patch: Partial<CommentAnnotationMetadata>,
): CommentAnnotation[] {
  return annotations.map((annotation) =>
    annotation.metadata.id === id
      ? { ...annotation, metadata: { ...annotation.metadata, ...patch } }
      : annotation,
  );
}

export function newLineCommentId(side: AnnotationSide, lineNumber: number): string {
  return `${side}-${lineNumber}-${Date.now()}`;
}

/** Opens a composer at a line unless one is already open there. */
export function addCommentForm(
  annotations: CommentAnnotation[],
  side: AnnotationSide,
  lineNumber: number,
): CommentAnnotation[] {
  const alreadyOpen = annotations.some(
    (annotation) =>
      annotation.side === side &&
      annotation.lineNumber === lineNumber &&
      annotation.metadata.kind === "comment-form",
  );
  return alreadyOpen ? annotations : [...annotations, createCommentAnnotation(side, lineNumber)];
}

function createCommentAnnotation(side: AnnotationSide, lineNumber: number): CommentAnnotation {
  return {
    side,
    lineNumber,
    metadata: { body: "", id: newLineCommentId(side, lineNumber), kind: "comment-form" },
  };
}
