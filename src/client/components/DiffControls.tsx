import { useEffect, useRef, useState } from "react";
import type { SelectedLineRange } from "@pierre/diffs";
import {
  diffIndicatorModes,
  diffLayouts,
  diffLineModes,
  diffViews,
  hunkSeparatorModes,
  overflowModes,
  themeChoices,
} from "../lib/constants.js";
import { getSelectionSummary } from "../lib/diff.js";
import { cn } from "../lib/cn.js";
import type {
  DiffIndicatorMode,
  DiffLayout,
  DiffLineMode,
  DiffView,
  HunkSeparatorMode,
  OverflowMode,
  ThemeChoice,
} from "../lib/uiTypes.js";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs.js";
import { Checkbox } from "./ui/checkbox.js";

export interface DiffControlsProps {
  collapsed: boolean;
  diffIndicators: DiffIndicatorMode;
  diffStyle: DiffLayout;
  diffView: DiffView;
  disableBackground: boolean;
  expandUnchanged: boolean;
  hunkSeparators: HunkSeparatorMode;
  lineDiffType: DiffLineMode;
  onCollapsedChange: (value: boolean) => void;
  onDiffIndicatorsChange: (value: DiffIndicatorMode) => void;
  onDiffStyleChange: (value: DiffLayout) => void;
  onDiffViewChange: (value: DiffView) => void;
  onDisableBackgroundChange: (value: boolean) => void;
  onExpandUnchangedChange: (value: boolean) => void;
  onHunkSeparatorsChange: (value: HunkSeparatorMode) => void;
  onLineDiffTypeChange: (value: DiffLineMode) => void;
  onOverflowChange: (value: OverflowMode) => void;
  onShowLineNumbersChange: (value: boolean) => void;
  onThemeTypeChange: (value: ThemeChoice) => void;
  overflow: OverflowMode;
  selection: SelectedLineRange | null;
  showLineNumbers: boolean;
  themeType: ThemeChoice;
}

function CheckLabel({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="group flex cursor-pointer select-none items-center gap-2 rounded-md px-1.5 py-1 text-xs text-foreground/85 transition-colors duration-150 hover:bg-accent/60 hover:text-foreground">
      <Checkbox
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

const viewLabels: Record<DiffView, string> = {
  file: "File",
  snippet: "Snippet",
  patch: "Patch",
};

const lineLabels: Record<DiffLineMode, string> = {
  "word-alt": "Smart",
  word: "Word",
  char: "Char",
  none: "Off",
};

const overflowLabels: Record<OverflowMode, string> = {
  scroll: "Scroll",
  wrap: "Wrap",
};

const themeLabels: Record<ThemeChoice, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground/75">
      {children}
    </div>
  );
}

function ControlSection({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="space-y-1">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  );
}

