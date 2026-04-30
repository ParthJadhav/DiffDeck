import { useCallback, useRef, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { fetchJson } from "../lib/api.js";

export interface UseFileDiffResult {
  fileDiffs: Record<string, FileDiffMetadata>;
  requestPath: (path: string) => void;
}

export function useFileDiff(onError: (message: string) => void): UseFileDiffResult {
  const [fileDiffs, setFileDiffs] = useState<Record<string, FileDiffMetadata>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<Set<string>>(new Set());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const requestPath = useCallback((path: string) => {
    if (path == null) return;
    if (loadedRef.current.has(path) || inflightRef.current.has(path)) return;
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
      });
  }, []);

  return { fileDiffs, requestPath };
}
