import { useCallback, useRef, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { fetchJson } from "../lib/api.js";

export interface UseFileDiffResult {
  fileDiffs: Record<string, FileDiffMetadata>;
  requestPath: (path: string) => void;
}

// On very large diffs the IntersectionObserver in DiffWorkspace can enqueue
// thousands of requestPath calls in a tight burst (one per file card mounted).
// Browsers cap the number of parallel fetches to a single origin and start
// returning ERR_INSUFFICIENT_RESOURCES once the queue overflows, so we run our
// own queue with a fixed concurrency to keep the network layer healthy.
const MAX_INFLIGHT = 8;

export function useFileDiff(onError: (message: string) => void): UseFileDiffResult {
  const [fileDiffs, setFileDiffs] = useState<Record<string, FileDiffMetadata>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<string[]>([]);
  const queuedSetRef = useRef<Set<string>>(new Set());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const dispatchNext = useCallback(() => {
    while (inflightRef.current.size < MAX_INFLIGHT && queueRef.current.length > 0) {
      const path = queueRef.current.shift();
      if (path == null) return;
      queuedSetRef.current.delete(path);
      if (loadedRef.current.has(path) || inflightRef.current.has(path)) continue;
      inflightRef.current.add(path);
      const params = new URLSearchParams({ path });
      void fetchJson<FileDiffMetadata>(`/api/file-diff?${params.toString()}`)
        .then((fileDiff) => {
          loadedRef.current.add(path);
          setFileDiffs((current) => ({ ...current, [path]: fileDiff }));
        })
        .catch((requestError) => {
          onErrorRef.current(
            requestError instanceof Error ? requestError.message : String(requestError),
          );
        })
        .finally(() => {
          inflightRef.current.delete(path);
          dispatchNext();
        });
    }
  }, []);

  const requestPath = useCallback(
    (path: string) => {
      if (path == null) return;
      if (loadedRef.current.has(path) || inflightRef.current.has(path)) return;
      if (queuedSetRef.current.has(path)) return;
      queuedSetRef.current.add(path);
      queueRef.current.push(path);
      dispatchNext();
    },
    [dispatchNext],
  );

  return { fileDiffs, requestPath };
}
