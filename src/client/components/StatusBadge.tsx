import { toneBadgeVariant, toneTextClass, type Tone } from "../lib/tone.js";
import { Badge } from "./ui/badge.js";
import { cn } from "../lib/cn.js";

export function StatusBadge({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  const variant = toneBadgeVariant(tone);
  return (
    <Badge
      variant={variant}
      className={cn(variant === "outline" && toneTextClass(tone))}
    >
      {children}
    </Badge>
  );
}

const toneDotBg: Record<Tone, string> = {
  added: "bg-diff-added",
  deleted: "bg-diff-deleted",
  renamed: "bg-diff-renamed",
  modified: "bg-diff-modified",
  untracked: "bg-diff-modified",
  muted: "bg-muted-foreground",
};

export function StatusDot({ tone, title }: { tone: Tone; title?: string }) {
  return (
    <span
      role={title != null ? "img" : undefined}
      aria-label={title}
      aria-hidden={title == null || undefined}
      title={title}
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full ring-2 ring-background",
        toneDotBg[tone],
      )}
    />
  );
}
