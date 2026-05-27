import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs";

export type CommentAnnotationMetadata = {
  body: string;
  id: string;
  kind: "comment-form" | "comment";
  // Set when the form is reopened to edit an existing comment. Cancel restores
  // body + kind from this snapshot instead of removing the annotation.
  previousBody?: string;
};

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
