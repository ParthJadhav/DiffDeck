import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  Columns2,
  FileCode2,
  Image,
  List,
  Minus,
  Monitor,
  Moon,
  Rows3,
  ScrollText,
  Settings,
  SquareSplitHorizontal,
  Sun,
  WrapText,
  X,
} from "lucide-react";
import { diffLayouts, overflowModes, themeChoices } from "../lib/constants.js";
import { cn } from "../lib/cn.js";
import type { DiffLayout, OverflowMode, ThemeChoice } from "../lib/uiTypes.js";
import { Button } from "./ui/button.js";
import { Checkbox } from "./ui/checkbox.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js";
import { Label } from "./ui/label.js";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.js";

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
    <Label className="app-check-label flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 text-[11.5px] leading-none text-foreground/90 transition-[background-color,color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.98] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-popover">
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="font-medium">{children}</span>
    </Label>
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
  compact = false,
  description,
  icon,
  onClick,
  value,
}: {
  active: boolean;
  children: React.ReactNode;
  compact?: boolean;
  description?: string;
  icon: React.ReactNode;
  onClick: (value: T) => void;
  value: T;
}) {
  return (
    <ToggleGroupItem
      aria-pressed={active}
      title={description}
      onClick={() => onClick(value)}
      pressed={active}
      className={cn(
        "app-option-button group h-8 gap-1.5 text-[11.5px] leading-none",
        !active && "text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center transition-colors",
          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {icon}
      </span>
      <span className={cn("font-medium", compact && "sr-only")}>{children}</span>
    </ToggleGroupItem>
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
    <ToggleGroup className="app-control-grid" columns={columns}>
      {options.map((option) => (
        <OptionButton
          key={option}
          active={value === option}
          description={descriptions?.[option]}
          icon={icons[option]}
          compact={columns === 3}
          value={option}
          onClick={onChange}
        >
          {labels[option]}
        </OptionButton>
      ))}
    </ToggleGroup>
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
  const iconClassName = "size-3.5";
  switch (name) {
    case "bars":
      return <Columns2 aria-hidden="true" className={iconClassName} />;
    case "none":
      return <X aria-hidden="true" className={iconClassName} />;
    case "split":
      return <SquareSplitHorizontal aria-hidden="true" className={iconClassName} />;
    case "unified":
      return <Rows3 aria-hidden="true" className={iconClassName} />;
    case "custom":
      return <FileCode2 aria-hidden="true" className={iconClassName} />;
    case "layout":
      return <List aria-hidden="true" className={iconClassName} />;
    case "metadata":
      return <Image aria-hidden="true" className={iconClassName} />;
    case "simple":
      return <Minus aria-hidden="true" className={iconClassName} />;
    case "scroll":
      return <ScrollText aria-hidden="true" className={iconClassName} />;
    case "wrap":
      return <WrapText aria-hidden="true" className={iconClassName} />;
    case "light":
      return <Sun aria-hidden="true" className={iconClassName} />;
    case "dark":
      return <Moon aria-hidden="true" className={iconClassName} />;
    case "system":
      return <Monitor aria-hidden="true" className={iconClassName} />;
    default:
      return <span aria-hidden="true" className="size-1.5 rounded-sm bg-current" />;
  }
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
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const panelId = useId();
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const updatePanelPositionRef = useRef<() => void>(() => {});
  updatePanelPositionRef.current = () => {
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
  };

  useLayoutEffect(() => {
    if (!open) return;
    const updatePanelPosition = () => updatePanelPositionRef.current();
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setPanelMounted(true);
      return;
    }

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
        <Dialog
          open
          ref={panelRef}
          aria-labelledby={titleId}
          data-state={open ? "open" : "closed"}
          id={panelId}
          style={{ ...panelStyle, overscrollBehavior: "contain" }}
          className="app-settings-popover z-50 overflow-y-auto overflow-x-hidden rounded-lg bg-popover text-popover-foreground"
        >
          <DialogContent className="border-0 bg-transparent p-2 shadow-none">
            <DialogHeader
              className="app-settings-section mb-2 flex-row items-center justify-between gap-2 gap-y-0 px-0.5"
              style={{ "--settings-section-index": 0 } as CSSProperties}
            >
              <DialogTitle id={titleId} className="text-[12.5px] text-foreground">
                Diff settings
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close diff settings"
                onClick={() => setOpen(false)}
                className="size-7"
              >
                <MiniIcon name="none" />
              </Button>
            </DialogHeader>

            <div className="space-y-1.5">
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
                <div className="app-control-grid grid grid-cols-2 gap-x-1 gap-y-0 rounded-lg border border-border bg-muted p-0.5">
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
          </DialogContent>
        </Dialog>
      ) : null}

      <Button
        ref={triggerRef}
        variant="outline"
        size="icon"
        aria-label="Diff settings"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-3.5",
          open && "text-foreground",
        )}
      >
        <Settings />
      </Button>
    </div>
  );
}
