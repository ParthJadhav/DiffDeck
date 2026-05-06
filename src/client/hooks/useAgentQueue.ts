import { useCallback, useEffect, useState } from "react";
import type { CommentExportRecord } from "../lib/commentExport.js";
import { fetchJson } from "../lib/api.js";

export type AgentType = "none" | "opencode" | "codex";
export type AgentExecutionMode = "shared_session" | "isolated";
export type QueueStatus = "queued" | "in_progress" | "done" | "error" | "needs_input";

export interface AgentQueueItem {
  id: string;
  comment: CommentExportRecord;
  createdAt: number;
  updatedAt: number;
  status: QueueStatus;
  response: string | null;
  error: string | null;
  livePreview?: string | null;
}

export interface AgentQueueEvent {
  commentId: string;
  createdAt: number;
  id: string;
  message: string;
}

export interface AgentQueueSnapshot {
  agentType: AgentType;
  executionMode: AgentExecutionMode;
  events: AgentQueueEvent[];
  health: { message: string; status: "green" | "red" | "yellow" };
  processing: boolean;
  paused: boolean;
  resumeCommand: string | null;
  sharedSessionId: string | null;
  items: AgentQueueItem[];
}

export function useAgentQueue() {
  const [snapshot, setSnapshot] = useState<AgentQueueSnapshot | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchJson<AgentQueueSnapshot>("/api/agent-queue");
    setSnapshot(next);
  }, []);

  useEffect(() => {
    void refresh();
    const source = new EventSource("/api/agent-queue/stream");
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const next = JSON.parse(event.data) as AgentQueueSnapshot;
        setSnapshot(next);
      } catch {
        // Ignore malformed event payloads and keep fallback polling alive.
      }
    };
    source.addEventListener("message", handleMessage);

    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      source.removeEventListener("message", handleMessage);
      source.close();
      window.clearInterval(interval);
    };
  }, [refresh]);

  const enqueueComment = useCallback(async (comment: CommentExportRecord) => {
    const response = await fetch("/api/agent-queue/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(comment),
    });
    if (!response.ok) throw new Error(`Failed to queue comment (${response.status})`);
    await refresh();
  }, [refresh]);

  const deleteComment = useCallback(async (id: string) => {
    const response = await fetch(`/api/agent-queue/comment/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(`Failed to delete comment (${response.status})`);
    await refresh();
  }, [refresh]);

  const setAgentType = useCallback(async (agentType: AgentType) => {
    const response = await fetch("/api/agent-queue/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentType }),
    });
    if (!response.ok) throw new Error(`Failed to set agent (${response.status})`);
    await refresh();
  }, [refresh]);

  const setExecutionMode = useCallback(async (executionMode: AgentExecutionMode) => {
    const response = await fetch("/api/agent-queue/execution-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionMode }),
    });
    if (!response.ok) throw new Error(`Failed to set execution mode (${response.status})`);
    await refresh();
  }, [refresh]);

  const cancelComment = useCallback(async (id: string) => {
    const response = await fetch(`/api/agent-queue/comment/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(`Failed to cancel comment (${response.status})`);
    await refresh();
  }, [refresh]);

  const setPaused = useCallback(async (value: boolean) => {
    const response = await fetch(value ? "/api/agent-queue/pause" : "/api/agent-queue/resume", {
      method: "POST",
    });
    if (!response.ok) throw new Error(`Failed to ${value ? "pause" : "resume"} queue (${response.status})`);
    await refresh();
  }, [refresh]);

  const clearQueue = useCallback(async () => {
    const response = await fetch("/api/agent-queue/clear", {
      method: "POST",
    });
    if (!response.ok) throw new Error(`Failed to clear queue (${response.status})`);
    await refresh();
  }, [refresh]);

  return {
    snapshot,
    enqueueComment,
    deleteComment,
    setAgentType,
    setExecutionMode,
    cancelComment,
    setPaused,
    clearQueue,
  };
}
