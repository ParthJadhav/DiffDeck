import { useEffect, useState } from "react";
import { fetchText } from "../lib/api.js";
import type { DiffView } from "../lib/uiTypes.js";

export interface UseRawDiffResult {
  rawDiff: string | null;
  loading: boolean;
}

export function useRawDiff(
  diffView: DiffView,
  rawDiffAvailable: boolean,
  onError: (message: string) => void,
): UseRawDiffResult {
  const [rawDiff, setRawDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (diffView !== "patch" || rawDiff != null || loading || !rawDiffAvailable) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchText("/api/raw-diff")
      .then((next) => {
        if (!cancelled) {
          setRawDiff(next);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          onError(
            requestError instanceof Error
              ? requestError.message
              : String(requestError),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [diffView, rawDiff, loading, rawDiffAvailable, onError]);

  return { rawDiff, loading };
}
