import type { ExpansionDirections } from "@pierre/diffs";

type HunkExpansionInstance = {
  expandHunk: (
    hunkIndex: number,
    direction: ExpansionDirections,
    expansionLineCountOverride?: number,
  ) => void;
};

const fallbackNodes = new WeakSet<HTMLElement>();
const fallbackRoots = new WeakSet<EventTarget>();
const fallbackInstances = new WeakMap<HTMLElement, HunkExpansionInstance>();

export function installHunkExpansionFallback(node: HTMLElement, instance: HunkExpansionInstance) {
  fallbackInstances.set(node, instance);
  if (!fallbackNodes.has(node)) {
    fallbackNodes.add(node);
    addFallbackRoot(node);
  }
  if (node.shadowRoot != null) {
    addFallbackRoot(node.shadowRoot);
  }
}

function addFallbackRoot(root: EventTarget) {
  if (fallbackRoots.has(root)) return;
  fallbackRoots.add(root);
  root.addEventListener("click", handleFallbackClick, { capture: true });
}

function handleFallbackClick(event: Event) {
  const currentTarget = event.currentTarget;
  const node = currentTarget instanceof ShadowRoot ? currentTarget.host : currentTarget;
  if (!(node instanceof HTMLElement)) return;

  const instance = fallbackInstances.get(node);
  if (instance == null) return;

  const target = findExpansionTarget(event, node);
  if (target == null) return;

  event.preventDefault();
  event.stopPropagation();
  instance.expandHunk(
    target.hunkIndex,
    target.expandAll ? "both" : target.direction,
    target.expandAll ? Number.POSITIVE_INFINITY : undefined,
  );
}

function findExpansionTarget(
  event: Event,
  rootNode: HTMLElement,
): { direction: ExpansionDirections; expandAll: boolean; hunkIndex: number } | null {
  let direction: ExpansionDirections = "both";
  let expandAll = event instanceof MouseEvent && event.shiftKey;
  let foundExpandable = false;

  for (const target of event.composedPath()) {
    if (!(target instanceof HTMLElement)) continue;
    if (target === rootNode) break;

    if (
      !foundExpandable &&
      (target.hasAttribute("data-expand-button") || target.hasAttribute("data-unmodified-lines"))
    ) {
      foundExpandable = true;
      expandAll = expandAll || target.hasAttribute("data-expand-all-button");
      if (target.hasAttribute("data-expand-up")) {
        direction = "up";
      } else if (target.hasAttribute("data-expand-down")) {
        direction = "down";
      }
    }

    if (foundExpandable && target.hasAttribute("data-expand-index")) {
      const hunkIndex = Number.parseInt(target.getAttribute("data-expand-index") ?? "", 10);
      return Number.isFinite(hunkIndex) ? { direction, expandAll, hunkIndex } : null;
    }
  }

  return null;
}
