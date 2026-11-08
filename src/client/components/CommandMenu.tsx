import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { toast } from "sonner";
import { readDiffLocation } from "../lib/deepLink.js";
import { api } from "../lib/api.js";
import { shouldIgnoreShortcutEvent } from "../lib/keyboard.js";
import { emitAppEvent } from "../lib/appEvents.js";
import type { HunkNavigation, HunkTarget } from "../lib/hunkNavigation.js";
import type { ReviewNavigation } from "../lib/reviewNavigation.js";
import type { ReviewMode, ReviewSurface } from "../lib/reviewSession.js";
import type { DiffFileSummary } from "../../server/protocol.js";

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
    await api.openInEditor(selectedPath, line);
    toast.success("Opened selected file in editor.");
  }, [editorEnabled, selectedPath]);

  const hasSelection = selectedPath != null;
  // Every review command, in palette order. Commands without a label are
  // keyboard-only; `shift` tells Shift+J/K apart, other keys ignore it.
  const commands: ReviewCommand[] = [
    { key: "/", enabled: true, run: () => emitAppEvent("focus-file-search") },
    {
      key: "k",
      shift: false,
      label: "Previous visible file",
      shortcut: "K",
      repeatable: true,
      enabled: navigation.previousPath != null,
      run: () => selectPath(navigation.previousPath),
    },
    {
      key: "a",
      label:
        reviewSurface === "accessible"
          ? "Return to rich diff view"
          : "Open accessible linear patch view",
      shortcut: "A",
      enabled: hasSelection,
      run: () => onReviewSurfaceChange(reviewSurface === "accessible" ? "rich" : "accessible"),
    },
    {
      key: "j",
      shift: false,
      label: "Next visible file",
      shortcut: "J",
      repeatable: true,
      enabled: navigation.nextPath != null,
      run: () => selectPath(navigation.nextPath),
    },
    {
      key: "k",
      shift: true,
      label: "Previous unviewed file",
      shortcut: "⇧K",
      repeatable: true,
      enabled: navigation.previousUnviewedPath != null,
      run: () => selectPath(navigation.previousUnviewedPath),
    },
    {
      key: "j",
      shift: true,
      label: "Next unviewed file",
      shortcut: "⇧J",
      repeatable: true,
      enabled: navigation.nextUnviewedPath != null,
      run: () => selectPath(navigation.nextUnviewedPath),
    },
    {
      key: "p",
      label: "Previous changed hunk",
      shortcut: "P",
      repeatable: true,
      enabled: hunkNavigation.previous != null,
      run: () => {
        if (hunkNavigation.previous != null) onNavigateHunk(hunkNavigation.previous);
      },
    },
    {
      key: "n",
      label: "Next changed hunk",
      shortcut: "N",
      repeatable: true,
      enabled: hunkNavigation.next != null,
      run: () => {
        if (hunkNavigation.next != null) onNavigateHunk(hunkNavigation.next);
      },
    },
    {
      key: "f",
      label: reviewMode === "focus" ? "Show all visible files" : "Focus selected file",
      shortcut: "F",
      enabled: hasSelection,
      run: () => onReviewModeChange(reviewMode === "focus" ? "all" : "focus"),
    },
    {
      key: "v",
      label: "Toggle viewed",
      shortcut: "V",
      enabled: hasSelection,
      run: () => {
        if (selectedPath != null) onViewedChange(selectedPath, !viewedPaths.has(selectedPath));
      },
    },
    {
      key: "x",
      label: "Toggle collapsed",
      shortcut: "X",
      enabled: hasSelection,
      run: () => {
        if (selectedPath != null) {
          onCollapsedChange(selectedPath, !collapsedPaths.has(selectedPath));
        }
      },
    },
    {
      key: "c",
      label: "Add comment at first changed line",
      shortcut: "C",
      enabled: hasSelection,
      run: () => {
        if (selectedPath != null) emitAppEvent("add-comment", selectedPath);
      },
    },
    {
      key: "o",
      label: "Open in editor",
      shortcut: "O",
      enabled: true,
      run: () => void openEditor().catch((error) => toast.error(String(error))),
    },
    {
      key: "s",
      label: "Open settings",
      shortcut: "S",
      enabled: true,
      run: () => emitAppEvent("open-settings"),
    },
  ];

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (shouldIgnoreShortcutEvent(event)) return;
    const commandPalette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (commandPalette || event.key === "?") {
      event.preventDefault();
      if (event.repeat) return;
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setOpen(true);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const command = commands.find(
      (candidate) =>
        candidate.key === key && (candidate.shift == null || candidate.shift === event.shiftKey),
    );
    // Holding a key may step through files and hunks, but must never flip a
    // toggle back and forth or open the same panel repeatedly.
    if (command == null || !command.enabled || (event.repeat && command.repeatable !== true)) {
      return;
    }
    event.preventDefault();
    command.run();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

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
          {commands.map((command) =>
            command.label == null ? null : (
              <MenuItem
                key={`${command.shortcut}`}
                disabled={!command.enabled}
                shortcut={command.shortcut}
                onSelect={() => run(command.run)}
              >
                {command.label}
              </MenuItem>
            ),
          )}
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

interface ReviewCommand {
  key: string;
  shift?: boolean;
  label?: string;
  shortcut?: string;
  repeatable?: boolean;
  enabled: boolean;
  run: () => void;
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
