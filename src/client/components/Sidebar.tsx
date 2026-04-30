import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FileTree, useFileTreeSelection } from "@pierre/trees/react";
import type { FileTree as TreeModel } from "@pierre/trees";
import { createPortal } from "react-dom";
import { buildHeader } from "../lib/diff.js";

export interface SidebarProps {
  diffArgs: string[];
  fileCount: number;
  footer?: ReactNode;
  onCopyPath: (path: string) => void;
  onRevealPath: (path: string) => void;
  onViewedPathChange: (path: string, value: boolean) => void;
  treeModel: TreeModel;
  viewedPaths: ReadonlySet<string>;
}

export function Sidebar({
  diffArgs,
  fileCount,
  footer,
  onCopyPath,
  onRevealPath,
  onViewedPathChange,
  treeModel,
  viewedPaths,
}: SidebarProps) {
  const selectedPaths = useFileTreeSelection(treeModel);

  const headerLabel = buildHeader(diffArgs);

  return (
    <aside className="app-sidebar flex min-h-0 flex-col overflow-hidden border-r border-border/60">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <span className="text-[13px] font-semibold tracking-tight text-foreground">
          cli-diff
        </span>
        <span
          className="app-chip ml-auto tabular-nums"
          title={headerLabel}
          aria-label={`${fileCount} ${fileCount === 1 ? "file" : "files"} in diff`}
        >
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </span>
      </div>

      {selectedPaths.length > 0 ? (
        <div className="px-4 pb-2 text-[11px] tabular-nums text-muted-foreground">
          {selectedPaths.length} selected
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {fileCount === 0 ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                Nothing to diff
              </p>
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
            className="app-file-tree h-full w-full overflow-hidden"
            renderContextMenu={(item, context) =>
              createPortal(
                <ContextMenu
                  anchorRect={context.anchorRect}
                  onClose={context.close}
                  items={[
                    {
                      label: "Reveal Diff",
                      onSelect: () => onRevealPath(item.path),
                    },
                    {
                      label: viewedPaths.has(item.path)
                        ? "Mark Unviewed"
                        : "Mark Viewed",
                      onSelect: () =>
                        onViewedPathChange(
                          item.path,
                          !viewedPaths.has(item.path),
                        ),
                    },
                    {
                      label: "Focus Row",
                      onSelect: () => treeModel.focusPath(item.path),
                    },
                    {
                      label: "Copy Path",
                      onSelect: () => onCopyPath(item.path),
                    },
                  ]}
                />,
                document.body,
              )
            }
            style={{ height: "100%" }}
          />
        )}
      </div>
      {footer != null ? (
        <div className="border-t border-border/60 px-3 py-2">{footer}</div>
      ) : null}
    </aside>
  );
}

interface ContextMenuItem {
  label: string;
  onSelect: () => void;
}

function ContextMenu({
  anchorRect,
  items,
  onClose,
}: {
  anchorRect: { top: number; right: number; bottom: number; left: number };
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>(
    () => ({
      top: anchorRect.bottom + 4,
      left: Math.max(8, anchorRect.right - 180),
    }),
  );

  useLayoutEffect(() => {
    const node = ref.current;
    if (node == null) return;
    const rect = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(
      Math.max(8, anchorRect.right - rect.width),
      vw - rect.width - 8,
    );
    const top = Math.min(anchorRect.bottom + 4, vh - rect.height - 8);
    setPosition({ top, left });
    const first = node.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, [anchorRect.bottom, anchorRect.right]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current != null && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (node == null) return;
    const buttons = Array.from(
      node.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const activeIndex = buttons.findIndex((b) => b === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = buttons[(activeIndex + 1) % buttons.length];
      next?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = buttons[(activeIndex - 1 + buttons.length) % buttons.length];
      prev?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="File actions"
      data-file-tree-context-menu-root="true"
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        overscrollBehavior: "contain",
      }}
      className="z-50 flex min-w-[180px] flex-col gap-0.5 rounded-lg border bg-popover p-1 shadow-md ring-1 ring-black/5"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className="inline-flex h-8 items-center justify-start rounded-md px-2 text-xs text-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
