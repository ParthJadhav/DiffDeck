import { useCallback, useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { toast } from "sonner";
import { fetchWithCapability } from "../lib/api.js";
import type { DiffFileSummary } from "../types.js";

export function CommandMenu({
  collapsedPaths,
  editorEnabled,
  files,
  onCollapsedChange,
  onSelectPath,
  onViewedChange,
  selectedPath,
  viewedPaths,
}: {
  collapsedPaths: ReadonlySet<string>;
  editorEnabled: boolean;
  files: readonly DiffFileSummary[];
  onCollapsedChange: (path: string, value: boolean) => void;
  onSelectPath: (path: string | null) => void;
  onViewedChange: (path: string, value: boolean) => void;
  selectedPath: string | null;
  viewedPaths: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const selectedIndex = files.findIndex((file) => file.path === selectedPath);

  const selectRelative = useCallback(
    (delta: number) => {
      if (files.length === 0) return;
      const base = selectedIndex < 0 ? 0 : selectedIndex;
      const index = Math.min(files.length - 1, Math.max(0, base + delta));
      onSelectPath(files[index]?.path ?? null);
    },
    [files, onSelectPath, selectedIndex],
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
    const response = await fetchWithCapability("/api/editor", {
      body: JSON.stringify({ line: 1, path: selectedPath }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Unable to open the configured editor.");
    }
    toast.success("Opened selected file in editor.");
  }, [editorEnabled, selectedPath]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcutEvent(event)) return;
      const commandPalette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (commandPalette || event.key === "?") {
        event.preventDefault();
        restoreFocusRef.current = document.activeElement as HTMLElement | null;
        setOpen(true);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("diffdeck-review-filter")?.focus();
      } else if (event.key === "j") {
        event.preventDefault();
        selectRelative(1);
      } else if (event.key === "k") {
        event.preventDefault();
        selectRelative(-1);
      } else if (event.key === "v" && selectedPath != null) {
        event.preventDefault();
        onViewedChange(selectedPath, !viewedPaths.has(selectedPath));
      } else if (event.key === "x" && selectedPath != null) {
        event.preventDefault();
        onCollapsedChange(selectedPath, !collapsedPaths.has(selectedPath));
      } else if (event.key === "c" && selectedPath != null) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("diffdeck:add-comment", { detail: selectedPath }));
      } else if (event.key === "s") {
        event.preventDefault();
        window.dispatchEvent(new Event("diffdeck:open-settings"));
      } else if (event.key === "o") {
        event.preventDefault();
        void openEditor().catch((error) => toast.error(String(error)));
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    collapsedPaths,
    onCollapsedChange,
    onViewedChange,
    openEditor,
    selectRelative,
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
        if (next) restoreFocusRef.current = document.activeElement as HTMLElement | null;
        setOpen(next);
      }}
      label="DiffDeck commands"
      className="app-command-dialog fixed left-1/2 top-[12vh] z-[80] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
    >
      <Command.Input
        autoFocus
        aria-label="Search DiffDeck commands and files"
        placeholder="Type a command or file…"
        className="h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="p-4 text-center text-xs text-muted-foreground">
          No matching command.
        </Command.Empty>
        <Command.Group heading="Review" className="text-xs text-muted-foreground">
          <MenuItem shortcut="J / K" onSelect={() => run(() => selectRelative(1))}>
            Next / previous file
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
          {files.map((file) => (
            <MenuItem key={file.path} onSelect={() => run(() => onSelectPath(file.path))}>
              {file.path}
            </MenuItem>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function MenuItem({
  children,
  onSelect,
  shortcut,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex min-h-9 cursor-pointer items-center rounded-md px-2 text-[12px] text-foreground outline-none data-[selected=true]:bg-accent"
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
