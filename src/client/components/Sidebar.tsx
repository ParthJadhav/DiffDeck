import { type ReactNode, useEffect, useRef } from "react";
import { FileTree } from "@pierre/trees/react";
import type { FileTree as TreeModel } from "@pierre/trees";
import { buildHeader } from "../lib/diff.js";
import { cn } from "../lib/cn.js";
import { Button } from "./ui/button.js";

export interface SidebarProps {
  diffArgs: string[];
  fileCount: number;
  footer?: ReactNode;
  onRefresh: () => void;
  refreshing: boolean;
  totals: { additions: number; deletions: number };
  treeModel: TreeModel;
}

export function Sidebar({
  diffArgs,
  fileCount,
  footer,
  onRefresh,
  refreshing,
  totals,
  treeModel,
}: SidebarProps) {
  const headerLabel = buildHeader(diffArgs);
  const treeHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = treeHostRef.current;
    if (root == null) return;

    let shadowObserver: MutationObserver | null = null;
    const patchTreeInternals = () => {
      const shadowRoot = root.querySelector("file-tree-container")?.shadowRoot;
      if (shadowRoot != null && shadowObserver == null) {
        shadowObserver = new MutationObserver(patchTreeInternals);
        shadowObserver.observe(shadowRoot, { childList: true, subtree: true });
      }

      const input = shadowRoot?.querySelector<HTMLInputElement>("[data-file-tree-search-input]");
      if (input != null) {
        input.id = "diffdeck-file-search";
        input.name = "diffdeck-file-search";
        input.setAttribute("aria-label", "Search files");
      }

      if (shadowRoot != null) {
        patchFlattenedPathLabels(shadowRoot);
      }
    };

    patchTreeInternals();
    const observer = new MutationObserver(patchTreeInternals);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      shadowObserver?.disconnect();
    };
  }, [treeModel]);

  return (
    <aside className="app-sidebar flex h-full min-h-0 flex-col overflow-hidden shadow-[inset_0_-1px_0_oklch(var(--border)/0.7)] lg:shadow-none">
      <div className="app-sidebar-header flex h-11 items-center gap-1 px-3">
        <span className="font-mono text-[12px] font-semibold text-foreground">Diffdeck</span>
        <CountBadge
          className="ml-auto"
          title={headerLabel}
          ariaLabel={`${fileCount} ${fileCount === 1 ? "file" : "files"} in diff`}
        >
          <span>{fileCount}</span>
          <span className="app-file-count-label ml-1">{fileCount === 1 ? "file" : "files"}</span>
        </CountBadge>
        <CountBadge tone="added" ariaLabel={`${totals.additions} additions`}>
          +{totals.additions}
        </CountBadge>
        <CountBadge tone="deleted" ariaLabel={`${totals.deletions} deletions`}>
          −{totals.deletions}
        </CountBadge>
        <Button
          variant="ghost"
          size="icon"
          className="app-sidebar-refresh-button shrink-0 rounded-[6px] text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={refreshing ? "Refreshing diff" : "Refresh diff"}
          title={refreshing ? "Refreshing diff" : "Refresh diff"}
        >
          <RefreshIcon className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>

      <div ref={treeHostRef} className="min-h-0 flex-1 overflow-hidden">
        {fileCount === 0 ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Nothing to diff</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The working tree is clean — or your{" "}
                <code className="font-mono" translate="no">
                  git diff
                </code>{" "}
                arguments returned no files.
              </p>
            </div>
          </div>
        ) : (
          <FileTree
            model={treeModel}
            className="app-file-tree h-full w-full overflow-hidden pt-1.5"
            style={{ height: "100%" }}
          />
        )}
      </div>
      {footer != null ? <div className="app-sidebar-footer px-3 py-2">{footer}</div> : null}
    </aside>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 3.5v3h-3" />
      <path d="M2.8 6.7a5 5 0 0 1 8.4-2.4l2.3 2.2" />
      <path d="M2.5 12.5v-3h3" />
      <path d="M13.2 9.3a5 5 0 0 1-8.4 2.4L2.5 9.5" />
    </svg>
  );
}

function CountBadge({
  ariaLabel,
  children,
  className,
  title,
  tone,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  title?: string;
  tone?: "added" | "deleted";
}) {
  return (
    <span
      className={cn(
        "app-count-badge inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-1.5 text-[11px] font-medium leading-none tabular-nums",
        tone === "added" && "app-count-badge--added",
        tone === "deleted" && "app-count-badge--deleted",
        className,
      )}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  );
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
