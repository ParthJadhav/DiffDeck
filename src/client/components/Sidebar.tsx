import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { FolderTree, List, RefreshCw } from "lucide-react";
import { buildHeader, describeDiffScope } from "../lib/diff.js";
import { cn } from "../lib/cn.js";
import type { FileOrder, FileViewMode, ReviewFilters } from "../lib/reviewSession.js";
import { emptyReviewFilters } from "../lib/reviewSession.js";
import type { DiffFileSummary } from "../types.js";
import { FILE_SEARCH_INPUT_ID, FileList } from "./FileList.js";
import { countActiveFilters, ReviewFiltersBar } from "./ReviewFiltersBar.js";
import { Button } from "./ui/button.js";

type SidebarTab = "files" | "notes";

export const FOCUS_FILE_SEARCH_EVENT = "diffdeck:focus-file-search";

export interface SidebarProps {
  diffArgs: string[];
  fileOrder: FileOrder;
  files: readonly DiffFileSummary[];
  fileViewMode: FileViewMode;
  filters: ReviewFilters;
  /** Focus the file search once mounted (narrow layout opened via `/`). */
  focusSearchOnMount?: boolean;
  footer?: ReactNode;
  /** Icon actions beside refresh: accessible view, settings. */
  headerActions?: ReactNode;
  noteCounts: ReadonlyMap<string, number>;
  notesCount: number;
  notesPanel?: ReactNode;
  onFileOrderChange: (order: FileOrder) => void;
  onFileViewModeChange: (mode: FileViewMode) => void;
  onFiltersChange: (filters: ReviewFilters) => void;
  onRefresh: () => void;
  onSelectPath: (path: string) => void;
  onViewedChange: (path: string, value: boolean) => void;
  refreshing: boolean;
  repoRoot: string;
  selectedPath: string | null;
  staleNotesCount: number;
  totalFileCount: number;
  totals: { additions: number; deletions: number };
  viewedCount: number;
  viewedPaths: ReadonlySet<string>;
}

/**
 * The review's home base, top to bottom in the order a reviewer needs it:
 * what diff this is and how far along the review is; the files (or notes)
 * being worked through; then stepping controls and the agent handoff.
 */
