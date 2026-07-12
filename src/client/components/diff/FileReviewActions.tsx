import { useState } from "react";
import { toast } from "sonner";
import { fetchWithCapability } from "../../lib/api.js";
import type { SessionPayload } from "../../types.js";
import { Button } from "../ui/button.js";

export function FileReviewActions({
  capabilities,
  hunkCount,
  onRefresh,
  onStructuralChange,
  path,
  snapshotId,
  structuralActive,
}: {
  capabilities?: SessionPayload["capabilities"];
  hunkCount: number;
  onRefresh: () => void;
  onStructuralChange: (output: string | null) => void;
  path: string;
  snapshotId: string;
  structuralActive: boolean;
}) {
  const [hunk, setHunk] = useState("file");
  const [busy, setBusy] = useState(false);
  if (capabilities?.structural !== true && capabilities?.write !== true) return null;

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
    if (
      action === "revert" &&
      !window.confirm(`Revert ${scope} in ${path}? This discards changes.`)
    )
      return;
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
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="text-left font-sans" data-diffdeck-shortcuts-disabled>
      <summary className="cursor-pointer rounded px-1.5 py-1 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
        Actions
      </summary>
      <div className="mt-1 flex flex-wrap items-center justify-end gap-1 rounded-md border border-border bg-popover p-1.5 shadow-sm">
        {capabilities.structural ? (
          <Button
            disabled={busy}
            variant="outline"
            onClick={structural}
            className="h-7 text-[10.5px]"
          >
            {structuralActive ? "Source" : "Structure"}
          </Button>
        ) : null}
        {capabilities.write ? (
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
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void mutate("stage")}
              className="h-7 text-[10.5px]"
            >
              Stage
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void mutate("unstage")}
              className="h-7 text-[10.5px]"
            >
              Unstage
            </Button>
            <Button
              disabled={busy}
              variant="destructive"
              onClick={() => void mutate("revert")}
              className="h-7 text-[10.5px]"
            >
              Revert
            </Button>
          </>
        ) : null}
      </div>
    </details>
  );
}

function pastTense(action: "stage" | "unstage" | "revert"): string {
  return { stage: "Staged", unstage: "Unstaged", revert: "Reverted" }[action];
}
