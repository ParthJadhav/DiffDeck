import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn.js";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

export function Card({ className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ref, ...props }: CardProps) {
  return <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4", className)} {...props} />;
}

export function CardTitle({ className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn("font-semibold leading-none tracking-normal", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ref, ...props }: CardProps) {
  return <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ref, ...props }: CardProps) {
  return <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ref, ...props }: CardProps) {
  return <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />;
}
