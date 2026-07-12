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

export function createCommentAnnotation(
  side: AnnotationSide,
  lineNumber: number,
): CommentAnnotation {
  return {
    side,
    lineNumber,
    metadata: {
      body: "",
      id: `${side}-${lineNumber}-${Date.now()}`,
      kind: "comment-form",
    },
  };
}
