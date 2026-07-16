import { useMemo, useState } from "react";
import { Check, FileCode2, Search } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { cn } from "../lib/cn.js";
import type { DiffFileSummary } from "../types.js";

export function FlatFileList({
  files,
  onSelectPath,
  selectedPath,
  viewedPaths,
}: {
  files: readonly DiffFileSummary[];
  onSelectPath: (path: string) => void;
  selectedPath: string | null;
  viewedPaths: ReadonlySet<string>;
}) {
  const [query, setQuery] = useState("");
  const matchingFiles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized.length === 0
      ? files
      : files.filter((file) => file.path.toLocaleLowerCase().includes(normalized));
  }, [files, query]);

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Changed files list">
      <label className="mx-2 mb-1.5 mt-1.5 flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-2 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
        <Search aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="sr-only">Search files</span>
        <input
          aria-label="Search files"
          autoComplete="off"
          name="diffdeck-file-list-search"
          placeholder="Search files…"
          spellCheck={false}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query.length > 0 ? (
          <span className="font-mono text-[10px] tabular-nums" aria-live="polite">
            {matchingFiles.length}
          </span>
        ) : null}
      </label>
      {matchingFiles.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center px-5 text-center">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">No matching files</p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Try a filename, folder, or extension.
            </p>
          </div>
        </div>
      ) : (
        <Virtuoso
          data={matchingFiles}
          className="min-h-0 flex-1"
          increaseViewportBy={160}
          itemContent={(_index, file) => {
            const selected = file.path === selectedPath;
            const viewed = viewedPaths.has(file.path);
            const { basename, directory } = splitPath(file.path);
            return (
              <div className="px-2 py-0.5">
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  aria-label={`${file.path}, ${file.gitStatus}, ${file.additions} additions, ${file.deletions} deletions${viewed ? ", viewed" : ""}`}
                  onClick={() => onSelectPath(file.path)}
                  className={cn(
                    "group flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left transition-[background-color,color,scale] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
                    selected ? "bg-accent text-foreground" : "hover:bg-accent/70",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded font-mono text-[10px] font-semibold",
                      statusClass(file),
                    )}
                  >
                    {statusLetter(file)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-1">
                      <FileCode2
                        aria-hidden="true"
                        className="size-3 shrink-0 text-muted-foreground"
                      />
                      <span className="truncate text-[11.5px] font-medium">{basename}</span>
                    </span>
                    <span className="block truncate pl-4 text-[10px] text-muted-foreground">
                      {directory || "Repository root"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-[9.5px] tabular-nums">
                    <span className="text-diff-added">+{file.additions}</span>
                    <span className="ml-1 text-diff-deleted">−{file.deletions}</span>
                  </span>
                  {viewed ? (
                    <Check
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                  ) : null}
                </button>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}

function splitPath(path: string): { basename: string; directory: string } {
  const separator = path.lastIndexOf("/");
  return separator === -1
    ? { basename: path, directory: "" }
    : { basename: path.slice(separator + 1), directory: path.slice(0, separator) };
}

function statusLetter(file: DiffFileSummary): string {
  const labels: Record<string, string> = {
    added: "A",
    copied: "C",
    deleted: "D",
    ignored: "I",
    modified: "M",
    renamed: "R",
    untracked: "?",
  };
  return file.hasMergeConflicts ? "!" : (labels[file.gitStatus] ?? "•");
}

function statusClass(file: DiffFileSummary): string {
  const status = file.gitStatus;
  if (file.hasMergeConflicts) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (status === "added" || status === "untracked") return "bg-diff-added/15 text-diff-added";
  if (status === "deleted") return "bg-diff-deleted/15 text-diff-deleted";
  return "bg-muted text-muted-foreground group-hover:text-foreground";
}
