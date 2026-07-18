import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SelectedLineRange } from "@pierre/diffs";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { DiffFileSummary } from "../../types.js";
import { chooseVisiblePath } from "../../lib/visiblePath.js";
import { Card } from "../ui/card.js";

const VIRTUOSO_OVERSCAN_PX = 1200;
const VIRTUOSO_INCREASE_VIEWPORT_PX = 600;
const VIRTUOSO_MIN_ITEM_HEIGHT_PX = 40;
const computeItemKey = (_index: number, file: DiffFileSummary) => file.path;
const measureFileItem = (element: HTMLElement) =>
  Math.max(
    element.getBoundingClientRect().height,
    element.offsetHeight,
    VIRTUOSO_MIN_ITEM_HEIGHT_PX,
  );

type SelectedLinesByFile = Record<string, SelectedLineRange | null>;

export function MultiFileScroller(props: {
  collapsedFilePaths: ReadonlySet<string>;
  files: DiffFileSummary[];
  onRequestFileDiff: (path: string) => void;
  onVisiblePathChange: (path: string) => void;
  renderFile: (
    file: DiffFileSummary,
    selectedLines: SelectedLineRange | null,
    onSelectedLinesChange: (path: string, range: SelectedLineRange | null) => void,
  ) => ReactNode;
  scrollSignal: number;
  selectedPath: string | null;
}) {
  const {
    collapsedFilePaths,
    files,
    onRequestFileDiff,
    onVisiblePathChange,
    renderFile,
    scrollSignal,
    selectedPath,
  } = props;

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const lastReportedPathRef = useRef<string | null>(null);
  const suppressObserverUntilRef = useRef(
    typeof performance === "undefined" ? 0 : performance.now() + 1_000,
  );
  const pinnedPathRef = useRef<string | null>(selectedPath);
  const visibleObserverCleanupRef = useRef<(() => void) | null>(null);
  const fileIndexByPath = useMemo(
    () => new Map(files.map((file, index) => [file.path, index])),
    [files],
  );

  // Keep row-local state above the virtualized items so drafts and selections
  // survive when Virtuoso unmounts and remounts an off-screen file.
  const [selectedLines, setSelectedLines] = useState<SelectedLinesByFile>({});

  const handleSelectedLinesChange = useCallback((path: string, range: SelectedLineRange | null) => {
    setSelectedLines((current) => {
      if (current[path] === range) return current;
      if (range == null) {
        if (!(path in current)) return current;
        const { [path]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [path]: range };
    });
  }, []);

  const handleRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      for (let index = range.startIndex; index <= range.endIndex; index += 1) {
        const file = files[index];
        if (file == null || file.hasMergeConflicts === true || file.isBinary === true) continue;
        if (collapsedFilePaths.has(file.path)) continue;
        onRequestFileDiff(file.path);
      }
    },
    [collapsedFilePaths, files, onRequestFileDiff],
  );

  const handleScrollerRef = useCallback(
    (ref: HTMLElement | Window | null) => {
      visibleObserverCleanupRef.current?.();
      visibleObserverCleanupRef.current = null;
      if (!(ref instanceof HTMLElement)) return;
      visibleObserverCleanupRef.current = installVisiblePathObserver(ref, {
        lastReportedPathRef,
        onVisiblePathChange,
        pinnedPathRef,
        suppressObserverUntilRef,
      });
    },
    [onVisiblePathChange],
  );

  useEffect(() => cleanupVisibleObserver(visibleObserverCleanupRef), []);

  const handledScrollRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedPath == null) return;
    const scrollRequest = `${scrollSignal}:${selectedPath}`;
    if (handledScrollRequestRef.current === scrollRequest) return;
    const index = fileIndexByPath.get(selectedPath);
    if (index == null) return;
    handledScrollRequestRef.current = scrollRequest;
    lastReportedPathRef.current = selectedPath;
    pinnedPathRef.current = selectedPath;
    suppressObserverUntilRef.current = performance.now() + 350;
    let released = false;
    const timers: number[] = [];
    const scrollToSelected = () => {
      if (!released) virtuosoRef.current?.scrollToIndex({ index, align: "start" });
    };
    scrollToSelected();
    const animationFrame = window.requestAnimationFrame(scrollToSelected);
    for (const delay of [100, 250, 500, 1_000, 1_500]) {
      timers.push(window.setTimeout(scrollToSelected, delay));
    }

    const release = () => {
      if (released) return;
      released = true;
      pinnedPathRef.current = null;
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("keydown", release);
    };
    window.addEventListener("wheel", release, { passive: true, once: true });
    window.addEventListener("touchstart", release, { passive: true, once: true });
    window.addEventListener("keydown", release, { once: true });
    return () => {
      if (handledScrollRequestRef.current === scrollRequest) {
        handledScrollRequestRef.current = null;
      }
      window.cancelAnimationFrame(animationFrame);
      release();
    };
  }, [fileIndexByPath, scrollSignal, selectedPath]);

  const itemContent = useCallback(
    (_index: number, file: DiffFileSummary) => (
      <Card
        aria-current={file.path === selectedPath ? "location" : undefined}
        data-file-path={file.path}
        data-selected={file.path === selectedPath ? "true" : undefined}
        className="app-file-card m-2.5 scroll-mt-2.5 overflow-clip rounded-lg border-border"
      >
        {renderFile(file, selectedLines[file.path] ?? null, handleSelectedLinesChange)}
      </Card>
    ),
    [handleSelectedLinesChange, renderFile, selectedLines, selectedPath],
  );

  return (
    <Virtuoso<DiffFileSummary>
      ref={virtuosoRef}
      data={files}
      itemContent={itemContent}
      computeItemKey={computeItemKey}
      defaultItemHeight={VIRTUOSO_MIN_ITEM_HEIGHT_PX}
      rangeChanged={handleRangeChanged}
      itemSize={measureFileItem}
      overscan={VIRTUOSO_OVERSCAN_PX}
      increaseViewportBy={VIRTUOSO_INCREASE_VIEWPORT_PX}
      initialTopMostItemIndex={fileIndexByPath.get(selectedPath ?? "") ?? 0}
      scrollerRef={handleScrollerRef}
      className="app-virtuoso h-full"
    />
  );
}

