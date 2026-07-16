import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { toast } from "sonner";
import { readDiffLocation } from "../lib/deepLink.js";
import { openInEditor } from "../lib/editor.js";
import type { HunkNavigation, HunkTarget } from "../lib/hunkNavigation.js";
import type { ReviewNavigation } from "../lib/reviewNavigation.js";
import type { ReviewMode, ReviewSurface } from "../lib/reviewSession.js";
import type { DiffFileSummary } from "../types.js";

export function CommandMenu({
  collapsedPaths,
  editorEnabled,
  files,
  hunkNavigation,
  navigation,
  onCollapsedChange,
  onNavigateHunk,
  onReviewModeChange,
  onReviewSurfaceChange,
  onSelectPath,
  onViewedChange,
  selectedPath,
  reviewMode,
  reviewSurface,
  viewedPaths,
}: {
  collapsedPaths: ReadonlySet<string>;
  editorEnabled: boolean;
  files: readonly DiffFileSummary[];
  hunkNavigation: HunkNavigation;
  navigation: ReviewNavigation;
  onCollapsedChange: (path: string, value: boolean) => void;
  onNavigateHunk: (target: HunkTarget) => void;
  onReviewModeChange: (mode: ReviewMode) => void;
  onReviewSurfaceChange: (surface: ReviewSurface) => void;
  onSelectPath: (path: string | null) => void;
  onViewedChange: (path: string, value: boolean) => void;
  selectedPath: string | null;
  reviewMode: ReviewMode;
  reviewSurface: ReviewSurface;
  viewedPaths: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const matchingFiles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const candidates =
      normalized.length === 0
        ? files
        : files.filter((file) => file.path.toLocaleLowerCase().includes(normalized));
    return { files: candidates.slice(0, 100), total: candidates.length };
  }, [files, query]);
  const selectPath = useCallback(
    (path: string | null) => {
      if (path != null) onSelectPath(path);
    },
    [onSelectPath],
  );

  const run = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  const openEditor = useCallback(async () => {
    if (selectedPath == null) return;
    if (!editorEnabled) {
      toast.error("No editor is configured", { description: "Restart DiffDeck with --editor." });
      return;
    }
    const location = readDiffLocation(window.location.href);
    const line = location.file === selectedPath ? (location.line ?? 1) : 1;
    await openInEditor(selectedPath, line);
    toast.success("Opened selected file in editor.");
  }, [editorEnabled, selectedPath]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcutEvent(event)) return;
      const commandPalette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (commandPalette || event.key === "?") {
        event.preventDefault();
        restoreFocusRef.current = document.activeElement as HTMLElement | null;
        setQuery("");
        setOpen(true);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("diffdeck-review-filter")?.focus();
      } else if (key === "j") {
        event.preventDefault();
        selectPath(event.shiftKey ? navigation.nextUnviewedPath : navigation.nextPath);
      } else if (key === "k") {
        event.preventDefault();
        selectPath(event.shiftKey ? navigation.previousUnviewedPath : navigation.previousPath);
      } else if (key === "f" && selectedPath != null) {
        event.preventDefault();
        onReviewModeChange(reviewMode === "focus" ? "all" : "focus");
      } else if (key === "a" && selectedPath != null) {
        event.preventDefault();
        onReviewSurfaceChange(reviewSurface === "accessible" ? "rich" : "accessible");
      } else if (key === "n" && hunkNavigation.next != null) {
        event.preventDefault();
        onNavigateHunk(hunkNavigation.next);
      } else if (key === "p" && hunkNavigation.previous != null) {
        event.preventDefault();
        onNavigateHunk(hunkNavigation.previous);
      } else if (key === "v" && selectedPath != null) {
        event.preventDefault();
        onViewedChange(selectedPath, !viewedPaths.has(selectedPath));
      } else if (key === "x" && selectedPath != null) {
        event.preventDefault();
        onCollapsedChange(selectedPath, !collapsedPaths.has(selectedPath));
      } else if (key === "c" && selectedPath != null) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("diffdeck:add-comment", { detail: selectedPath }));
      } else if (key === "s") {
        event.preventDefault();
        window.dispatchEvent(new Event("diffdeck:open-settings"));
      } else if (key === "o") {
        event.preventDefault();
        void openEditor().catch((error) => toast.error(String(error)));
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    collapsedPaths,
    hunkNavigation,
    onCollapsedChange,
    onNavigateHunk,
    onReviewModeChange,
    onReviewSurfaceChange,
    onViewedChange,
    navigation,
    openEditor,
    reviewMode,
    reviewSurface,
    selectPath,
    selectedPath,
    viewedPaths,
  ]);

  useEffect(() => {
    if (!open) restoreFocusRef.current?.focus();
  }, [open]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          restoreFocusRef.current = document.activeElement as HTMLElement | null;
          setQuery("");
        }
        setOpen(next);
      }}
      label="Search DiffDeck commands and files"
      className="app-command-dialog fixed left-1/2 top-[12vh] z-[80] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
    >
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Type a command or file…"
        className="h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="p-4 text-center text-xs text-muted-foreground">
          No matching command.
        </Command.Empty>
        <Command.Group heading="Review" className="text-xs text-muted-foreground">
          <MenuItem
            disabled={navigation.previousPath == null}
            shortcut="K"
            onSelect={() => run(() => selectPath(navigation.previousPath))}
          >
            Previous visible file
          </MenuItem>
          <MenuItem
            disabled={selectedPath == null}
            shortcut="A"
            onSelect={() =>
              run(() =>
                onReviewSurfaceChange(reviewSurface === "accessible" ? "rich" : "accessible"),
              )
            }
          >
            {reviewSurface === "accessible"
              ? "Return to rich diff view"
              : "Open accessible linear patch view"}
          </MenuItem>
          <MenuItem
            disabled={navigation.nextPath == null}
            shortcut="J"
            onSelect={() => run(() => selectPath(navigation.nextPath))}
          >
            Next visible file
          </MenuItem>
          <MenuItem
            disabled={navigation.previousUnviewedPath == null}
            shortcut="⇧K"
            onSelect={() => run(() => selectPath(navigation.previousUnviewedPath))}
          >
            Previous unviewed file
          </MenuItem>
          <MenuItem
            disabled={navigation.nextUnviewedPath == null}
            shortcut="⇧J"
            onSelect={() => run(() => selectPath(navigation.nextUnviewedPath))}
          >
            Next unviewed file
          </MenuItem>
          <MenuItem
            disabled={hunkNavigation.previous == null}
            shortcut="P"
            onSelect={() => {
              if (hunkNavigation.previous != null) {
                run(() => onNavigateHunk(hunkNavigation.previous!));
              }
            }}
          >
            Previous changed hunk
          </MenuItem>
          <MenuItem
            disabled={hunkNavigation.next == null}
            shortcut="N"
            onSelect={() => {
              if (hunkNavigation.next != null) run(() => onNavigateHunk(hunkNavigation.next!));
            }}
          >
            Next changed hunk
          </MenuItem>
          <MenuItem
            disabled={selectedPath == null}
            shortcut="F"
            onSelect={() => run(() => onReviewModeChange(reviewMode === "focus" ? "all" : "focus"))}
          >
            {reviewMode === "focus" ? "Show all visible files" : "Focus selected file"}
          </MenuItem>
          <MenuItem
            shortcut="V"
            onSelect={() =>
              selectedPath != null &&
              run(() => onViewedChange(selectedPath, !viewedPaths.has(selectedPath)))
            }
          >
            Toggle viewed
          </MenuItem>
          <MenuItem
            shortcut="X"
            onSelect={() =>
              selectedPath != null &&
              run(() => onCollapsedChange(selectedPath, !collapsedPaths.has(selectedPath)))
            }
          >
            Toggle collapsed
          </MenuItem>
          <MenuItem
            shortcut="C"
            onSelect={() =>
              run(() =>
                window.dispatchEvent(
                  new CustomEvent("diffdeck:add-comment", { detail: selectedPath }),
                ),
              )
            }
          >
            Add comment at first changed line
          </MenuItem>
          <MenuItem
            shortcut="O"
            onSelect={() =>
              run(() => void openEditor().catch((error) => toast.error(String(error))))
            }
          >
            Open in editor
          </MenuItem>
          <MenuItem
            shortcut="S"
            onSelect={() => run(() => window.dispatchEvent(new Event("diffdeck:open-settings")))}
          >
            Open settings
          </MenuItem>
        </Command.Group>
        <Command.Group heading="Files" className="mt-2 text-xs text-muted-foreground">
          {matchingFiles.files.map((file) => (
            <MenuItem key={file.path} onSelect={() => run(() => onSelectPath(file.path))}>
              {file.path}
            </MenuItem>
          ))}
          {matchingFiles.total > matchingFiles.files.length ? (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground" role="status">
              Showing 100 of {matchingFiles.total.toLocaleString()} files. Type more of the path to
              narrow the list.
            </p>
          ) : null}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function MenuItem({
  children,
  disabled = false,
  onSelect,
  shortcut,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onSelect: () => void;
  shortcut?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      disabled={disabled}
      className="flex min-h-9 cursor-pointer items-center rounded-md px-2 text-[12px] text-foreground outline-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45 data-[selected=true]:bg-accent"
    >
      <span className="truncate">{children}</span>
      {shortcut != null ? (
        <kbd className="ml-auto font-mono text-[10px] text-muted-foreground">{shortcut}</kbd>
      ) : null}
    </Command.Item>
  );
}

export function shouldIgnoreShortcutEvent(event: Event): boolean {
  return event.composedPath().some((target) => {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target.matches("input, textarea, select, [role='textbox']") ||
      target.closest("[data-diffdeck-shortcuts-disabled]") != null
    );
  });
}
