import { submitShortcutLabel } from "../../lib/keyboard.js";

/**
 * Tells the reviewer how to hand the keyboard back: while a composer has
 * focus every letter is typing, so the only ways out are the submit chord and
 * Escape. Rendered as plain text so it never competes with the buttons.
 */
export function ComposerHint({ action }: { action: "add" | "comment" | "save" }) {
  return (
    <span className="ml-auto whitespace-nowrap font-sans text-[10px] leading-none text-muted-foreground">
      <kbd className="font-mono">{submitShortcutLabel()}</kbd> to {action} ·{" "}
      <kbd className="font-mono">Esc</kbd> to leave
    </span>
  );
}
