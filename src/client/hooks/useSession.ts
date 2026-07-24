import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchJson } from "../lib/api.js";
import type { DiffWhitespaceMode, SessionPayload } from "../types.js";

export interface UseSessionResult {
  session: SessionPayload | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  revision: number;
  refresh: () => void;
  reload: () => void;
  setWhitespaceMode: (mode: DiffWhitespaceMode) => Promise<void>;
  setError: (message: string | null) => void;
}

interface SessionActivity {
  loading: boolean;
  refreshing: boolean;
}

type SessionActivityAction = { type: "start"; initial: boolean } | { type: "finish" };

function reduceSessionActivity(
  state: SessionActivity,
  action: SessionActivityAction,
): SessionActivity {
  if (action.type === "finish") {
    return state.loading || state.refreshing ? { loading: false, refreshing: false } : state;
  }
  return action.initial
    ? { loading: true, refreshing: false }
    : { loading: false, refreshing: true };
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [activity, dispatchActivity] = useReducer(reduceSessionActivity, {
    loading: true,
    refreshing: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestIdRef = useRef(0);
  const sessionRef = useRef<SessionPayload | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const loadSession = useCallback(async (useInitialLoadingState: boolean, rebuild: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    dispatchActivity({ type: "start", initial: useInitialLoadingState });
    setError(null);

    try {
      const params = new URLSearchParams({ t: String(Date.now()) });
      if (rebuild) params.set("refresh", "1");
      const nextSession = await fetchJson<SessionPayload>(`/api/session?${params.toString()}`);
      if (requestIdRef.current === requestId) {
        setSession(nextSession);
        setRevision((current) => current + 1);
      }
    } catch (requestError) {
      if (requestIdRef.current === requestId) {
        const message = requestError instanceof Error ? requestError.message : String(requestError);
        if (useInitialLoadingState || sessionRef.current == null) {
          setError(message);
        } else {
          toast.error("Unable to refresh the diff", {
            description: `${message} The current review remains available.`,
          });
        }
      }
    } finally {
      if (requestIdRef.current === requestId) {
        dispatchActivity({ type: "finish" });
      }
    }
  }, []);

  useEffect(() => {
    void loadSession(true, false);
  }, [loadSession]);

  const refresh = useCallback(() => {
    void loadSession(false, true);
  }, [loadSession]);

  const reload = useCallback(() => {
    void loadSession(false, false);
  }, [loadSession]);

  const setWhitespaceMode = useCallback(async (mode: DiffWhitespaceMode) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    dispatchActivity({ type: "start", initial: false });
    setError(null);
    try {
      const nextSession = await fetchJson<SessionPayload>("/api/preferences", {
        body: JSON.stringify({ whitespaceMode: mode }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (requestIdRef.current === requestId) {
        setSession(nextSession);
        setRevision((current) => current + 1);
      }
    } catch (requestError) {
      if (requestIdRef.current === requestId) {
        const message = requestError instanceof Error ? requestError.message : String(requestError);
        toast.error("Unable to change whitespace mode", {
          description: `${message} The current patch was not changed.`,
        });
      }
    } finally {
      if (requestIdRef.current === requestId) dispatchActivity({ type: "finish" });
    }
  }, []);

  return {
    session,
    loading: activity.loading,
    refreshing: activity.refreshing,
    error,
    revision,
    refresh,
    reload,
    setError,
    setWhitespaceMode,
  };
}
