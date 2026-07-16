import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Focus,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { HunkNavigation, HunkTarget } from "../lib/hunkNavigation.js";
import type { ReviewNavigation } from "../lib/reviewNavigation.js";
import type { ReviewMode } from "../lib/reviewSession.js";
import { cn } from "../lib/cn.js";
import { Button } from "./ui/button.js";

export function ReviewNavigator({
  hunkNavigation,
  navigation,
  onNavigateHunk,
  onReviewModeChange,
  onSelectPath,
  reviewMode,
}: {
  hunkNavigation: HunkNavigation;
  navigation: ReviewNavigation;
  onNavigateHunk: (target: HunkTarget) => void;
  onReviewModeChange: (mode: ReviewMode) => void;
  onSelectPath: (path: string) => void;
  reviewMode: ReviewMode;
}) {
  const select = (path: string | null) => {
    if (path != null) onSelectPath(path);
  };

  return (
    <nav
      aria-label="Review navigation"
      className="app-review-navigator flex min-w-0 flex-wrap items-center gap-1.5"
    >
      <div className="flex h-8 shrink-0 items-center rounded-md border border-border bg-background">
        <NavigatorButton
          disabled={navigation.previousPath == null}
          label="Previous visible file"
          shortcut="K"
          onClick={() => select(navigation.previousPath)}
        >
          <ChevronLeft />
        </NavigatorButton>
        <output
          aria-label={
            navigation.position === 0
              ? `No file selected, ${navigation.total} visible files`
              : `File ${navigation.position} of ${navigation.total}`
          }
          className="min-w-10 border-x border-border px-1 text-center font-mono text-[10px] tabular-nums text-muted-foreground"
        >
          {navigation.position}/{navigation.total}
        </output>
        <NavigatorButton
          disabled={navigation.nextPath == null}
          label="Next visible file"
          shortcut="J"
          onClick={() => select(navigation.nextPath)}
        >
          <ChevronRight />
        </NavigatorButton>
      </div>

      <div className="flex h-8 shrink-0 items-center rounded-md border border-border bg-background">
        <NavigatorButton
          disabled={hunkNavigation.previous == null}
          label="Previous changed hunk"
          shortcut="P"
          onClick={() => {
            if (hunkNavigation.previous != null) onNavigateHunk(hunkNavigation.previous);
          }}
        >
          <ChevronUp />
        </NavigatorButton>
        <output
          aria-label={
            hunkNavigation.position === 0
              ? `${hunkNavigation.total} changed hunks`
              : `Hunk ${hunkNavigation.position} of ${hunkNavigation.total}`
          }
          className="min-w-10 border-x border-border px-1 text-center font-mono text-[10px] tabular-nums text-muted-foreground"
        >
          H {hunkNavigation.position}/{hunkNavigation.total}
        </output>
        <NavigatorButton
          disabled={hunkNavigation.next == null}
          label="Next changed hunk"
          shortcut="N"
          onClick={() => {
            if (hunkNavigation.next != null) onNavigateHunk(hunkNavigation.next);
          }}
        >
          <ChevronDown />
        </NavigatorButton>
      </div>

      <div className="flex h-8 shrink-0 items-center rounded-md border border-border bg-background">
        <NavigatorButton
          disabled={navigation.previousUnviewedPath == null}
          label="Previous unviewed file"
          shortcut="Shift+K"
          onClick={() => select(navigation.previousUnviewedPath)}
        >
          <SkipBack />
        </NavigatorButton>
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <NavigatorButton
          disabled={navigation.nextUnviewedPath == null}
          label="Next unviewed file"
          shortcut="Shift+J"
          onClick={() => select(navigation.nextUnviewedPath)}
        >
          <SkipForward />
        </NavigatorButton>
      </div>

      <Button
        aria-label={reviewMode === "focus" ? "Show all visible files" : "Focus selected file"}
        aria-pressed={reviewMode === "focus"}
        disabled={navigation.position === 0}
        onClick={() => onReviewModeChange(reviewMode === "focus" ? "all" : "focus")}
        size="xs"
        title={reviewMode === "focus" ? "Show all files (F)" : "Focus selected file (F)"}
        variant={reviewMode === "focus" ? "secondary" : "outline"}
        className={cn(
          "app-review-focus-button ml-auto h-8 min-w-0 gap-1.5 px-2",
          reviewMode === "focus" && "text-info-foreground",
        )}
      >
        <Focus />
        <span className="app-review-focus-label">{reviewMode === "focus" ? "All" : "Focus"}</span>
      </Button>
    </nav>
  );
}

function NavigatorButton({
  children,
  disabled,
  label,
  onClick,
  shortcut,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
  shortcut: string;
}) {
  return (
    <Button
      aria-label={label}
      className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
      disabled={disabled}
      onClick={onClick}
      size="icon"
      title={`${label} (${shortcut})`}
      variant="ghost"
    >
      {children}
    </Button>
  );
}
