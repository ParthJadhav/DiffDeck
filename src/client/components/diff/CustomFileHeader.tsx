import { useMemo } from "react";
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
          className="app-icon-btn h-7 w-7"
        >
          <ChevronIcon expanded={!collapsed} />
        </button>
        <FileIcon />
        <span
          className="min-w-0 truncate text-sm font-medium text-foreground"
          translate="no"
          title={fileDiff.name}
        >
          {fileDiff.name}
        </span>
        {hasMergeConflicts ? (
          <span className="inline-flex shrink-0 items-center rounded-md bg-warning-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-warning-foreground shadow-[inset_0_0_0_1px_hsl(var(--warning-border)/0.8)]">
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
      className={cn("h-3.5 w-3.5 transition-transform duration-150", expanded && "rotate-90")}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[0.25rem] bg-info-muted text-info-foreground shadow-[inset_0_0_0_1px_hsl(var(--info-border)/0.75)]"
    >
      <span className="h-1.5 w-1.5 rounded-[2px] bg-info" />
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
        "ml-1 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-sans text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        viewed
          ? "border-info-border/80 bg-info-muted text-info-foreground hover:border-info-border hover:bg-info-muted/80"
          : "border-border/70 bg-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
      )}
    >
      <ViewedIcon checked={viewed} />
      <span>Viewed</span>
    </button>
  );
}

function ViewedIcon({ checked }: { checked: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-4 w-4 shrink-0">
      <rect
        x="1.75"
        y="1.75"
        width="12.5"
        height="12.5"
        rx="3.5"
        className={checked ? "fill-info stroke-info" : "stroke-current"}
        strokeWidth="1.6"
      />
      {checked ? (
        <path
          d="M5 8.1l2.05 2.05L11.25 5.8"
          className="stroke-background"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
