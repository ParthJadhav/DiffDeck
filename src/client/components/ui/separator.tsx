import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn.js";

export interface SeparatorProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
  ref?: Ref<HTMLHRElement>;
}

export function Separator({
  className,
  orientation = "horizontal",
  ref,
  ...props
}: SeparatorProps) {
  return (
    <hr
      ref={ref}
      aria-orientation={orientation === "vertical" ? orientation : undefined}
      className={cn(
        "shrink-0 border-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
