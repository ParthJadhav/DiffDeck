import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FileDiffMetadata } from "@pierre/diffs/react";

const ROW_HEIGHT = 20;
const OVERSCAN = 16;

type Row =
  | { kind: "context"; text: string; oldNum: number; newNum: number }
  | { kind: "add"; text: string; newNum: number }
  | { kind: "delete"; text: string; oldNum: number }
  | { kind: "gap"; label: string };

function stripTrailingNewline(line: string | undefined): string {
  if (line == null) return "";
  // Pierre keeps the trailing line terminator; we render with `white-space:
  // pre` inside fixed-height rows so any literal newline would push content
  // out of the row.
  if (line.endsWith("\r\n")) return line.slice(0, -2);
  if (line.endsWith("\n")) return line.slice(0, -1);
  return line;
}

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
            text: stripTrailingNewline(additionLines[content.additionLineIndex + i]),
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
            text: stripTrailingNewline(deletionLines[content.deletionLineIndex + i]),
            oldNum: oldLine + i,
          });
        }
        oldLine += content.deletions;
        for (let i = 0; i < content.additions; i++) {
          rows.push({
            kind: "add",
            text: stripTrailingNewline(additionLines[content.additionLineIndex + i]),
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
  // Walk up looking for the closest ancestor that *actually* scrolls (i.e.
  // clientHeight < scrollHeight). The diff workspace nests two `overflow:auto`
  // wrappers; only the outer one (the flex column with `min-h-0`) is the real
  // scroll container — the inner `Virtualizer` wrapper sizes itself to its
  // content height and never scrolls. Fall back to the first overflow:auto
  // ancestor if nothing has overflowing content yet (initial mount).
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
  return fallback ?? document.scrollingElement as HTMLElement | null;
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
  // Defer row generation by one paint when transitioning collapsed → expanded
  // so the header re-paints immediately and the user gets feedback while we
  // walk the (potentially 24k-line) hunk tree.
  const [renderRows, setRenderRows] = useState(!collapsed);

  useEffect(() => {
    if (collapsed) {
      setRenderRows(false);
      return;
    }
    if (renderRows) return;
    const raf = requestAnimationFrame(() => setRenderRows(true));
    return () => cancelAnimationFrame(raf);
  }, [collapsed, renderRows]);

  const rows = useMemo(() => (renderRows ? buildRows(fileDiff) : []), [renderRows, fileDiff]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });

  useLayoutEffect(() => {
    if (!renderRows || rows.length === 0) {
      setRange((prev) => (prev.start === 0 && prev.end === 0 ? prev : { start: 0, end: 0 }));
      return;
    }
    const node = containerRef.current;
    if (node == null) return;
    const scroller = findScrollParent(node);
    if (scroller == null) {
      setRange({ start: 0, end: rows.length });
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
      setRange((prev) =>
        prev.start === startIdx && prev.end === endIdx ? prev : { start: startIdx, end: endIdx },
      );
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
  }, [renderRows, rows.length]);

  if (collapsed) {
    return <>{header}</>;
  }

  if (!renderRows) {
    return (
      <>
        {header}
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="app-diff-state grid place-items-center p-6 text-xs text-muted-foreground"
        >
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="app-pending-spinner" />
            <span>Preparing diff…</span>
          </span>
        </div>
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
      <div className="app-heavy-row app-heavy-row-gap" style={{ top }}>
        <span className="app-heavy-num" />
        <span className="app-heavy-num" />
        <span className="app-heavy-sigil" />
        <span className="app-heavy-text">{row.label}</span>
      </div>
    );
  }

  const oldNum = row.kind === "delete" || row.kind === "context" ? row.oldNum : null;
  const newNum = row.kind === "add" || row.kind === "context" ? row.newNum : null;
  const sigil = row.kind === "add" ? "+" : row.kind === "delete" ? "-" : " ";
  const cls =
    row.kind === "add"
      ? "app-heavy-row app-heavy-row-add"
      : row.kind === "delete"
        ? "app-heavy-row app-heavy-row-delete"
        : "app-heavy-row";

  return (
    <div className={cls} style={{ top }}>
      <span className="app-heavy-num">{oldNum ?? ""}</span>
      <span className="app-heavy-num">{newNum ?? ""}</span>
      <span className="app-heavy-sigil">{sigil}</span>
      <span className="app-heavy-text">{row.text}</span>
    </div>
  );
}
