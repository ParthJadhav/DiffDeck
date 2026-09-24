import type { CSSProperties } from "react";

export type PanelSide = "above" | "below";

/**
 * Fixed-position placement for a popover anchored to a trigger. Triggers in
 * the top half open downward (sidebar header/toolbar); lower triggers keep
 * opening upward so the panel never runs off the viewport.
 */
export function anchoredPanelPlacement(
  trigger: DOMRect,
  preferredWidth: number,
  minHeight: number,
): { side: PanelSide; style: CSSProperties } {
  const margin = 12;
  const gap = 6;
  const width = Math.min(preferredWidth, window.innerWidth - margin * 2);
  const left = Math.min(Math.max(margin, trigger.left), window.innerWidth - width - margin);

  if (trigger.top < window.innerHeight / 2) {
    const top = trigger.bottom + gap;
    return {
      side: "below",
      style: {
        left,
        maxHeight: Math.max(minHeight, window.innerHeight - top - margin),
        position: "fixed",
        top,
        width,
      },
    };
  }
  return {
    side: "above",
    style: {
      bottom: margin,
      left,
      maxHeight: Math.max(minHeight, window.innerHeight - margin * 2),
      position: "fixed",
      width,
    },
  };
}
