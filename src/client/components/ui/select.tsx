import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, style, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-8 items-center rounded-md border border-input bg-background text-foreground px-2 py-1 pr-7 text-xs shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 ease-out hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        "appearance-none bg-no-repeat bg-[right_0.4rem_center] bg-[length:0.65rem]",
        "bg-[image:var(--select-chevron)]",
        className,
      )}
      style={{
        ["--select-chevron" as string]:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M3 4.5l3 3 3-3'/></svg>\")",
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
