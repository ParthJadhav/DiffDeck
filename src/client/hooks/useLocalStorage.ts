import { useCallback, useEffect, useRef, useState } from "react";

type Updater<T> = T | ((previous: T) => T);

export interface UseLocalStorageOptions<T> {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
}

function readFromStorage<T>(key: string, fallback: T, deserialize: (raw: string) => T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return deserialize(raw);
  } catch {
    return fallback;
  }
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions<T> = {},
): [T, (value: Updater<T>) => void] {
  const serialize = options.serialize ?? JSON.stringify;
  const deserialize = options.deserialize ?? (JSON.parse as (raw: string) => T);

  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  serializeRef.current = serialize;
  deserializeRef.current = deserialize;

  const [value, setValue] = useState<T>(() => readFromStorage(key, initialValue, deserialize));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, serializeRef.current(value));
    } catch {
      // Ignore quota/serialization errors — state still lives in memory.
    }
  }, [key, value]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key || event.newValue == null) return;
      try {
        setValue(deserializeRef.current(event.newValue));
      } catch {
        // Keep current value if the cross-tab payload is unreadable.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [key]);

  const update = useCallback((next: Updater<T>) => {
    setValue((current) =>
      typeof next === "function" ? (next as (previous: T) => T)(current) : next,
    );
  }, []);

  return [value, update];
}
