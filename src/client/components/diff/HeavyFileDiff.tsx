import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cleanLastNewline } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { LoaderCircle } from "lucide-react";

const ROW_HEIGHT = 20;
const OVERSCAN = 16;

type Row =
  | { kind: "context"; text: string; oldNum: number; newNum: number }
  | { kind: "add"; text: string; newNum: number }
  | { kind: "delete"; text: string; oldNum: number }
  | { kind: "gap"; label: string };

// Pierre keeps the trailing line terminator; we render with `white-space: pre`
// inside fixed-height rows so any literal newline would push content out.
const stripNewline = (line: string | undefined) => (line == null ? "" : cleanLastNewline(line));

const ROW_CLASS: Record<Row["kind"], string> = {
  context: "app-heavy-row",
  add: "app-heavy-row app-heavy-row-add",
  delete: "app-heavy-row app-heavy-row-delete",
  gap: "app-heavy-row app-heavy-row-gap",
};

const ROW_SIGIL: Record<Row["kind"], string> = {
  context: " ",
  add: "+",
  delete: "-",
  gap: "",
};

function buildRows(fileDiff: FileDiffMetadata): Row[] {
  const rows: Row[] = [];
  const { hunks, additionLines, deletionLines } = fileDiff;
  for (let h = 0; h < hunks.length; h++) {
    const hunk = hunks[h];
    if (h > 0 || (hunk.collapsedBefore ?? 0) > 0) {
      const label =
        hunk.hunkSpecs ??
        `@@ -${hunk.deletionStart},${hunk.deletionCount} +${hunk.additionStart},${hunk.additionCount} @@${
          hunk.hunkContext != null ? ` ${hunk.hunkContext}` : ""
        }`;
      rows.push({ kind: "gap", label });
    }
    let oldLine = hunk.deletionStart;
    let newLine = hunk.additionStart;
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        for (let i = 0; i < content.lines; i++) {
          rows.push({
            kind: "context",
            text: stripNewline(additionLines[content.additionLineIndex + i]),
            oldNum: oldLine + i,
            newNum: newLine + i,
          });
        }
        oldLine += content.lines;
        newLine += content.lines;
      } else {
        for (let i = 0; i < content.deletions; i++) {
          rows.push({
            kind: "delete",
            text: stripNewline(deletionLines[content.deletionLineIndex + i]),
            oldNum: oldLine + i,
          });
        }
        oldLine += content.deletions;
        for (let i = 0; i < content.additions; i++) {
          rows.push({
            kind: "add",
            text: stripNewline(additionLines[content.additionLineIndex + i]),
            newNum: newLine + i,
          });
        }
        newLine += content.additions;
      }
    }
  }
  return rows;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  // The diff workspace nests two `overflow:auto` wrappers; only the outer one
  // actually scrolls. Prefer the ancestor that's currently overflowing; fall
  // back to the first overflow:auto for the initial mount before content has
  // grown past the viewport.
  let node: HTMLElement | null = el?.parentElement ?? null;
  let fallback: HTMLElement | null = null;
  while (node) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      if (node.clientHeight > 0 && node.scrollHeight > node.clientHeight) {
        return node;
      }
      if (fallback == null) fallback = node;
    }
    node = node.parentElement;
  }
  return fallback ?? (document.scrollingElement as HTMLElement | null);
}

export const HeavyFileDiff = memo(function HeavyFileDiff({
  collapsed,
  fileDiff,
  header,
}: {
  collapsed: boolean;
  fileDiff: FileDiffMetadata;
  header: ReactNode;
}) {
  // Defer row generation by one paint after expand so the header paints
  // immediately and the user gets feedback while we walk the (potentially
  // 24k-line) hunk tree. Always start false — initialising from `!collapsed`
  // would render rows synchronously on mount and skip the deferral.
  const [renderRows, setRenderRows] = useState(false);

  useEffect(() => {
    if (collapsed) {
      setRenderRows(false);
      return;
    }
    const raf = requestAnimationFrame(() => setRenderRows(true));
    return () => cancelAnimationFrame(raf);
  }, [collapsed]);

  const rows = useMemo(() => (renderRows ? buildRows(fileDiff) : []), [renderRows, fileDiff]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const commitRange = useCallback((start: number, end: number) => {
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useLayoutEffect(() => {
    if (!renderRows || rows.length === 0) {
      commitRange(0, 0);
      return;
    }
    const node = containerRef.current;
    if (node == null) return;
    const scroller = findScrollParent(node);
    if (scroller == null) {
      commitRange(0, rows.length);
      return;
    }

    let raf = 0;
    const compute = () => {
      raf = 0;
      const current = containerRef.current;
      if (current == null) return;
      const rect = current.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const topInViewport = rect.top - scrollerRect.top;
      const viewportHeight = scroller.clientHeight;
      const offset = Math.max(0, -topInViewport);
      const startIdx = Math.max(0, Math.floor(offset / ROW_HEIGHT) - OVERSCAN);
      const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
      const endIdx = Math.min(rows.length, startIdx + visibleCount);
      commitRange(startIdx, endIdx);
    };

    const schedule = () => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(compute);
    };

    compute();
    scroller.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    // Watch the scroll content for sibling resizes (e.g. when another file
    // expands above us, our offset within the scroller changes but no scroll
    // event fires).
    const scrollContent = scroller.firstElementChild;
    if (scrollContent instanceof HTMLElement) {
      ro.observe(scrollContent);
    }

    return () => {
      scroller.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [commitRange, renderRows, rows.length]);

  if (collapsed) {
    return <>{header}</>;
  }

  if (!renderRows) {
    return (
      <>
        {header}
        <output
          aria-live="polite"
          aria-busy="true"
          className="app-diff-state grid place-items-center p-6 text-xs text-muted-foreground"
        >
          <span className="inline-flex items-center gap-2">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            <span>Preparing diff…</span>
          </span>
        </output>
      </>
    );
  }

  const totalHeight = rows.length * ROW_HEIGHT;
  const visible = rows.slice(range.start, range.end);

  return (
    <>
      {header}
      <div
        ref={containerRef}
        className="app-heavy-rows"
        style={{ height: totalHeight }}
        aria-label={`${rows.length.toLocaleString()} diff rows (lightweight rendering)`}
      >
        {visible.map((row, i) => (
          <HeavyRow key={range.start + i} row={row} top={(range.start + i) * ROW_HEIGHT} />
        ))}
      </div>
    </>
  );
});

function HeavyRow({ row, top }: { row: Row; top: number }) {
  if (row.kind === "gap") {
    return (
      <div className={ROW_CLASS.gap} style={{ top }}>
        <span className="app-heavy-num" />
        <span className="app-heavy-num" />
        <span className="app-heavy-sigil" />
        <span className="app-heavy-text">{row.label}</span>
      </div>
    );
  }

  const oldNum = row.kind === "delete" || row.kind === "context" ? row.oldNum : null;
  const newNum = row.kind === "add" || row.kind === "context" ? row.newNum : null;

  return (
    <div className={ROW_CLASS[row.kind]} style={{ top }}>
      <span className="app-heavy-num">{oldNum ?? ""}</span>
      <span className="app-heavy-num">{newNum ?? ""}</span>
      <span className="app-heavy-sigil">{ROW_SIGIL[row.kind]}</span>
      <span className="app-heavy-text">{row.text}</span>
    </div>
  );
}
