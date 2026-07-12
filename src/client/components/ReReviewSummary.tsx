import type { CommentExportRecord } from "../lib/commentExport.js";
import { Button } from "./ui/button.js";

export function ReReviewSummary({
  comments,
  onRemoveStatus,
}: {
  comments: readonly CommentExportRecord[];
  onRemoveStatus: (status: "resolved" | "stale") => void;
}) {
  const stale = comments.filter((comment) => comment.status === "stale").length;
  const resolved = comments.filter((comment) => comment.status === "resolved").length;
  if (stale === 0 && resolved === 0) return null;
  return (
    <section
      aria-label="Re-review summary"
      className="rounded-md border border-border bg-muted/30 p-2 text-[11px]"
    >
      <p className="font-semibold text-foreground">Re-review update</p>
      <p className="mt-0.5 text-muted-foreground">
        {stale} stale · {resolved} resolved. Unique moved lines are re-anchored automatically.
      </p>
      <div className="mt-1.5 flex gap-1">
        {stale > 0 ? (
          <Button
            variant="outline"
            onClick={() => onRemoveStatus("stale")}
            className="h-7 text-[10.5px]"
          >
            Delete stale
          </Button>
        ) : null}
        {resolved > 0 ? (
          <Button
            variant="outline"
            onClick={() => onRemoveStatus("resolved")}
            className="h-7 text-[10.5px]"
          >
            Clear resolved
          </Button>
        ) : null}
      </div>
    </section>
  );
}
