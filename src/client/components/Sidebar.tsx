import { type ReactNode, useEffect, useRef } from "react";
import { FileTree } from "@pierre/trees/react";
import type { FileTree as TreeModel } from "@pierre/trees";
import { FolderTree, List, RefreshCw } from "lucide-react";
import { buildHeader } from "../lib/diff.js";
import { cn } from "../lib/cn.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { FlatFileList } from "./FlatFileList.js";
import type { DiffFileSummary } from "../types.js";
import type { FileOrder, FileViewMode } from "../lib/reviewSession.js";

export interface SidebarProps {
  diffArgs: string[];
  fileOrder: FileOrder;
  fileCount: number;
  files: readonly DiffFileSummary[];
  fileViewMode: FileViewMode;
  footer?: ReactNode;
  onFileOrderChange: (order: FileOrder) => void;
  onFileViewModeChange: (mode: FileViewMode) => void;
  onRefresh: () => void;
  onSelectPath: (path: string) => void;
  refreshing: boolean;
  selectedPath: string | null;
  totalFileCount: number;
  totals: { additions: number; deletions: number };
  treeModel: TreeModel;
  viewedCount: number;
  viewedPaths: ReadonlySet<string>;
}

export function Sidebar({
  diffArgs,
  fileOrder,
  fileCount,
  files,
  fileViewMode,
  footer,
  onFileOrderChange,
  onFileViewModeChange,
  onRefresh,
  onSelectPath,
  refreshing,
  selectedPath,
  totalFileCount,
  totals,
  treeModel,
  viewedCount,
  viewedPaths,
}: SidebarProps) {
  const headerLabel = buildHeader(diffArgs);
  const treeHostRef = useRef<HTMLDivElement | null>(null);
  const safeViewedCount = Math.min(viewedCount, fileCount);
  const reviewProgress = fileCount === 0 ? 0 : (safeViewedCount / fileCount) * 100;

  useEffect(() => {
    const root = treeHostRef.current;
    if (root == null) return;

    let disconnectShadowObserver: (() => void) | null = null;
    const patchTreeInternals = () => {
      const shadowRoot = root.querySelector("file-tree-container")?.shadowRoot;
      if (shadowRoot != null && disconnectShadowObserver == null) {
        disconnectShadowObserver = observeMutations(shadowRoot, patchTreeInternals);
      }

      const input = shadowRoot?.querySelector<HTMLInputElement>("[data-file-tree-search-input]");
      if (input != null) {
        input.id = "diffdeck-file-search";
        input.name = "diffdeck-file-search";
        input.setAttribute("aria-label", "Search files");

        const tree = shadowRoot?.querySelector<HTMLElement>("[role='tree']");
        const searchContainer = input.closest<HTMLElement>("[data-file-tree-search-container]");
        if (tree != null && searchContainer != null && tree.contains(searchContainer)) {
          tree.parentElement?.insertBefore(searchContainer, tree);
        }
      }

      if (shadowRoot != null) {
        patchFlattenedPathLabels(shadowRoot);
      }
    };

    patchTreeInternals();
    const disconnectRootObserver = observeMutations(root, patchTreeInternals);
    return () => {
      disconnectRootObserver();
      disconnectShadowObserver?.();
    };
  }, [treeModel]);

  return (
    <aside
      aria-label="Changed files and review controls"
      className="app-sidebar flex h-full min-h-0 flex-col overflow-hidden shadow-[inset_0_-1px_0_oklch(var(--border)/0.7)] lg:shadow-none"
    >
      <div className="app-sidebar-header flex h-10 items-center gap-1 px-3">
        <span className="font-mono text-[12px] font-semibold text-foreground">Diffdeck</span>
        <Badge
          variant="secondary"
          className="ml-auto h-5 px-1.5 text-[11px] leading-none"
          title={headerLabel}
          aria-label={`${fileCount} ${fileCount === 1 ? "file" : "files"} in diff`}
        >
          <span>{fileCount}</span>
          <span className="app-file-count-label ml-1">{fileCount === 1 ? "file" : "files"}</span>
        </Badge>
        <Badge
          variant="success"
          className="h-5 px-1.5 text-[11px] leading-none"
          aria-label={`${totals.additions} additions`}
        >
          +{totals.additions}
        </Badge>
        <Badge
          variant="outline"
          className="h-5 border-diff-deleted/40 bg-transparent px-1.5 text-[11px] leading-none text-diff-deleted"
          aria-label={`${totals.deletions} deletions`}
        >
          −{totals.deletions}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="app-sidebar-refresh-button size-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={refreshing ? "Refreshing diff" : "Refresh diff"}
          title={refreshing ? "Refreshing diff" : "Refresh diff"}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
        </Button>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/70 px-2">
        <div className="flex rounded-md border border-border bg-muted p-0.5" aria-label="File view">
          <button
            type="button"
            aria-label="Tree file view"
            aria-pressed={fileViewMode === "tree"}
            title="Tree view"
            onClick={() => onFileViewModeChange("tree")}
            className={cn(
              "grid size-6 place-items-center rounded text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              fileViewMode === "tree" && "bg-background text-foreground shadow-sm",
            )}
          >
            <FolderTree aria-hidden="true" className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Flat file view"
            aria-pressed={fileViewMode === "list"}
            title="Flat list view"
            onClick={() => onFileViewModeChange("list")}
            className={cn(
              "grid size-6 place-items-center rounded text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              fileViewMode === "list" && "bg-background text-foreground shadow-sm",
            )}
          >
            <List aria-hidden="true" className="size-3.5" />
          </button>
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="sr-only">Review file order</span>
          <select
            aria-label="Review file order"
            value={fileOrder}
            onChange={(event) => onFileOrderChange(event.target.value as FileOrder)}
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="path">Order: Path</option>
            <option value="status">Order: Status</option>
            <option value="size">Order: Change size</option>
          </select>
        </label>
      </div>

      <div ref={treeHostRef} className="min-h-0 flex-1 overflow-hidden">
        {fileCount === 0 ? (
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
        ) : fileViewMode === "list" ? (
          <FlatFileList
            files={files}
            onSelectPath={onSelectPath}
            selectedPath={selectedPath}
            viewedPaths={viewedPaths}
          />
        ) : (
          <FileTree
            model={treeModel}
            className="app-file-tree h-full w-full overflow-hidden pt-1.5"
            style={{ height: "100%" }}
          />
        )}
      </div>
      {fileCount > 0 ? (
        <div
          className="app-sidebar-review-status px-3 py-2"
          aria-label={`${safeViewedCount} of ${fileCount} files viewed`}
        >
          <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
            <span className="font-medium text-muted-foreground">Review</span>
            <span className="font-mono text-foreground tabular-nums">
              {safeViewedCount}/{fileCount}
            </span>
          </div>
          <div className="app-review-progress mt-1.5 h-1 overflow-hidden rounded-full">
            <span className="block h-full rounded-full" style={{ width: `${reviewProgress}%` }} />
          </div>
        </div>
      ) : null}
      {footer != null ? <div className="app-sidebar-footer px-3 py-2.5">{footer}</div> : null}
    </aside>
  );
}

