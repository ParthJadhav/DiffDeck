import type { ButtonHTMLAttributes, HTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn.js";
import { Button } from "./button.js";

export interface ToggleGroupProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 2 | 3 | 4;
  ref?: Ref<HTMLDivElement>;
}

export function ToggleGroup({ children, className, columns = 2, ref, ...props }: ToggleGroupProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "grid gap-0.5 rounded-lg border border-border bg-muted p-0.5",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface ToggleGroupItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function ToggleGroupItem({
  className,
  pressed,
  ref,
  type = "button",
  ...props
}: ToggleGroupItemProps) {
  return (
    <Button
      ref={ref}
      type={type}
      variant={pressed ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={pressed}
      className={cn(
        "h-9 min-w-0 justify-center rounded-md px-2 text-[11.5px] shadow-none",
        pressed && "bg-card text-foreground shadow-sm hover:bg-card",
        className,
      )}
      {...props}
    />
  );
}
