import { type ReactNode } from "react";
import { FileTree } from "@pierre/trees/react";
import type { FileTree as TreeModel } from "@pierre/trees";
import { buildHeader } from "../lib/diff.js";

export interface SidebarProps {
  diffArgs: string[];
  fileCount: number;
  footer?: ReactNode;
  treeModel: TreeModel;
}

export function Sidebar({ diffArgs, fileCount, footer, treeModel }: SidebarProps) {
  const headerLabel = buildHeader(diffArgs);

  return (
    <aside className="app-sidebar flex h-full min-h-0 flex-col overflow-hidden shadow-[inset_0_-1px_0_hsl(var(--border)/0.6)] lg:shadow-[inset_-1px_0_0_hsl(var(--border)/0.6)]">
      <div className="flex h-11 items-center gap-2 px-3 shadow-[inset_0_-1px_0_hsl(var(--border)/0.45)]">
        <span className="font-mono text-[12px] font-semibold tracking-tight text-foreground">
          cli-diff
        </span>
        <span
          className="ml-auto inline-flex h-5 items-center rounded-full bg-muted/55 px-2 text-[11px] font-medium tabular-nums text-muted-foreground"
          title={headerLabel}
          aria-label={`${fileCount} ${fileCount === 1 ? "file" : "files"} in diff`}
        >
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
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
            className="app-file-tree h-full w-full overflow-hidden"
            style={{ height: "100%" }}
          />
        )}
      </div>
      {footer != null ? (
        <div className="px-3 py-2 shadow-[inset_0_1px_0_hsl(var(--border)/0.6)]">{footer}</div>
      ) : null}
    </aside>
  );
}
