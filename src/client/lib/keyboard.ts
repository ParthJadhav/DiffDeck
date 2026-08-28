/**
 * One keyboard policy for the whole app.
 *
 * Priority order when a key is pressed:
 *   1. Text entry wins. If focus is in an input, textarea, select, or
 *      contenteditable (including inside open shadow roots), the key is typing.
 *   2. Overlays own the keyboard. While a modal dialog is open, or focus is
 *      inside a popover/menu/palette, global single-key shortcuts stay quiet.
 *   3. Otherwise the global shortcut layer runs.
 *
 * Composition (IME) events are never shortcuts, and auto-repeat only drives
 * navigation, never toggles.
 */

const TEXT_ENTRY_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const OVERLAY_SELECTOR = "dialog[open], [role='dialog'], [data-diffdeck-shortcuts-disabled]";

export function isTextEntryElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) {
    return !TEXT_ENTRY_INPUT_TYPES.has(target.type);
  }
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const role = target.getAttribute("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

/** The focused element, following open shadow roots down to the real leaf. */
export function getDeepActiveElement(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement != null) active = active.shadowRoot.activeElement;
  return active;
}

export function isTextEntryActive(): boolean {
  return isTextEntryElement(getDeepActiveElement());
}

/** True when the event originated from typing in a text field (through shadow DOM). */
export function isTextEntryEvent(event: Event): boolean {
  return event.composedPath().some(isTextEntryElement);
}

export function isModalDialogOpen(): boolean {
  try {
    return document.querySelector("dialog:modal") != null;
  } catch {
    // Browsers without :modal support: fall back to any open dialog element.
    return document.querySelector("dialog[open]") != null;
  }
}

function isCompositionEvent(event: KeyboardEvent): boolean {
  // keyCode 229 is the legacy IME signal some browsers still emit before
  // compositionstart, when isComposing is not yet true.
  return event.isComposing || event.keyCode === 229;
}

/**
 * Whether the global shortcut layer must stay out of the way for this key.
 */
export function shouldIgnoreShortcutEvent(event: KeyboardEvent): boolean {
  if (isCompositionEvent(event)) return true;
  if (isModalDialogOpen()) return true;
  return event.composedPath().some((target) => {
    if (!(target instanceof Element)) return false;
    return isTextEntryElement(target) || target.matches(OVERLAY_SELECTOR);
  });
}

/**
 * Cmd+Enter or Ctrl+Enter submits a composer. Both chords are accepted on
 * every platform (as GitHub does) so a reviewer's habit from another OS still
 * works; the hint text shows the native one. Never fires during composition.
 */
export function isSubmitShortcut(event: KeyboardEvent): boolean {
  if (isCompositionEvent(event) || event.key !== "Enter") return false;
  return event.metaKey || event.ctrlKey;
}

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Platform-aware label for the submit chord shown next to composers. */
export function submitShortcutLabel(): string {
  return isApplePlatform() ? "⌘↩" : "Ctrl+↩";
}

/**
 * Place the caret at the end of a text field before the reviewer starts
 * typing; `autoFocus` alone leaves it at the start of existing text.
 */
export function focusTextEnd(field: HTMLInputElement | HTMLTextAreaElement | null): void {
  if (field == null) return;
  field.focus({ preventScroll: true });
  const end = field.value.length;
  field.setSelectionRange(end, end);
}