function OptionButton<T extends string>({
  active,
  children,
  description,
  icon,
  onClick,
  value,
}: {
  active: boolean;
  children: React.ReactNode;
  description?: string;
  icon: React.ReactNode;
  onClick: (value: T) => void;
  value: T;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={description}
      onClick={() => onClick(value)}
      className={cn(
        "group flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-left text-[10px] transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded transition-colors",
          active ? "bg-primary-foreground/15" : "bg-background/70 text-foreground/80",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 truncate font-medium">{children}</span>
    </button>
  );
}

function OptionGrid<T extends string>({
  columns = 2,
  labels,
  descriptions,
  icons,
  onChange,
  options,
  value,
}: {
  columns?: 2 | 3 | 4;
  labels: Record<T, string>;
  descriptions?: Partial<Record<T, string>>;
  icons: Record<T, React.ReactNode>;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  return (
    <div
      className={cn(
        "grid gap-1",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-4",
      )}
    >
      {options.map((option) => (
        <OptionButton
          key={option}
          active={value === option}
          description={descriptions?.[option]}
          icon={icons[option]}
          value={option}
          onClick={onChange}
        >
          {labels[option]}
        </OptionButton>
      ))}
    </div>
  );
}

function MiniIcon({ name }: { name: "bars" | "char" | "classic" | "custom" | "dark" | "file" | "layout" | "light" | "metadata" | "none" | "patch" | "scroll" | "simple" | "snippet" | "split" | "system" | "unified" | "word" | "wrap" }) {
  switch (name) {
    case "file":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M4 2.5h5l3 3v8H4z" /><path d="M9 2.5v3h3M6 8h4M6 10.5h3" /></svg>;
    case "snippet":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4L2.5 8 6 12M10 4l3.5 4L10 12M7.2 13l1.6-10" /></svg>;
    case "patch":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4h10M3 8h10M3 12h10M5 2.5v3M11 10.5v3" /></svg>;
    case "bars":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor"><path d="M3 2h2v12H3zM7 4h6v2H7zM7 10h6v2H7z" /></svg>;
    case "classic":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 5h5M6.5 2.5v5M4 11h5" /></svg>;
    case "none":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>;
    case "split":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2.5" y="3" width="4.5" height="10" rx="1" /><rect x="9" y="3" width="4.5" height="10" rx="1" /></svg>;
    case "unified":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="10" height="10" rx="1.5" /><path d="M5 6h6M5 8h6M5 10h4" /></svg>;
    case "word":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 5.5h5M9.5 5.5h4M2.5 10.5h4M8.5 10.5h5" /></svg>;
    case "char":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 12l3-8 3 8M6 9.5h4" /></svg>;
    case "custom":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" /></svg>;
    case "layout":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4.5h10M3 8h7M3 11.5h10" /><path d="M12 7l1.5 1L12 9" /></svg>;
    case "metadata":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="10" height="10" rx="1.5" /><path d="M5 6h6M5 8.5h4" /></svg>;
    case "simple":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 8h10" /></svg>;
    case "scroll":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h8M3 8h10M3 11h7M12 4l2 2-2 2" /></svg>;
    case "wrap":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h8a2 2 0 010 4H6M8 7l-2 2 2 2" /></svg>;
    case "light":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9" /></svg>;
    case "dark":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor"><path d="M9.5 14A5.8 5.8 0 017.7 2.7 5 5 0 0013.3 9a5.8 5.8 0 01-3.8 5z" /></svg>;
    case "system":
      return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2.5" y="3" width="11" height="8" rx="1.5" /><path d="M6 13h4M8 11v2" /></svg>;
    default:
      return <span aria-hidden="true" className="h-1.5 w-1.5 rounded-sm bg-current" />;
  }
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function DiffControls(props: DiffControlsProps) {
  const {
    collapsed,
    diffIndicators,
    diffStyle,
    diffView,
    disableBackground,
    expandUnchanged,
    hunkSeparators,
    lineDiffType,
    onCollapsedChange,
    onDiffIndicatorsChange,
    onDiffStyleChange,
    onDiffViewChange,
    onDisableBackgroundChange,
    onExpandUnchangedChange,
    onHunkSeparatorsChange,
    onLineDiffTypeChange,
    onOverflowChange,
    onShowLineNumbersChange,
    onThemeTypeChange,
    overflow,
    selection,
    showLineNumbers,
    themeType,
  } = props;

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = containerRef.current?.querySelector<HTMLElement>(
      '[role="tab"][data-state="active"], button, input',
    );
    node?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current != null &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="flex w-full flex-col gap-2">
      {open ? (
        <div
          role="group"
          aria-label="Diff settings"
          style={{ overscrollBehavior: "contain" }}
          className="max-h-[min(26rem,64vh)] overflow-y-auto overflow-x-hidden rounded-md bg-popover p-2 text-popover-foreground shadow-[0_0_0_1px_hsl(var(--border)/0.72),0_10px_24px_hsl(0_0%_0%/0.16)]"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-foreground">Diff settings</div>
            <button
              type="button"
              aria-label="Close diff settings"
              onClick={() => setOpen(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MiniIcon name="none" />
            </button>
          </div>

          <div className="space-y-2.5">
            <ControlSection label="View">
              <Tabs
                value={diffView}
                onValueChange={(v) => onDiffViewChange(v as DiffView)}
              >
                <TabsList className="h-6 w-full rounded-md p-0.5">
                  {diffViews.map((view) => (
                    <TabsTrigger key={view} value={view} className="h-5 flex-1 gap-1 px-1.5 text-[10px]">
                      <MiniIcon name={view === "file" ? "file" : view === "snippet" ? "snippet" : "patch"} />
                      {viewLabels[view]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </ControlSection>

            <ControlSection label="Layout">
              <OptionGrid
                labels={{ split: "Split", unified: "Unified" }}
                descriptions={{ split: "Side by side", unified: "Single column" }}
                icons={{ split: <MiniIcon name="split" />, unified: <MiniIcon name="unified" /> }}
                options={diffLayouts}
                value={diffStyle}
                onChange={onDiffStyleChange}
              />
            </ControlSection>

            <ControlSection label="Change style">
              <OptionGrid
                labels={{ bars: "Bars", classic: "+/-", none: "None" }}
                descriptions={{ bars: "Color rail", classic: "+/- marks", none: "Clean lines" }}
                icons={{
                  bars: <MiniIcon name="bars" />,
                  classic: <MiniIcon name="classic" />,
                  none: <MiniIcon name="none" />,
                }}
                options={diffIndicatorModes}
                value={diffIndicators}
                onChange={onDiffIndicatorsChange}
                columns={3}
              />
            </ControlSection>

            <ControlSection label="Inline diff">
              <OptionGrid
                labels={lineLabels}
                descriptions={{ "word-alt": "Best match", word: "Words", char: "Letters", none: "Line only" }}
                icons={{
                  "word-alt": <MiniIcon name="word" />,
                  word: <MiniIcon name="word" />,
                  char: <MiniIcon name="char" />,
                  none: <MiniIcon name="none" />,
                }}
                options={diffLineModes}
                value={lineDiffType}
                onChange={onLineDiffTypeChange}
                columns={4}
              />
            </ControlSection>

            <ControlSection label="Hunks">
              <OptionGrid
                labels={{
                  "line-info": "Info",
                  "line-info-basic": "Basic",
                  metadata: "Meta",
                  simple: "Simple",
                  custom: "Custom",
                }}
                descriptions={{
                  "line-info": "Expanded label",
                  "line-info-basic": "Compact built-in",
                  metadata: "Patch metadata",
                  simple: "Spacer only",
                  custom: "Custom CSS",
                }}
                icons={{
                  "line-info": <MiniIcon name="layout" />,
                  "line-info-basic": <MiniIcon name="bars" />,
                  metadata: <MiniIcon name="metadata" />,
                  simple: <MiniIcon name="simple" />,
                  custom: <MiniIcon name="custom" />,
                }}
                options={hunkSeparatorModes}
                value={hunkSeparators}
                onChange={onHunkSeparatorsChange}
                columns={3}
              />
            </ControlSection>

            <ControlSection label="Flow">
              <OptionGrid
                labels={overflowLabels}
                descriptions={{ scroll: "Keep long lines", wrap: "Wrap long lines" }}
                icons={{ scroll: <MiniIcon name="scroll" />, wrap: <MiniIcon name="wrap" /> }}
                options={overflowModes}
                value={overflow}
                onChange={onOverflowChange}
              />
            </ControlSection>

            <ControlSection label="Theme">
              <OptionGrid
                labels={themeLabels}
                icons={{
                  system: <MiniIcon name="system" />,
                  light: <MiniIcon name="light" />,
                  dark: <MiniIcon name="dark" />,
                }}
                options={themeChoices}
                value={themeType}
                onChange={onThemeTypeChange}
                columns={3}
              />
            </ControlSection>

            <ControlSection label="Options">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <CheckLabel checked={showLineNumbers} onChange={onShowLineNumbersChange}>
                  Line Numbers
                </CheckLabel>
                <CheckLabel checked={expandUnchanged} onChange={onExpandUnchangedChange}>
                  Expand Unchanged
                </CheckLabel>
                <CheckLabel checked={collapsed} onChange={onCollapsedChange}>
                  Collapse All
                </CheckLabel>
                <CheckLabel checked={!disableBackground} onChange={(checked) => onDisableBackgroundChange(!checked)}>
                  Backgrounds
                </CheckLabel>
              </div>
            </ControlSection>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Diff settings"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,box-shadow,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            open && "bg-accent text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]",
          )}
        >
          <GearIcon />
        </button>
        <span
          className={cn(
            "min-w-0 truncate text-right font-mono text-[11px] tabular-nums transition-opacity duration-200",
            selection != null ? "text-foreground" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {getSelectionSummary(selection)}
        </span>
      </div>
    </div>
  );
}
