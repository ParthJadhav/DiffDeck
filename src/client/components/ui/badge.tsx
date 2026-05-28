import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn.js";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-sm",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow-sm",
        outline: "border-border text-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-diff-added/30 bg-diff-added/10 text-diff-added",
        warning: "border-warning-border/80 bg-warning-muted text-warning-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  ref?: Ref<HTMLSpanElement>;
}

export function Badge({ className, ref, variant, ...props }: BadgeProps) {
  return <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