export function Sidebar({
  diffArgs,
  fileOrder,
  files,
  fileViewMode,
  filters,
  focusSearchOnMount = false,
  footer,
  headerActions,
  noteCounts,
  notesCount,
  notesPanel,
  onFileOrderChange,
  onFileViewModeChange,
  onFiltersChange,
  onRefresh,
  onSelectPath,
  onViewedChange,
  refreshing,
  repoRoot,
  selectedPath,
  staleNotesCount,
  totalFileCount,
  totals,
  viewedCount,
  viewedPaths,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("files");
  const tabsId = useId();
  const diffLabel = buildHeader(diffArgs);
  const diffScope = describeDiffScope(diffArgs);
  const repoName = repoRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? repoRoot;
  const safeViewed = Math.min(viewedCount, totalFileCount);
  const progress = totalFileCount === 0 ? 0 : (safeViewed / totalFileCount) * 100;
  const complete = totalFileCount > 0 && safeViewed === totalFileCount;
  const activeFilterCount = countActiveFilters(filters);
  const filtered = files.length !== totalFileCount;

  useEffect(() => {
    // Synchronous on purpose: `/` is handled in keydown, and the very next
    // keystroke must land in the field, not in the global shortcut layer.
    const focusSearch = () => {
      flushSync(() => setTab("files"));
      document.getElementById(FILE_SEARCH_INPUT_ID)?.focus();
    };
    // On mount the Files tab is already showing; no state flush needed.
    if (focusSearchOnMount) document.getElementById(FILE_SEARCH_INPUT_ID)?.focus();
    window.addEventListener(FOCUS_FILE_SEARCH_EVENT, focusSearch);
    return () => window.removeEventListener(FOCUS_FILE_SEARCH_EVENT, focusSearch);
  }, [focusSearchOnMount]);

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: SidebarTab = tab === "files" ? "notes" : "files";
    setTab(next);
    document.getElementById(`${tabsId}-${next}-tab`)?.focus();
  };

  const toolbarEnd = (
    <>
      <div
        className="app-segmented flex shrink-0 rounded-md p-0.5"
        role="group"
        aria-label="File view"
      >
        <ViewModeButton
          active={fileViewMode === "tree"}
          label="Tree file view"
          onClick={() => onFileViewModeChange("tree")}
          title="Folders"
        >
          <FolderTree />
        </ViewModeButton>
        <ViewModeButton
          active={fileViewMode === "list"}
          label="Flat file view"
          onClick={() => onFileViewModeChange("list")}
          title="Flat list"
        >
          <List />
        </ViewModeButton>
      </div>
      <ReviewFiltersBar
        fileOrder={fileOrder}
        filters={filters}
        onChange={onFiltersChange}
        onFileOrderChange={onFileOrderChange}
        resultCount={files.length}
        totalCount={totalFileCount}
      />
    </>
  );

  const filterNotice =
    activeFilterCount > 0 ? (
      <div className="app-filter-notice mx-2 mb-1.5 flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-[11px]">
        <span className="min-w-0 flex-1 truncate">
          Showing <span className="font-mono tabular-nums">{files.length}</span> of{" "}
          <span className="font-mono tabular-nums">{totalFileCount}</span> · {activeFilterCount}{" "}
          {activeFilterCount === 1 ? "filter" : "filters"}
        </span>
        <button
          type="button"
          onClick={() => onFiltersChange({ ...emptyReviewFilters })}
          className="shrink-0 rounded px-1 font-medium text-info-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear
        </button>
      </div>
    ) : null;

  const emptyState = (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          {totalFileCount === 0 ? "Nothing to diff" : "No files match"}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {totalFileCount === 0 ? (
            <>
              The working tree is clean, or your{" "}
              <code className="font-mono" translate="no">
                git diff
              </code>{" "}
              arguments returned no files.
            </>
          ) : (
            "Adjust or clear the active review filters."
          )}
        </p>
      </div>
    </div>
  );

  return (
    <aside
      aria-label="Changed files and review controls"
      className="app-sidebar flex h-full min-h-0 flex-col overflow-hidden"
    >
      <header className="app-sidebar-header shrink-0 px-3 pb-3 pt-2">
        <div className="flex h-7 items-center gap-0.5">
          <h2
            className="app-sidebar-repo min-w-12 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground"
            title={repoRoot}
          >
            {repoName}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing diff" : "Refresh diff"}
            title={refreshing ? "Refreshing diff" : "Refresh diff"}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
          {headerActions}
        </div>
        <p
          className="truncate text-[11px] leading-4 text-muted-foreground"
          title={diffScope == null ? diffLabel : `${diffLabel} — ${diffScope}`}
        >
          <span className="font-mono" translate="no">
            {diffLabel}
          </span>
          {diffScope != null ? <span> · {diffScope}</span> : null}
        </p>
        <div className="mt-2.5 flex items-baseline gap-2 text-[11px] leading-none">
          <span className={cn("min-w-0 flex-1 truncate", complete && "text-diff-added")}>
            {complete ? (
              <span className="font-medium">All {totalFileCount} files viewed</span>
            ) : (
              <>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {safeViewed}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  of {totalFileCount} {totalFileCount === 1 ? "file" : "files"} viewed
                </span>
              </>
            )}
          </span>
          <span className="app-sidebar-totals shrink-0 font-mono tabular-nums">
            <span className="text-diff-added" title={`${totals.additions} additions`}>
              +{totals.additions.toLocaleString()}
            </span>{" "}
            <span className="text-diff-deleted" title={`${totals.deletions} deletions`}>
              −{totals.deletions.toLocaleString()}
            </span>
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${safeViewed} of ${totalFileCount} files viewed`}
          aria-valuemin={0}
          aria-valuemax={totalFileCount}
          aria-valuenow={safeViewed}
          className="app-review-progress mt-2 h-1 overflow-hidden rounded-full"
          data-complete={complete || undefined}
        >
          <span className="block h-full rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Sidebar sections"
        className="app-sidebar-tabs flex h-9 shrink-0 items-stretch gap-4 px-3 text-[12px] font-medium"
        onKeyDown={handleTabKeyDown}
      >
        <SidebarTabButton id={tabsId} tab="files" selected={tab === "files"} onSelect={setTab}>
          Files
          <span className="app-tab-count">
            {filtered ? `${files.length}/${totalFileCount}` : totalFileCount}
          </span>
        </SidebarTabButton>
        <SidebarTabButton id={tabsId} tab="notes" selected={tab === "notes"} onSelect={setTab}>
          Notes
          <span className="app-tab-count">{notesCount}</span>
          {staleNotesCount > 0 ? (
            <span
              className="size-1.5 rounded-full bg-warning"
              title={`${staleNotesCount} stale`}
              aria-label={`${staleNotesCount} stale`}
              role="img"
            />
          ) : null}
        </SidebarTabButton>
      </div>

      {/* Both panels stay laid out so the file list keeps its scroll position
          and virtualized measurements while Notes is open. */}
      <div className="relative min-h-0 flex-1">
        <div
          role="tabpanel"
          id={`${tabsId}-files-panel`}
          aria-labelledby={`${tabsId}-files-tab`}
          aria-hidden={tab !== "files" || undefined}
          className={cn("absolute inset-0", tab !== "files" && "invisible")}
        >
          <FileList
            banner={filterNotice}
            emptyState={emptyState}
            fileOrder={fileOrder}
            files={files}
            mode={fileViewMode}
            noteCounts={noteCounts}
            onSelectPath={onSelectPath}
            onViewedChange={onViewedChange}
            selectedPath={selectedPath}
            toolbarEnd={toolbarEnd}
            viewedPaths={viewedPaths}
          />
        </div>
        <div
          role="tabpanel"
          id={`${tabsId}-notes-panel`}
          aria-labelledby={`${tabsId}-notes-tab`}
          aria-hidden={tab !== "notes" || undefined}
          className={cn("absolute inset-0", tab !== "notes" && "invisible")}
        >
          {notesPanel}
        </div>
      </div>

      {footer != null ? (
        <div className="app-sidebar-footer flex shrink-0 flex-col gap-1.5 p-2">{footer}</div>
      ) : null}
    </aside>
  );
}

function SidebarTabButton({
  children,
  id,
  onSelect,
  selected,
  tab,
}: {
  children: ReactNode;
  id: string;
  onSelect: (tab: SidebarTab) => void;
  selected: boolean;
  tab: SidebarTab;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`${id}-${tab}-tab`}
      aria-controls={`${id}-${tab}-panel`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(tab)}
      className="app-sidebar-tab flex items-center gap-1.5"
    >
      {children}
    </button>
  );
}

function ViewModeButton({
  active,
  children,
  label,
  onClick,
  title,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className="app-segmented-item grid size-6 place-items-center rounded [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}
