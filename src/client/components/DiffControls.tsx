import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { diffLayouts, overflowModes, themeChoices } from "../lib/constants.js";
import { cn } from "../lib/cn.js";
import type { DiffLayout, OverflowMode, ThemeChoice } from "../lib/uiTypes.js";
import { Checkbox } from "./ui/checkbox.js";

export interface DiffControlsProps {
  diffStyle: DiffLayout;
  disableBackground: boolean;
  expandUnchanged: boolean;
  onDiffStyleChange: (value: DiffLayout) => void;
  onDisableBackgroundChange: (value: boolean) => void;
  onExpandUnchangedChange: (value: boolean) => void;
  onOverflowChange: (value: OverflowMode) => void;
  onShowLineNumbersChange: (value: boolean) => void;
  onThemeTypeChange: (value: ThemeChoice) => void;
  overflow: OverflowMode;
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
    <label className="app-check-label group flex h-10 cursor-pointer select-none items-center gap-2 rounded-[6px] px-1.5 text-[12px] leading-none text-foreground/90 transition-[background-color,box-shadow,color,scale] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.98] active:duration-75 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-popover">
      <span
        className={cn(
          "app-check-box relative inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3.5px] transition-[background-color,box-shadow] duration-150 ease-out",
          checked
            ? "bg-foreground text-background shadow-[inset_0_0_0_1px_oklch(var(--foreground))]"
            : "bg-transparent shadow-[inset_0_0_0_1px_oklch(var(--border))] group-hover:shadow-[inset_0_0_0_1px_oklch(var(--muted-foreground)/0.7)]",
        )}
      >
        <Checkbox
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        {checked ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="h-[10px] w-[10px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 6.2l2.4 2.4L9.5 3.7" />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0 truncate font-medium">{children}</span>
    </label>
  );
}

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
    <div className="px-0.5 text-[10px] font-semibold uppercase text-muted-foreground/80">
      {children}
    </div>
  );
}

