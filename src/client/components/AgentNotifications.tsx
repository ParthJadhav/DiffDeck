import { useMemo, useState } from "react";
import { type AgentQueueEvent } from "../hooks/useAgentQueue.js";
import { Button } from "./ui/button.js";

export function AgentNotifications({
  events,
  onOpenComment,
}: {
  events: AgentQueueEvent[];
  onOpenComment: (commentId: string) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const visible = useMemo(
    () => events.filter((event) => !dismissed.has(event.id)).slice(0, 5),
    [dismissed, events],
  );
  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,26rem)] flex-col gap-2">
      {visible.map((event) => (
        <div key={event.id} className="pointer-events-auto rounded-md border border-border bg-card p-2.5 shadow-lg">
          <button
            type="button"
            onClick={() => onOpenComment(event.commentId)}
            className="w-full text-left text-xs text-foreground hover:underline"
          >
            {event.message}
          </button>
          <div className="mt-2 flex items-center justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                setDismissed((current) => {
                  const next = new Set(current);
                  next.add(event.id);
                  return next;
                });
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
