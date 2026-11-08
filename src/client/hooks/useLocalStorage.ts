import { useCallback, useEffect, useState } from "react";

type Updater<T> = T | ((previous: T) => T);

function readFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: Updater<T>) => void] {
  const [value, setValue] = useState<T>(() => readFromStorage(key, initialValue));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota/serialization errors — state still lives in memory.
    }
  }, [key, value]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key || event.newValue == null) return;
      try {
        setValue(JSON.parse(event.newValue) as T);
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
