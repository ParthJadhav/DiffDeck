import type { AnnotationSide } from "@pierre/diffs";

/** A changed line in one file of the diff. */
export interface LineLocation {
  line: number;
  path: string;
  side: AnnotationSide;
}

/**
 * Requests that cross component boundaries without a shared parent prop:
 * keyboard shortcuts, the command palette and the notes hub ask the diff,
 * sidebar and settings panels to act. Every event and its payload is listed
 * here.
 */
interface AppEvents {
  /** Scroll the diff to a line and focus it. */
  "navigate-line": LineLocation;
  /** The reviewer selected a line in the rich or accessible view. */
  "line-selected": LineLocation;
  /** Scroll to and focus a saved note. */
  "focus-note": { id: string; path: string; scope: "file" | "line" };
  /** Open a composer at the first changed line of this file path. */
  "add-comment": string;
  "open-settings": undefined;
  "focus-file-search": undefined;
}

type AppEventName = keyof AppEvents;
type DetailArgs<K extends AppEventName> = AppEvents[K] extends undefined ? [] : [AppEvents[K]];

export function emitAppEvent<K extends AppEventName>(name: K, ...detail: DetailArgs<K>): void {
  window.dispatchEvent(new CustomEvent(`diffdeck:${name}`, { detail: detail[0] }));
}

/** Subscribes to an app event; returns the unsubscribe function. */
export function onAppEvent<K extends AppEventName>(
  name: K,
  handler: (detail: AppEvents[K]) => void,
): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<AppEvents[K]>).detail);
  window.addEventListener(`diffdeck:${name}`, listener);
  return () => window.removeEventListener(`diffdeck:${name}`, listener);
}