function ControlSection({
  children,
  index,
  label,
}: {
  children: React.ReactNode;
  index: number;
  label: string;
}) {
  return (
    <section
      className="app-settings-section space-y-1"
      style={{ "--settings-section-index": index } as CSSProperties}
    >
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
        "app-option-button group flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[6px] px-2 text-left text-[11.5px] transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        active
          ? "app-option-button-active text-foreground"
          : "bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center transition-colors",
          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
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
        "app-control-grid grid gap-0.5 rounded-lg p-0.5",
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

function MiniIcon({
  name,
}: {
  name:
    | "bars"
    | "custom"
    | "dark"
    | "layout"
    | "light"
    | "metadata"
    | "none"
    | "scroll"
    | "simple"
    | "split"
    | "system"
    | "unified"
    | "wrap";
}) {
  switch (name) {
    case "bars":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M3 2h2v12H3zM7 4h6v2H7zM7 10h6v2H7z" />
        </svg>
      );
    case "none":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      );
    case "split":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2.5" y="3" width="4.5" height="10" rx="1" />
          <rect x="9" y="3" width="4.5" height="10" rx="1" />
        </svg>
      );
    case "unified":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="10" height="10" rx="1.5" />
          <path d="M5 6h6M5 8h6M5 10h4" />
        </svg>
      );
    case "custom":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" />
        </svg>
      );
    case "layout":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M3 4.5h10M3 8h7M3 11.5h10" />
          <path d="M12 7l1.5 1L12 9" />
        </svg>
      );
    case "metadata":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="10" height="10" rx="1.5" />
          <path d="M5 6h6M5 8.5h4" />
        </svg>
      );
    case "simple":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M3 8h10" />
        </svg>
      );
    case "scroll":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M3 5h8M3 8h10M3 11h7M12 4l2 2-2 2" />
        </svg>
      );
    case "wrap":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 5h8a2 2 0 010 4H6M8 7l-2 2 2 2" />
        </svg>
      );
    case "light":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9" />
        </svg>
      );
    case "dark":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M9.5 14A5.8 5.8 0 017.7 2.7 5 5 0 0013.3 9a5.8 5.8 0 01-3.8 5z" />
        </svg>
      );
    case "system":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2.5" y="3" width="11" height="8" rx="1.5" />
          <path d="M6 13h4M8 11v2" />
        </svg>
      );
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
    diffStyle,
    disableBackground,
    expandUnchanged,
    onDiffStyleChange,
    onDisableBackgroundChange,
    onExpandUnchangedChange,
    onOverflowChange,
    onShowLineNumbersChange,
    onThemeTypeChange,
    overflow,
    showLineNumbers,
    themeType,
  } = props;

  const [open, setOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelState, setPanelState] = useState<"closed" | "open">("closed");
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const panelId = useId();
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const updatePanelPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect == null) return;

    const margin = 12;
    const width = Math.min(280, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    const bottom = 12;
    const maxHeight = Math.max(240, window.innerHeight - bottom - margin);

    setPanelStyle({
      bottom,
      left,
      maxHeight,
      position: "fixed",
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (open) {
      setPanelMounted(true);
      const frame = window.requestAnimationFrame(() => setPanelState("open"));
      return () => window.cancelAnimationFrame(frame);
    }

    setPanelState("closed");
    if (!panelMounted) return;

    const timer = window.setTimeout(() => setPanelMounted(false), 140);
    return () => window.clearTimeout(timer);
  }, [open, panelMounted]);

  useEffect(() => {
    if (!open || !panelMounted) return;
    const node = panelRef.current?.querySelector<HTMLElement>("button, input");
    node?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current != null && !containerRef.current.contains(event.target as Node)) {
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
  }, [open, panelMounted]);

  return (
    <div ref={containerRef} className="flex shrink-0 flex-col gap-2">
      {panelMounted ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          data-state={panelState}
          id={panelId}
          style={{ ...panelStyle, overscrollBehavior: "contain" }}
          className="app-settings-popover z-50 overflow-y-auto overflow-x-hidden rounded-2xl bg-popover p-2 text-popover-foreground"
        >
          <div
            className="app-settings-section mb-2 flex items-center justify-between gap-2 px-0.5"
            style={{ "--settings-section-index": 0 } as CSSProperties}
          >
            <div id={titleId} className="text-[12.5px] font-semibold leading-none text-foreground">
              Diff settings
            </div>
            <button
              type="button"
              aria-label="Close diff settings"
              onClick={() => setOpen(false)}
              className="app-icon-btn h-7 w-7"
            >
              <MiniIcon name="none" />
            </button>
          </div>

          <div className="space-y-2">
            <ControlSection label="Layout" index={1}>
              <OptionGrid
                labels={{ split: "Split", unified: "Unified" }}
                descriptions={{
                  split: "Side by side",
                  unified: "Single column",
                }}
                icons={{
                  split: <MiniIcon name="split" />,
                  unified: <MiniIcon name="unified" />,
                }}
                options={diffLayouts}
                value={diffStyle}
                onChange={onDiffStyleChange}
              />
            </ControlSection>

            <ControlSection label="Flow" index={2}>
              <OptionGrid
                labels={overflowLabels}
                descriptions={{
                  scroll: "Keep long lines",
                  wrap: "Wrap long lines",
                }}
                icons={{
                  scroll: <MiniIcon name="scroll" />,
                  wrap: <MiniIcon name="wrap" />,
                }}
                options={overflowModes}
                value={overflow}
                onChange={onOverflowChange}
              />
            </ControlSection>

            <ControlSection label="Theme" index={3}>
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

            <ControlSection label="Options" index={4}>
              <div className="app-control-grid grid grid-cols-2 gap-x-1 gap-y-0 rounded-[10px] p-1">
                <CheckLabel checked={showLineNumbers} onChange={onShowLineNumbersChange}>
                  Line nums
                </CheckLabel>
                <CheckLabel checked={expandUnchanged} onChange={onExpandUnchangedChange}>
                  Unchanged
                </CheckLabel>
                <CheckLabel
                  checked={!disableBackground}
                  onChange={(checked) => onDisableBackgroundChange(!checked)}
                >
                  Backgrounds
                </CheckLabel>
              </div>
            </ControlSection>
          </div>
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        aria-label="Diff settings"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "app-sidebar-action inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,box-shadow,scale] duration-150 hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open && "text-foreground",
        )}
      >
        <GearIcon />
      </button>
    </div>
  );
}
