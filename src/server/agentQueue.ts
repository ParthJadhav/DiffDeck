import {
  getAgentProviderAdapter,
  type AgentExecutionMode,
  type AgentProviderId,
  type CommentExportRecord,
} from "./agentProviders.js";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AgentType = "none" | AgentProviderId;
export type QueueStatus = "queued" | "in_progress" | "done" | "error" | "needs_input";

export interface AgentQueueItem {
  id: string;
  comment: CommentExportRecord;
  createdAt: number;
  updatedAt: number;
  status: QueueStatus;
  response: string | null;
  error: string | null;
  livePreview: string | null;
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

export function createAgentQueue(options: { workingDirectory: string }) {
  const FILE_BATCH_DEBOUNCE_MS = 1200;
  const statePath = join(options.workingDirectory, ".diffdeck-agent-queue-state.json");
  const loadedState = loadState(statePath);
  const items = new Map<string, AgentQueueItem>();
  const previewById = new Map<string, string>();
  const events: AgentQueueEvent[] = loadedState?.events ?? [];
  const order: string[] = loadedState?.order ?? [];
  let processing = false;
  let paused = loadedState?.paused ?? false;
  let agentType: AgentType = loadedState?.agentType ?? "opencode";
  // Always default to shared session on startup for better context continuity.
  // Users can still switch to isolated from the UI per run.
  let executionMode: AgentExecutionMode = "shared_session";
  let sharedSessionId: string | null = loadedState?.sharedSessionId ?? null;
  let activeRun: { cancel: () => void; ids: string[] } | null = null;
  let callbackBaseUrl = process.env.DIFFDECK_AGENT_CALLBACK_BASE_URL ?? "http://127.0.0.1:4173";
  const listeners = new Set<(snapshot: AgentQueueSnapshot) => void>();
  const fileReadyAt = new Map<string, number>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  if (loadedState?.items != null) {
    for (const item of loadedState.items) {
      const normalizedStatus = item.status === "in_progress" ? "queued" : item.status;
      items.set(item.id, { ...item, status: normalizedStatus });
    }
  }

  const pushEvent = (commentId: string, message: string) => {
    events.unshift({
      commentId,
      createdAt: Date.now(),
      id: `${commentId}-${Date.now()}`,
      message,
    });
    if (events.length > 100) events.length = 100;
  };

  const emitSnapshot = () => {
    const snapshot = getSnapshot();
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const persistState = () => {
    const payload = JSON.stringify(
      {
        agentType,
        events,
        executionMode,
        items: order.map((id) => items.get(id)).filter((item) => item != null),
        order,
        paused,
        sharedSessionId,
      },
      null,
      2,
    );
    const tempPath = `${statePath}.tmp`;
    writeFileSync(tempPath, payload, "utf8");
    renameSync(tempPath, statePath);
    emitSnapshot();
  };

  const upsert = (comment: CommentExportRecord): AgentQueueItem => {
    const now = Date.now();
    const existing = items.get(comment.id);
    if (existing == null) {
      const next: AgentQueueItem = {
        id: comment.id,
        comment,
        createdAt: now,
        updatedAt: now,
        status: "queued",
        response: null,
        error: null,
        livePreview: null,
      };
      items.set(comment.id, next);
      order.push(comment.id);
      fileReadyAt.set(comment.filePath, Date.now() + FILE_BATCH_DEBOUNCE_MS);
      persistState();
      return next;
    }

    const next: AgentQueueItem = {
      ...existing,
      comment,
      updatedAt: now,
      status: "queued",
      response: null,
      error: null,
    };
    items.set(comment.id, next);
    fileReadyAt.set(comment.filePath, Date.now() + FILE_BATCH_DEBOUNCE_MS);
    persistState();
    return next;
  };

  const remove = (id: string) => {
    const removed = items.get(id);
    items.delete(id);
    const index = order.indexOf(id);
    if (index !== -1) {
      order.splice(index, 1);
    }
    if (removed != null) {
      previewById.delete(id);
      const hasSameFile = order.some((queuedId) => items.get(queuedId)?.comment.filePath === removed.comment.filePath);
      if (!hasSameFile) fileReadyAt.delete(removed.comment.filePath);
    }
    persistState();
  };

  const clear = () => {
    if (activeRun != null) {
      activeRun.cancel();
      activeRun = null;
    }
    processing = false;
    const hadItems = order.length > 0;
    items.clear();
    order.length = 0;
    previewById.clear();
    fileReadyAt.clear();

    if (debounceTimer != null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pushEvent("queue", hadItems ? "Queue cleared." : "Queue already empty.");
    persistState();
  };

  const setAgentType = (value: AgentType) => {
    agentType = value;
    persistState();
    void processQueue();
  };

  const getSnapshot = (): AgentQueueSnapshot => ({
    agentType,
    executionMode,
    events,
    health: getHealth(),
    processing,
    paused,
    resumeCommand:
      agentType === "none"
        ? null
        : getAgentProviderAdapter(agentType).getResumeCommand({
            executionMode,
            repoRoot: options.workingDirectory,
            sessionId: sharedSessionId,
          }),
    sharedSessionId,
    items: order
      .map((id) => items.get(id))
      .filter((item): item is AgentQueueItem => item != null)
      .map((item) => ({ ...item, livePreview: previewById.get(item.id) ?? null })),
  });

  const markDone = (id: string, response: string | null) => {
    const current = items.get(id);
    if (current == null) return;
    items.set(id, {
      ...current,
      status: "done",
      response,
      error: null,
      updatedAt: Date.now(),
    });
    previewById.delete(id);
    pushEvent(id, `Agent completed: ${response ?? "Done."}`);
    persistState();
  };

  const markFailed = (id: string, error: string) => {
    const current = items.get(id);
    if (current == null) return;
    items.set(id, {
      ...current,
      status: "error",
      error,
      updatedAt: Date.now(),
    });
    previewById.delete(id);
    pushEvent(id, `Agent error: ${error}`);
    persistState();
  };

  const markNeedsInput = (id: string, response: string | null) => {
    const current = items.get(id);
    if (current == null) return;
    items.set(id, {
      ...current,
      status: "needs_input",
      response,
      error: null,
      updatedAt: Date.now(),
    });
    previewById.delete(id);
    pushEvent(id, `Agent needs clarification: ${response ?? "Question received."}`);
    persistState();
  };

  const processQueue = async () => {
    if (processing || paused || agentType === "none") return;
    const now = Date.now();
    const queued = order
      .map((id) => items.get(id))
      .find((item): item is AgentQueueItem => item?.status === "queued");
    if (queued == null) return;

    const filePath = queued.comment.filePath;
    const readyAt = fileReadyAt.get(filePath) ?? 0;
    if (readyAt > now) {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void processQueue();
      }, Math.max(readyAt - now, 20));
      return;
    }

    const batchItems = order
      .map((id) => items.get(id))
      .filter(
        (item): item is AgentQueueItem =>
          item != null && item.status === "queued" && item.comment.filePath === filePath,
      );
    if (batchItems.length === 0) return;
    const batchIds = batchItems.map((item) => item.id);

    processing = true;
    for (const item of batchItems) {
      items.set(item.id, { ...item, status: "in_progress", updatedAt: Date.now(), error: null });
    }
    persistState();
    try {
      const provider = getAgentProviderAdapter(agentType);
      const controller = new AbortController();
      activeRun = { ids: batchIds, cancel: () => controller.abort() };
      let lastPreview = "";
      const result = await provider.runBatch(
        batchItems.map((item) => item.comment),
        {
          callbackBaseUrl,
          executionMode,
          onPreview: (preview) => {
            if (preview.length === 0 || preview === lastPreview) return;
            lastPreview = preview;
            for (const id of batchIds) {
              if (items.get(id)?.status === "in_progress") {
                previewById.set(id, preview);
              }
            }
            emitSnapshot();
          },
          repoRoot: options.workingDirectory,
          signal: controller.signal,
        },
      );
      if (executionMode === "shared_session" && result.sessionId != null) {
        sharedSessionId = result.sessionId;
      }
      // Completion is callback-driven only:
      // `/api/agent-queue/comment/:id/complete` sets done/error/needs-input.
      fileReadyAt.delete(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const id of batchIds) markFailed(id, message);
    } finally {
      activeRun = null;
      processing = false;
      persistState();
      void processQueue();
    }
  };

  const getHealth = (): { message: string; status: "green" | "red" | "yellow" } => {
    if (agentType === "none") {
      return { status: "yellow", message: "Disabled" };
    }
    const latestError = order
      .map((id) => items.get(id))
      .find((item) => item?.status === "error");
    if (latestError != null) {
      return { status: "red", message: "Errors present" };
    }
    if (paused) {
      return { status: "yellow", message: "Paused" };
    }
    if (processing) {
      return { status: "green", message: "Working" };
    }
    return { status: "green", message: "Ready" };
  };

  return {
    completeFromCallback(id: string, payload: { error?: string | null; response?: string | null }) {
      if (!items.has(id)) return false;
      if (payload.error != null && payload.error.length > 0) {
        if (payload.error.trim().toLowerCase().startsWith("question:")) {
          markNeedsInput(id, payload.error.trim().slice("question:".length).trim());
        } else {
          markFailed(id, payload.error);
        }
      } else {
        const response = payload.response ?? null;
        if (response != null && response.trim().toLowerCase().startsWith("question:")) {
          markNeedsInput(id, response.trim().slice("question:".length).trim());
        } else {
          markDone(id, response);
        }
      }
      persistState();
      return true;
    },
    cancel(id: string) {
      const current = items.get(id);
      if (current == null) return false;
      if (current.status === "in_progress" && activeRun?.ids.includes(id) === true) {
        activeRun.cancel();
        for (const activeId of activeRun.ids) {
          markFailed(activeId, "Canceled by reviewer.");
        }
        persistState();
        return true;
      }
      if (current.status === "queued" || current.status === "needs_input") {
        markFailed(id, "Canceled by reviewer.");
        persistState();
        return true;
      }
      return false;
    },
    getSnapshot,
    subscribe(listener: (snapshot: AgentQueueSnapshot) => void) {
      listeners.add(listener);
      listener(getSnapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    setCallbackBaseUrl(url: string) {
      callbackBaseUrl = url;
    },
    setPaused(value: boolean) {
      paused = value;
      pushEvent("queue", value ? "Queue paused." : "Queue resumed.");
      persistState();
      void processQueue();
    },
    remove,
    clear,
    setAgentType,
    setExecutionMode(value: AgentExecutionMode) {
      executionMode = value;
      persistState();
      void processQueue();
    },
    upsertAndProcess(comment: CommentExportRecord) {
      const item = upsert(comment);
      void processQueue();
      return item;
    },
  };
}

function loadState(path: string):
  | {
      agentType: AgentType;
      events: AgentQueueEvent[];
      executionMode: AgentExecutionMode;
      items: AgentQueueItem[];
      order: string[];
      paused: boolean;
      sharedSessionId: string | null;
    }
  | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      agentType?: AgentType;
      events?: AgentQueueEvent[];
      executionMode?: AgentExecutionMode;
      items?: AgentQueueItem[];
      order?: string[];
      paused?: boolean;
      sharedSessionId?: string | null;
    };
    return {
      agentType: parsed.agentType ?? "opencode",
      events: Array.isArray(parsed.events) ? parsed.events : [],
      executionMode: parsed.executionMode ?? "shared_session",
      items: Array.isArray(parsed.items) ? parsed.items : [],
      order: Array.isArray(parsed.order) ? parsed.order : [],
      paused: parsed.paused === true,
      sharedSessionId: parsed.sharedSessionId ?? null,
    };
  } catch {
    return null;
  }
}
