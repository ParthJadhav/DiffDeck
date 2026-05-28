import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn.js";

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  ref?: Ref<HTMLDivElement>;
}

export function Separator({
  className,
  orientation = "horizontal",
  ref,
  ...props
}: SeparatorProps) {
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
