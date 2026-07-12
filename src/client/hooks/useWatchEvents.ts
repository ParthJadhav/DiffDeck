import { useEffect } from "react";
import { toast } from "sonner";
import { withCapabilityToken } from "../lib/api.js";

export function useWatchEvents(
  enabled: boolean,
  onRefresh: () => void,
  autoRefresh: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(withCapabilityToken("/api/events"));
    const handleSnapshot = () => {
      const editingComment = document.querySelector(".app-comment-textarea") != null;
      if (autoRefresh && !editingComment) {
        onRefresh();
        toast.success("Diff refreshed after a repository change.");
      } else {
        toast("Repository changes detected", {
          action: { label: "Refresh", onClick: onRefresh },
          description: "Your current draft is preserved until you choose to refresh.",
          duration: 10_000,
        });
      }
    };
    const handleError = () => toast.error("Diff watch connection was interrupted.");
    source.addEventListener("snapshot", handleSnapshot);
    source.addEventListener("error", handleError);
    return () => source.close();
  }, [autoRefresh, enabled, onRefresh]);
}
