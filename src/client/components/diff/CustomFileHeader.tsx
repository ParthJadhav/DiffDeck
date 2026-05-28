import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { CheckSquare2, ChevronRight, FileText, Square } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";

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
        "app-file-header flex w-full min-w-0 flex-wrap items-center justify-between gap-x-2.5 gap-y-1 px-2.5 py-1",
        !collapsed && "app-file-header-open",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? `Expand ${fileDiff.name}` : `Collapse ${fileDiff.name}`}
          aria-pressed={collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
          className="h-7 w-7 text-muted-foreground"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform duration-150 ease-out",
              !collapsed && "rotate-90",
            )}
          />
        </Button>
        <FileIcon />
        <PathLabel path={fileDiff.name} />
        {hasMergeConflicts ? (
          <Badge variant="warning" className="shrink-0 text-[10px] uppercase">
            Conflict
          </Badge>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] leading-none tabular-nums">
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
      className="app-path-label text-[13px] font-medium text-foreground"
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

function FileIcon() {
  return (
    <Badge
      aria-hidden="true"
      variant="outline"
      className="h-5 shrink-0 border-info-border/75 bg-info-muted px-1 text-info-foreground"
    >
      <FileText className="size-3" />
    </Badge>
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
    <Button
      variant={viewed ? "secondary" : "outline"}
      size="sm"
      aria-label={viewed ? `Mark ${filePath} unviewed` : `Mark ${filePath} viewed`}
      aria-pressed={viewed}
      onClick={onClick}
      className={cn(
        "app-viewed-button ml-1 h-7 gap-1.5 px-2 font-sans text-[11.5px] leading-none",
        viewed
          ? "border-info-border/80 bg-info-muted text-info-foreground hover:bg-info-muted/80"
          : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <ViewedIcon checked={viewed} />
      <span>Viewed</span>
    </Button>
  );
}

function ViewedIcon({ checked }: { checked: boolean }) {
  const Icon = checked ? CheckSquare2 : Square;
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />;
}
