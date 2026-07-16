import { useState } from "react";
import { toast } from "sonner";
import { fetchWithCapability } from "../../lib/api.js";
import type { SessionPayload } from "../../types.js";
import { Button } from "../ui/button.js";
import { ConfirmationDialog } from "../ui/confirmation-dialog.js";

export function FileReviewActions({
  capabilities,
  hunkCount,
  onReload,
  onStructuralChange,
  path,
  snapshotId,
  structuralActive,
}: {
  capabilities?: SessionPayload["capabilities"];
  hunkCount: number;
  onReload: () => void;
  onStructuralChange: (output: string | null) => void;
  path: string;
  snapshotId: string;
  structuralActive: boolean;
}) {
  const [hunk, setHunk] = useState("file");
  const [busy, setBusy] = useState(false);
  const [revertConfirmationOpen, setRevertConfirmationOpen] = useState(false);
  const writeActions =
    capabilities?.writeActions ??
    (capabilities?.write === true ? (["stage", "unstage", "revert"] as const) : []);
  const canWrite = writeActions.length > 0;
  if (capabilities?.structural !== true && !canWrite) return null;

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
    const scope = hunk === "file" ? "file" : `hunk ${Number(hunk) + 1}`;
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
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${action} ${scope}.`);
      toast.success(`${pastTense(action)} ${scope}.`);
      setRevertConfirmationOpen(false);
      onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const scope = hunk === "file" ? "whole file" : `hunk ${Number(hunk) + 1}`;

  return (
    <>
      <details className="text-left font-sans" data-diffdeck-shortcuts-disabled>
        <summary className="cursor-pointer rounded px-1.5 py-1 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
          File operations
        </summary>
        <div className="mt-1 flex flex-wrap items-center justify-end gap-1 rounded-md border border-border bg-popover p-1.5 shadow-sm">
          {capabilities?.structural ? (
            <Button
              disabled={busy}
              variant="outline"
              onClick={structural}
              className="h-7 text-[10.5px]"
            >
              {structuralActive ? "Source" : "Structure"}
            </Button>
          ) : null}
          {canWrite ? (
            <>
              <select
                aria-label={`Action scope for ${path}`}
                value={hunk}
                onChange={(event) => setHunk(event.target.value)}
                className="h-7 rounded border border-input bg-background px-1 text-[10.5px]"
              >
                <option value="file">Whole file</option>
                {Array.from({ length: hunkCount }, (_, index) => (
                  <option key={index} value={index}>
                    Hunk {index + 1}
                  </option>
                ))}
              </select>
              {writeActions.includes("stage") ? (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => void mutate("stage")}
                  className="h-7 text-[10.5px]"
                >
                  Stage
                </Button>
              ) : null}
              {writeActions.includes("unstage") ? (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => void mutate("unstage")}
                  className="h-7 text-[10.5px]"
                >
                  Unstage
                </Button>
              ) : null}
              {writeActions.includes("revert") ? (
                <Button
                  disabled={busy}
                  variant="destructive"
                  onClick={() => setRevertConfirmationOpen(true)}
                  className="h-7 text-[10.5px]"
                >
                  Revert
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </details>
      <ConfirmationDialog
        busy={busy}
        confirmLabel={`Revert ${scope}`}
        description={`This permanently discards the displayed ${scope} in ${path}. Staging and review notes are not a backup.`}
        onConfirm={() => void mutate("revert")}
        onOpenChange={setRevertConfirmationOpen}
        open={revertConfirmationOpen}
        title={`Revert ${scope}?`}
      />
    </>
  );
}

function pastTense(action: "stage" | "unstage" | "revert"): string {
  return { stage: "Staged", unstage: "Unstaged", revert: "Reverted" }[action];
}
