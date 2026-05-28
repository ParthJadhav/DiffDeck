import type { DialogHTMLAttributes, HTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn.js";

export interface DialogProps extends DialogHTMLAttributes<HTMLDialogElement> {
  ref?: Ref<HTMLDialogElement>;
}

export function Dialog({ className, ref, ...props }: DialogProps) {
  return (
    <dialog ref={ref} className={cn("m-0 border-0 bg-transparent p-0", className)} {...props} />
  );
}

export interface DialogPartProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

export function DialogContent({ className, ref, ...props }: DialogPartProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

export function DialogHeader({ className, ref, ...props }: DialogPartProps) {
  return <div ref={ref} className={cn("flex flex-col gap-y-1.5", className)} {...props} />;
}

export function DialogTitle({ className, ref, ...props }: DialogPartProps) {
  return (
    <div ref={ref} className={cn("text-sm font-semibold leading-none", className)} {...props} />
  );
}

export function DialogDescription({ className, ref, ...props }: DialogPartProps) {
  return <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function DialogFooter({ className, ref, ...props }: DialogPartProps) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}
