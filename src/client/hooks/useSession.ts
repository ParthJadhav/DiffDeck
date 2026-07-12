import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api.js";
import type { SessionPayload } from "../types.js";

export interface UseSessionResult {
  session: SessionPayload | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  revision: number;
  refresh: () => void;
  reload: () => void;
  setError: (message: string | null) => void;
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestIdRef = useRef(0);

  const loadSession = useCallback(async (useInitialLoadingState: boolean, rebuild: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (useInitialLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
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
        setError(requestError instanceof Error ? requestError.message : String(requestError));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
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

  return { session, loading, refreshing, error, revision, refresh, reload, setError };
}
