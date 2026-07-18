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

/**
 * File and hunk stepping, rendered as one segmented bar. Four separately
 * bordered groups did not fit the sidebar at its default width and wrapped
 * into a ragged second row, so the groups share a single frame and the hunk
 * counter drops out first when the sidebar is narrow.
 */
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

  const hunkSuffix =
    hunkNavigation.total === 0
      ? ""
      : hunkNavigation.position === 0
        ? ` — ${hunkNavigation.total} in this file`
        : ` — ${hunkNavigation.position} of ${hunkNavigation.total}`;

  return (
    <nav
      aria-label="Review navigation"
      className="app-review-navigator flex h-8 min-w-0 items-center rounded-md border border-border bg-background"
    >
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
        className="min-w-10 flex-1 px-1 text-center font-mono text-[11px] tabular-nums text-muted-foreground"
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

      <Divider />

      <NavigatorButton
        disabled={navigation.previousUnviewedPath == null}
        label="Previous unviewed file"
        shortcut="Shift+K"
        onClick={() => select(navigation.previousUnviewedPath)}
      >
        <SkipBack />
      </NavigatorButton>
      <NavigatorButton
        disabled={navigation.nextUnviewedPath == null}
        label="Next unviewed file"
        shortcut="Shift+J"
        onClick={() => select(navigation.nextUnviewedPath)}
      >
        <SkipForward />
      </NavigatorButton>

      <Divider />

      <NavigatorButton
        disabled={hunkNavigation.previous == null}
        label="Previous changed hunk"
        shortcut="P"
        suffix={hunkSuffix}
        onClick={() => {
          if (hunkNavigation.previous != null) onNavigateHunk(hunkNavigation.previous);
        }}
      >
        <ChevronUp />
      </NavigatorButton>
      <output
        aria-hidden="true"
        className="app-review-hunk-count min-w-0 px-0.5 text-center font-mono text-[11px] tabular-nums text-muted-foreground"
      >
        {hunkNavigation.position}/{hunkNavigation.total}
      </output>
      <NavigatorButton
        disabled={hunkNavigation.next == null}
        label="Next changed hunk"
        shortcut="N"
        suffix={hunkSuffix}
        onClick={() => {
          if (hunkNavigation.next != null) onNavigateHunk(hunkNavigation.next);
        }}
      >
        <ChevronDown />
      </NavigatorButton>

      <Divider />

      <Button
        aria-label={reviewMode === "focus" ? "Show all visible files" : "Focus selected file"}
        aria-pressed={reviewMode === "focus"}
        className={cn(
          "app-nav-button size-7 shrink-0 rounded-sm text-muted-foreground hover:text-foreground",
          reviewMode === "focus" && "bg-accent text-info-foreground",
        )}
        disabled={navigation.position === 0}
        onClick={() => onReviewModeChange(reviewMode === "focus" ? "all" : "focus")}
        size="icon"
        title={reviewMode === "focus" ? "Show all files (F)" : "Focus selected file (F)"}
        variant="ghost"
      >
        <Focus />
      </Button>
    </nav>
  );
}

function Divider() {
  return <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />;
}

function NavigatorButton({
  children,
  disabled,
  label,
  onClick,
  shortcut,
  suffix = "",
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
  shortcut: string;
  suffix?: string;
}) {
  return (
    <Button
      aria-label={label}
      className="app-nav-button size-7 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
      disabled={disabled}
      onClick={onClick}
      size="icon"
      title={`${label} (${shortcut})${suffix}`}
      variant="ghost"
    >
      {children}
    </Button>
  );
}