function installVisiblePathObserver(
  root: HTMLElement,
  refs: {
    lastReportedPathRef: { current: string | null };
    onVisiblePathChange: (path: string) => void;
    pinnedPathRef: { current: string | null };
    suppressObserverUntilRef: { current: number };
  },
): () => void {
  const visibility = new Map<string, Element>();
  const observed = new WeakSet<Element>();
  const aboveThreshold = 24;
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const path = (entry.target as HTMLElement).dataset.filePath;
        if (path == null) continue;
        if (entry.isIntersecting) visibility.set(path, entry.target);
        else visibility.delete(path);
      }
      if (performance.now() < refs.suppressObserverUntilRef.current) return;
      const rootTop = root.getBoundingClientRect().top;
      const bestPath = chooseVisiblePath(
        Array.from(visibility, ([path, node]) => ({
          path,
          top: node.getBoundingClientRect().top - rootTop,
        })),
        refs.pinnedPathRef.current,
        aboveThreshold,
      );
      if (bestPath != null && bestPath !== refs.lastReportedPathRef.current) {
        refs.lastReportedPathRef.current = bestPath;
        refs.onVisiblePathChange(bestPath);
      }
    },
    { root, threshold: 0 },
  );
  const adopt = (target: Element) => {
    const candidates = target.matches?.("[data-file-path]")
      ? [target]
      : Array.from(target.querySelectorAll<HTMLElement>("[data-file-path]"));
    for (const node of candidates) {
      if (observed.has(node)) continue;
      observed.add(node);
      intersectionObserver.observe(node);
    }
  };
  adopt(root);
  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) adopt(node);
      }
    }
  });
  mutationObserver.observe(root, { childList: true, subtree: true });
  return () => {
    intersectionObserver.disconnect();
    mutationObserver.disconnect();
  };
}

function cleanupVisibleObserver(ref: { current: (() => void) | null }) {
  const cleanup = ref.current;
  return () => {
    cleanup?.();
    if (ref.current === cleanup) ref.current = null;
  };
}
