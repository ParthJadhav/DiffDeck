import { useState } from "react";
import {
  Copy,
  FileCode2,
  Link,
  MinusSquare,
  MoreHorizontal,
  PlusSquare,
  SquareArrowOutUpRight,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { fetchWithCapability } from "../../lib/api.js";
import { copyTextToClipboard } from "../../lib/clipboard.js";
import { buildDiffDeepLink, hasCapabilityToken, readDiffLocation } from "../../lib/deepLink.js";
import { openInEditor } from "../../lib/editor.js";
import type { SessionPayload } from "../../types.js";
import { ConfirmationDialog } from "../ui/confirmation-dialog.js";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../ui/menu.js";
import { FileCommentButton } from "./FileCommentButton.js";

/**
 * Per-file header controls. Only the note button stays visible — everything
 * else lives behind one overflow menu, because this row repeats for every file
 * in the diff and a row of six always-on icons turns a 100-file review into a
 * wall of chrome.
 */
export function FileActions({
  capabilities,
  fileCommentDraft,
  hunkCount,
  onFileCommentDraftChange,
  onFileCommentSubmit,
  onReload,
  onStructuralChange,
  path,
  snapshotId,
  structuralActive,
}: {
  capabilities?: SessionPayload["capabilities"];
  fileCommentDraft: string;
  hunkCount: number;
  onFileCommentDraftChange: (body: string) => void;
  onFileCommentSubmit: (body: string) => void;
  onReload: () => void;
  onStructuralChange: (output: string | null) => void;
  path: string;
  snapshotId: string;
  structuralActive: boolean;
}) {
  const [hunk, setHunk] = useState("file");
  const [busy, setBusy] = useState(false);
  const [revertConfirmationOpen, setRevertConfirmationOpen] = useState(false);

  const editorEnabled = capabilities?.editor === true;
  const structuralEnabled = capabilities?.structural === true;
  const writeActions =
    capabilities?.writeActions ??
    (capabilities?.write === true ? (["stage", "unstage", "revert"] as const) : []);

  const copyPath = async () => {
    try {
      await copyTextToClipboard(path);
      toast.success("Copied file path");
    } catch {
      toast.error("Unable to copy file path");
    }
  };

  const copyLink = async () => {
    const currentHref = window.location.href;
    const selectedLocation = readDiffLocation(currentHref);
    const location =
      selectedLocation.file === path
        ? { line: selectedLocation.line, side: selectedLocation.side }
        : undefined;
    try {
      await copyTextToClipboard(buildDiffDeepLink(currentHref, path, location));
      toast.success("Copied link to file", {
        description: hasCapabilityToken(currentHref)
          ? "This remote-mode link contains the access token. Treat it as a secret."
          : undefined,
      });
    } catch {
      toast.error("Unable to copy file link");
    }
  };

  const openFile = async () => {
    const location = readDiffLocation(window.location.href);
    const line = location.file === path ? (location.line ?? 1) : 1;
    try {
      await openInEditor(path, line);
      toast.success(line > 1 ? `Opened ${path}:${line}` : `Opened ${path}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const structural = async () => {
    if (structuralActive) {
      onStructuralChange(null);
      return;
    }
    setBusy(true);
    try {
      const response = await fetchWithCapability(
        `/api/structural?${new URLSearchParams({ path })}`,
      );
      const payload = (await response.json()) as { error?: string; output?: string };
      if (!response.ok || payload.output == null)
        throw new Error(payload.error ?? "Structural diff failed.");
      onStructuralChange(payload.output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onStructuralChange(`Structural diff unavailable\n\n${message}`);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (action: "stage" | "unstage" | "revert") => {
    const target = hunk === "file" ? "file" : `hunk ${Number(hunk) + 1}`;
    setBusy(true);
    try {
      const response = await fetchWithCapability("/api/write", {
        body: JSON.stringify({
          action,
          hunkIndex: hunk === "file" ? undefined : Number(hunk),
          path,
          snapshotId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${action} ${target}.`);
      toast.success(`${pastTense(action)} ${target}.`);
      setRevertConfirmationOpen(false);
      onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const scope = hunk === "file" ? "whole file" : `hunk ${Number(hunk) + 1}`;
  const showOperations = structuralEnabled || writeActions.length > 0;
  const showScopePicker = writeActions.length > 0 && hunkCount > 1;

  return (
    <div className="flex items-center gap-0.5 font-sans" data-diffdeck-shortcuts-disabled>
      <FileCommentButton
        draft={fileCommentDraft}
        onDraftChange={onFileCommentDraftChange}
        onSubmit={onFileCommentSubmit}
        path={path}
      />
      <Menu icon={<MoreHorizontal />} label={`More actions for ${path}`}>
        {(close) => (
          <>
            <MenuItem
              aria-label={`Copy path for ${path}`}
              icon={<Copy />}
              onSelect={() => {
                close();
                void copyPath();
              }}
            >
              Copy path
            </MenuItem>
            <MenuItem
              aria-label={`Copy link to ${path}`}
              icon={<Link />}
              onSelect={() => {
                close();
                void copyLink();
              }}
            >
              Copy link
            </MenuItem>
            {editorEnabled ? (
              <MenuItem
                aria-label={`Open ${path} in editor`}
                icon={<SquareArrowOutUpRight />}
                onSelect={() => {
                  close();
                  void openFile();
                }}
              >
                Open in editor
              </MenuItem>
            ) : null}

            {showOperations ? (
              <>
                <MenuSeparator />
                <MenuLabel>File operations</MenuLabel>
                {showScopePicker ? (
                  <label className="flex items-center gap-2 px-2 pb-1.5 pt-0.5">
                    <span className="text-[12px] text-muted-foreground">Apply to</span>
                    <select
                      aria-label={`Action scope for ${path}`}
                      className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-[12px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) => setHunk(event.target.value)}
                      value={hunk}
                    >
                      <option value="file">Whole file</option>
                      {Array.from({ length: hunkCount }, (_, index) => (
                        <option key={index} value={index}>
                          Hunk {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {structuralEnabled ? (
                  <MenuItem
                    disabled={busy}
                    icon={<FileCode2 />}
                    onSelect={() => {
                      close();
                      void structural();
                    }}
                  >
                    {structuralActive ? "Show source diff" : "Show structural diff"}
                  </MenuItem>
                ) : null}
                {writeActions.includes("stage") ? (
                  <MenuItem
                    disabled={busy}
                    icon={<PlusSquare />}
                    onSelect={() => {
                      close();
                      void mutate("stage");
                    }}
                  >
                    Stage {scope}
                  </MenuItem>
                ) : null}
                {writeActions.includes("unstage") ? (
                  <MenuItem
                    disabled={busy}
                    icon={<MinusSquare />}
                    onSelect={() => {
                      close();
                      void mutate("unstage");
                    }}
                  >
                    Unstage {scope}
                  </MenuItem>
                ) : null}
                {writeActions.includes("revert") ? (
                  <MenuItem
                    disabled={busy}
                    icon={<Undo2 />}
                    onSelect={() => {
                      close();
                      setRevertConfirmationOpen(true);
                    }}
                    variant="destructive"
                  >
                    Revert {scope}
                  </MenuItem>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </Menu>
      <ConfirmationDialog
        busy={busy}
        confirmLabel={`Revert ${scope}`}
        description={`This permanently discards the displayed ${scope} in ${path}. Staging and review notes are not a backup.`}
        onConfirm={() => void mutate("revert")}
        onOpenChange={setRevertConfirmationOpen}
        open={revertConfirmationOpen}
        title={`Revert ${scope}?`}
      />
    </div>
  );
}

function pastTense(action: "stage" | "unstage" | "revert"): string {
  return { stage: "Staged", unstage: "Unstaged", revert: "Reverted" }[action];
}
