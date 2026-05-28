import { Children, isValidElement } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "../lib/cn.js";
import { Card, CardContent } from "./ui/card.js";

export function ShellState({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "error";
}) {
  const text = childrenToString(children);
  const isLoading = variant === "default" && /…\s*$/.test(text);
  const stripped = isLoading ? text.replace(/…\s*$/, "") : text;

  return (
    <div className="grid h-screen place-items-center bg-background p-8 text-center">
      <Card
        role={variant === "error" ? "alert" : "status"}
        aria-live={variant === "error" ? "assertive" : "polite"}
        aria-busy={isLoading || undefined}
        className={cn(
          "max-w-md border-border",
          variant === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <CardContent className="p-4 text-sm">
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              <span>{stripped.trimEnd()}</span>
              <span className="sr-only">Loading</span>
            </span>
          ) : (
            children
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function childrenToString(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childrenToString).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return Children.toArray(props.children).map(childrenToString).join("");
  }
  return "";
}
