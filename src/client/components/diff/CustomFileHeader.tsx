import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { cn } from "../../lib/cn.js";

export function CustomFileHeader({
  collapsed,
  fileDiff,
  hasMergeConflicts = false,
  onCollapsedChange,
  onViewedChange,
  viewed,
}: {
  collapsed: boolean;
  fileDiff: FileDiffMetadata;
  hasMergeConflicts?: boolean;
  onCollapsedChange: (next: boolean) => void;
  onViewedChange: (next: boolean) => void;
  viewed: boolean;
}) {
  const counts = useMemo(
    () =>
      fileDiff.hunks.reduce(
        (total, hunk) => ({
          additions: total.additions + hunk.additionLines,
          deletions: total.deletions + hunk.deletionLines,
        }),
        { additions: 0, deletions: 0 },
      ),
    [fileDiff.hunks],
  );

  return (
    <div
      className={cn(
        "app-file-header flex w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5",
        !collapsed && "app-file-header-open",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label={collapsed ? `Expand ${fileDiff.name}` : `Collapse ${fileDiff.name}`}
          aria-pressed={collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
          className="app-icon-btn size-7"
        >
          <ChevronIcon expanded={!collapsed} />
        </button>
        <FileIcon />
        <PathLabel path={fileDiff.name} />
        {hasMergeConflicts ? (
          <span className="inline-flex shrink-0 items-center rounded-md bg-warning-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-warning-foreground shadow-[inset_0_0_0_1px_oklch(var(--warning-border)/0.8)]">
            Conflict
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums">
        {counts.deletions > 0 || counts.additions === 0 ? (
          <span className="text-diff-deleted">-{counts.deletions}</span>
        ) : null}
        {counts.additions > 0 || counts.deletions === 0 ? (
          <span className="text-diff-added">+{counts.additions}</span>
        ) : null}
        <ViewedButton
          filePath={fileDiff.name}
          viewed={viewed}
          onClick={() => onViewedChange(!viewed)}
        />
      </div>
    </div>
  );
}

type PathToken =
  | {
      key: string;
      kind: "ellipsis";
      label: string;
    }
  | {
      key: string;
      kind: "segment";
      label: string;
      role: "leaf" | "parent" | "root";
    };

function segmentRole(index: number, count: number): "leaf" | "parent" | "root" {
  if (index === count - 1) return "leaf";
  if (index === 0) return "root";
  return "parent";
}

function buildVariants(segments: string[]): PathToken[][] {
  const n = segments.length;
  if (n === 0) return [[]];
  if (n === 1) {
    return [[{ key: `leaf:${segments[0]}`, kind: "segment", label: segments[0]!, role: "leaf" }]];
  }

  const variants: PathToken[][] = [];

  variants.push(
    segments.map((segment, index) => ({
      key: `full:${segments.slice(0, index + 1).join("/")}`,
      kind: "segment",
      label: segment,
      role: segmentRole(index, n),
    })),
  );

  for (let kept = n - 2; kept >= 1; kept--) {
    const tokens: PathToken[] = [
      { key: `root:${segments[0]}`, kind: "segment", label: segments[0]!, role: "root" },
      { key: `ellipsis:${kept}`, kind: "ellipsis", label: "..." },
    ];
    for (let i = n - kept; i < n; i++) {
      tokens.push({
        key: `tail:${kept}:${segments.slice(0, i + 1).join("/")}`,
        kind: "segment",
        label: segments[i]!,
        role: i === n - 1 ? "leaf" : "parent",
      });
    }
    variants.push(tokens);
  }

  variants.push([
    { key: "ellipsis:leaf", kind: "ellipsis", label: "..." },
    { key: `leaf:${segments.join("/")}`, kind: "segment", label: segments[n - 1]!, role: "leaf" },
  ]);
  variants.push([
    {
      key: `leaf-only:${segments.join("/")}`,
      kind: "segment",
      label: segments[n - 1]!,
      role: "leaf",
    },
  ]);

  return variants;
}

let measureCanvas: HTMLCanvasElement | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  return measureCanvas.getContext("2d");
}

function getCanvasFont(el: Element): string {
  const s = getComputedStyle(el);
  return `${s.fontStyle} ${s.fontVariant} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
}

function measureVariant(
  tokens: PathToken[],
  ctx: CanvasRenderingContext2D,
  separatorPaddingPx: number,
): number {
  let width = 0;
  const slashWidth = ctx.measureText("/").width;
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) width += slashWidth + separatorPaddingPx * 2;
    width += ctx.measureText(tokens[i]!.label).width;
  }
  return width;
}

function getAvailableWidth(el: HTMLElement): number {
  const parent = el.parentElement;
  if (!parent) return Number.POSITIVE_INFINITY;
  const style = getComputedStyle(parent);
  const padding = parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
  const gap = parseFloat(style.columnGap || style.gap || "0");
  const children = Array.from(parent.children) as HTMLElement[];
  const visible = children.filter((c) => getComputedStyle(c).display !== "none");
  let used = 0;
  for (const child of visible) {
    if (child === el) continue;
    used += child.getBoundingClientRect().width;
  }
  const totalGaps = Math.max(0, visible.length - 1);
  return Math.max(0, parent.clientWidth - padding - used - totalGaps * gap);
}

function PathLabel({ path }: { path: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const segments = useMemo(() => path.split("/").filter(Boolean), [path]);
  const variants = useMemo(() => buildVariants(segments), [segments]);
  const [variantIndex, setVariantIndex] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const ctx = getMeasureCtx();
    if (!ctx) return;

    const update = () => {
      ctx.font = getCanvasFont(el);
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const separatorPaddingPx = rootFontSize * 0.35;
      const available = getAvailableWidth(el);
      let chosen = variants.length - 1;
      for (let i = 0; i < variants.length; i++) {
        const width = measureVariant(variants[i]!, ctx, separatorPaddingPx);
        if (width <= available) {
          chosen = i;
          break;
        }
      }
      setVariantIndex((prev) => (prev === chosen ? prev : chosen));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [variants]);

  const tokens = variants[Math.min(variantIndex, variants.length - 1)] ?? [];

  return (
    <span
      ref={containerRef}
      className="app-path-label text-sm font-medium text-foreground"
      translate="no"
      title={path}
    >
      {tokens.map((token, index) => {
        const className =
          token.kind === "ellipsis"
            ? "app-path-ellipsis"
            : `app-path-segment app-path-segment-${token.role}`;
        return (
          <span className={className} key={token.key}>
            {index > 0 ? <span className="app-path-separator">/</span> : null}
            <span className="app-path-token">{token.label}</span>
          </span>
        );
      })}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-3.5 transition-transform duration-150 ease-out", expanded && "rotate-90")}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] bg-info-muted text-info-foreground shadow-[inset_0_0_0_1px_oklch(var(--info-border)/0.75)]"
    >
      <span className="size-1.5 rounded-[2px] bg-info" />
    </span>
  );
}

function ViewedButton({
  filePath,
  onClick,
  viewed,
}: {
  filePath: string;
  onClick: () => void;
  viewed: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={viewed ? `Mark ${filePath} unviewed` : `Mark ${filePath} viewed`}
      aria-pressed={viewed}
      onClick={onClick}
      className={cn(
        "app-viewed-button ml-1 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-sans text-xs font-medium transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        viewed
          ? "bg-info-muted text-info-foreground shadow-[inset_0_0_0_1px_oklch(var(--info-border)/0.8)] hover:bg-info-muted/80 hover:shadow-[inset_0_0_0_1px_oklch(var(--info-border))]"
          : "bg-transparent text-muted-foreground shadow-[inset_0_0_0_1px_oklch(var(--border)/0.7)] hover:bg-accent hover:text-foreground hover:shadow-[inset_0_0_0_1px_oklch(var(--border))]",
      )}
    >
      <ViewedIcon checked={viewed} />
      <span>Viewed</span>
    </button>
  );
}

function ViewedIcon({ checked }: { checked: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0">
      <rect
        x="1.75"
        y="1.75"
        width="12.5"
        height="12.5"
        rx="3.5"
        className={checked ? "fill-info stroke-info" : "stroke-current"}
        strokeWidth="1.6"
      />
      <path
        d="M5 8.1l2.05 2.05L11.25 5.8"
        className={cn("app-viewed-check stroke-background", checked && "app-viewed-check-visible")}
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
