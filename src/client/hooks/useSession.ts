import { useEffect, useState } from "react";
import { fetchJson } from "../lib/api.js";
import type { SessionPayload } from "../types.js";

export interface UseSessionResult {
  session: SessionPayload | null;
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const nextSession = await fetchJson<SessionPayload>("/api/session");
        if (!cancelled) {
          setSession(nextSession);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : String(requestError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return { session, loading, error, setError };
}
