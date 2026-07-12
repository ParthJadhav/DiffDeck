import { useCallback, useRef, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { fetchJson } from "../lib/api.js";

export interface UseFileDiffResult {
  fileDiffs: Record<string, FileDiffMetadata>;
  fileDiffErrors: Record<string, string>;
  requestPath: (path: string) => void;
  reset: () => void;
  retryPath: (path: string) => void;
}

// On very large diffs the IntersectionObserver in DiffWorkspace can enqueue
// thousands of requestPath calls in a tight burst (one per file card mounted).
// Browsers cap the number of parallel fetches to a single origin and start
// returning ERR_INSUFFICIENT_RESOURCES once the queue overflows, so we run our
// own queue with a fixed concurrency to keep the network layer healthy.
const MAX_INFLIGHT = 8;

export function useFileDiff(): UseFileDiffResult {
  const [fileDiffs, setFileDiffs] = useState<Record<string, FileDiffMetadata>>({});
  const [fileDiffErrors, setFileDiffErrors] = useState<Record<string, string>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<string[]>([]);
  const queuedSetRef = useRef<Set<string>>(new Set());
  const generationRef = useRef(0);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  const dispatchNext = useCallback(() => {
    while (inflightRef.current.size < MAX_INFLIGHT && queueRef.current.length > 0) {
      const path = queueRef.current.shift();
      if (path == null) return;
      queuedSetRef.current.delete(path);
      if (loadedRef.current.has(path) || inflightRef.current.has(path)) continue;
      inflightRef.current.add(path);
      const controller = new AbortController();
      controllersRef.current.set(path, controller);
      const generation = generationRef.current;
      const params = new URLSearchParams({ path });
      void fetchJson<FileDiffMetadata>(`/api/file-diff?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((fileDiff) => {
          if (generationRef.current !== generation) return;
          loadedRef.current.add(path);
          setFileDiffs((current) => ({ ...current, [path]: fileDiff }));
          setFileDiffErrors((current) => {
            if (!(path in current)) return current;
            const { [path]: _removed, ...rest } = current;
            return rest;
          });
        })
        .catch((requestError) => {
          if (generationRef.current !== generation) return;
          if (requestError instanceof DOMException && requestError.name === "AbortError") return;
          setFileDiffErrors((current) => ({
            ...current,
            [path]: requestError instanceof Error ? requestError.message : String(requestError),
          }));
        })
        .finally(() => {
          controllersRef.current.delete(path);
          inflightRef.current.delete(path);
          if (generationRef.current === generation) dispatchNext();
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

  const reset = useCallback(() => {
    generationRef.current += 1;
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
    inflightRef.current.clear();
    loadedRef.current.clear();
    queueRef.current = [];
    queuedSetRef.current.clear();
    setFileDiffs({});
    setFileDiffErrors({});
  }, []);

  const retryPath = useCallback(
    (path: string) => {
      loadedRef.current.delete(path);
      setFileDiffErrors((current) => {
        if (!(path in current)) return current;
        const { [path]: _removed, ...rest } = current;
        return rest;
      });
      requestPath(path);
    },
    [requestPath],
  );

  return { fileDiffErrors, fileDiffs, requestPath, reset, retryPath };
}
