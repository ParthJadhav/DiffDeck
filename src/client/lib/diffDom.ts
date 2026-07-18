import type { HunkTarget } from "./hunkNavigation.js";

export interface NavigateLineDetail extends Pick<HunkTarget, "line" | "side"> {
  path: string;
}

export function scrollToRenderedDiffLine({ line, path, side }: NavigateLineDetail): boolean {
  const card = findFileCard(path);
  if (card == null) return false;

  const lineType = side === "additions" ? "change-addition" : "change-deletion";
  const exactTarget = findInOpenRoots(card, (element) => {
    return (
      element.getAttribute("data-line") === String(line) &&
      element.getAttribute("data-line-type") === lineType
    );
  });
  const target =
    exactTarget ??
    findInOpenRoots(card, (element) => {
      const lineMatches =
        element.getAttribute("data-line") === String(line) ||
        element.getAttribute("data-alt-line") === String(line);
      if (!lineMatches) return false;
      const column = element.closest("[data-additions], [data-deletions]");
      return column == null || column.hasAttribute(`data-${side}`);
    });
  if (!(target instanceof HTMLElement)) return false;

  target.setAttribute("aria-label", `${side === "additions" ? "Added" : "Deleted"} line ${line}`);
  target.tabIndex = -1;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  target.focus({ preventScroll: true });
  return true;
}

export function focusRenderedReviewNote({
  id,
  path,
  scope,
}: {
  id: string;
  path: string;
  scope: "file" | "line";
}): boolean {
  const card = findFileCard(path);
  if (card == null) return false;
  const target = findInOpenRoots(card, (element) =>
    scope === "file"
      ? element.getAttribute("data-file-comment-path") === path
      : element.getAttribute("data-comment-id") === id,
  );
  if (!(target instanceof HTMLElement)) return false;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  target.focus({ preventScroll: true });
  return true;
}

function findFileCard(path: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-file-path]")).find(
      (candidate) => candidate.dataset.filePath === path,
    ) ?? null
  );
}

function findInOpenRoots(
  root: ParentNode,
  predicate: (element: Element) => boolean,
): Element | null {
  for (const element of root.querySelectorAll("*")) {
    if (predicate(element)) return element;
    if (element.shadowRoot != null) {
      const nested = findInOpenRoots(element.shadowRoot, predicate);
      if (nested != null) return nested;
    }
  }
  return null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