function observeMutations(target: Node, callback: MutationCallback): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function patchFlattenedPathLabels(root: ShadowRoot) {
  for (const container of root.querySelectorAll<HTMLElement>("[data-item-flattened-subitems]")) {
    const segments = container.querySelectorAll<HTMLElement>("[data-item-flattened-subitem]");
    if (segments.length === 0) {
      continue;
    }

    const basenames: string[] = [];
    for (const segment of segments) basenames.push(basenameFromSegment(segment));

    const compact = segments.length > 3;
    const lastIndex = segments.length - 1;

    container.dataset.diffdeckCompactPath = "true";
    container.title = basenames.join(" / ");

    let visiblePosition = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      const isVisible = !compact || index === 0 || index === lastIndex - 1 || index === lastIndex;
      segment.toggleAttribute("data-diffdeck-compact-segment", isVisible);

      if (!isVisible) {
        segment.removeAttribute("data-diffdeck-prefix");
        segment.removeAttribute("data-diffdeck-segment-role");
        segment.removeAttribute("data-diffdeck-label");
        continue;
      }

      segment.dataset.diffdeckPrefix = prefixFor(visiblePosition, compact);
      segment.dataset.diffdeckSegmentRole =
        index === 0 ? "root" : index === lastIndex ? "leaf" : "parent";
      segment.dataset.diffdeckLabel = basenames[index]!;
      visiblePosition += 1;
    }
  }
}

function prefixFor(visiblePosition: number, compact: boolean): string {
  if (visiblePosition === 0) return "";
  if (compact && visiblePosition === 1) return " / ... / ";
  return " / ";
}

function basenameFromSegment(element: HTMLElement) {
  const path = element.getAttribute("data-item-flattened-subitem") ?? "";
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}
