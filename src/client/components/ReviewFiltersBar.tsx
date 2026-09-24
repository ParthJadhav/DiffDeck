import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { anchoredPanelPlacement, type PanelSide } from "../lib/anchoredPanel.js";
import type { FileOrder, ReviewFilters } from "../lib/reviewSession.js";
import { cn } from "../lib/cn.js";
import { Button } from "./ui/button.js";
import { Checkbox } from "./ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js";

const emptyFilters: ReviewFilters = {
  binary: false,
  changeSizes: [],
  conflicts: false,
  dependency: false,
  extensions: [],
  hideDeleted: false,
  hideGenerated: false,
  hideLock: false,
  hideViewed: false,
  path: "",
  statuses: [],
};

export function ReviewFiltersBar({
  fileOrder,
  filters,
  onChange,
  onFileOrderChange,
  resultCount,
  totalCount,
}: {
  fileOrder: FileOrder;
  filters: ReviewFilters;
  onChange: (filters: ReviewFilters) => void;
  onFileOrderChange: (order: FileOrder) => void;
  resultCount: number;
  totalCount: number;
}) {
  const activeCount = countActiveFilters(filters);
  const [open, setOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [panelSide, setPanelSide] = useState<PanelSide>("below");
  const panelId = useId();
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDialogElement | null>(null);
  const pathInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const set = <K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const updatePanelPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect == null) return;
    const placement = anchoredPanelPlacement(rect, 336, 280);
    setPanelSide(placement.side);
    setPanelStyle(placement.style);
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
    const handleOpenRequest = () => setOpen(true);
    window.addEventListener("diffdeck:open-filters", handleOpenRequest);
    return () => window.removeEventListener("diffdeck:open-filters", handleOpenRequest);
  }, []);

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
    pathInputRef.current?.focus();

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
    <div ref={containerRef} className="flex shrink-0">
      {panelMounted ? (
        <Dialog
          open
          ref={panelRef}
          aria-labelledby={titleId}
          data-side={panelSide}
          data-state={open ? "open" : "closed"}
          id={panelId}
          style={{ ...panelStyle, overscrollBehavior: "contain" }}
          className="app-filter-popover z-50 overflow-y-auto overflow-x-hidden rounded-xl bg-popover text-popover-foreground"
        >
          <DialogContent className="border-0 bg-transparent p-3 shadow-none">
            <DialogHeader className="mb-3 gap-1 px-0.5 pr-8">
              <DialogTitle id={titleId} className="text-[13px] tracking-[-0.01em]">
                Filter review
              </DialogTitle>
              <DialogDescription className="text-[11px] leading-4">
                Showing {resultCount} of {totalCount} changed files
              </DialogDescription>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close review filters"
                onClick={() => setOpen(false)}
                className="absolute right-2.5 top-2.5 size-7 text-muted-foreground"
              >
                <X className="size-3.5" />
              </Button>
            </DialogHeader>

            <div className="space-y-3">
              <FilterField label="Review order">
                <select
                  aria-label="Review file order"
                  value={fileOrder}
                  onChange={(event) => onFileOrderChange(event.target.value as FileOrder)}
                  className="app-filter-input h-9 w-full rounded-lg border border-input bg-background px-2 text-[11.5px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="path">By path — follows the folder tree</option>
                  <option value="status">By status — conflicts, then modified, added…</option>
                  <option value="size">By change size — largest first</option>
                </select>
              </FilterField>

              <FilterField label="Path contains">
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    ref={pathInputRef}
                    id="diffdeck-review-filter"
                    aria-label="Filter changed files by path"
                    value={filters.path}
                    onChange={(event) => set("path", event.target.value)}
                    placeholder="src/components"
                    className="app-filter-input h-9 w-full rounded-lg border border-input bg-background pl-8 pr-8 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  {filters.path.length > 0 ? (
                    <button
                      type="button"
                      aria-label="Clear path filter"
                      onClick={() => set("path", "")}
                      className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
              </FilterField>

              <fieldset>
                <legend className="app-filter-label mb-1.5">Quick filters</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  <FilterCheck
                    label="Hide viewed"
                    checked={filters.hideViewed}
                    onChange={(value) => set("hideViewed", value)}
                  />
                  <FilterCheck
                    label="Conflicts only"
                    checked={filters.conflicts}
                    onChange={(value) => set("conflicts", value)}
                  />
                  <FilterCheck
                    label="Binary only"
                    checked={filters.binary}
                    onChange={(value) => set("binary", value)}
                  />
                  <FilterCheck
                    label="Dependencies"
                    checked={filters.dependency}
                    onChange={(value) => set("dependency", value)}
                  />
                  <FilterCheck
                    label="Hide deleted"
                    checked={filters.hideDeleted}
                    onChange={(value) => set("hideDeleted", value)}
                  />
                  <FilterCheck
                    label="Hide generated"
                    checked={filters.hideGenerated}
                    onChange={(value) => set("hideGenerated", value)}
                  />
                  <FilterCheck
                    label="Hide lockfiles"
                    checked={filters.hideLock}
                    onChange={(value) => set("hideLock", value)}
                  />
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-2">
                <FilterField label="Change size">
                  <select
                    aria-label="Filter by change size"
                    value={filters.changeSizes[0] ?? ""}
                    onChange={(event) =>
                      set("changeSizes", event.target.value ? [event.target.value] : [])
                    }
                    className="app-filter-input h-9 w-full rounded-lg border border-input bg-background px-2 text-[11.5px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">Any size</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </FilterField>
                <FilterField label="Git status">
                  <select
                    aria-label="Filter by Git status"
                    value={filters.statuses[0] ?? ""}
                    onChange={(event) =>
                      set("statuses", event.target.value ? [event.target.value] : [])
                    }
                    className="app-filter-input h-9 w-full rounded-lg border border-input bg-background px-2 text-[11.5px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">Any status</option>
                    <option value="added">Added</option>
                    <option value="modified">Modified</option>
                    <option value="deleted">Deleted</option>
                    <option value="renamed">Renamed</option>
                  </select>
                </FilterField>
              </div>

              <FilterField label="File extensions">
                <input
                  aria-label="Filter by file extensions"
                  placeholder="ts, tsx, css"
                  value={filters.extensions.join(", ")}
                  onChange={(event) =>
                    set(
                      "extensions",
                      event.target.value
                        .split(",")
                        .map((value) => value.trim().replace(/^\./, "").toLowerCase())
                        .filter(Boolean),
                    )
                  }
                  className="app-filter-input h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </FilterField>
            </div>

            <DialogFooter className="mt-3 flex-row items-center justify-between border-t border-border/70 pt-3 sm:justify-between">
              <span className="text-[10.5px] text-muted-foreground">
                {activeCount === 0
                  ? "No filters applied"
                  : `${activeCount} ${activeCount === 1 ? "filter" : "filters"} applied`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={activeCount === 0}
                onClick={() => onChange(emptyFilters)}
                className="text-muted-foreground"
              >
                Clear filters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <FilterTrigger
        activeCount={activeCount}
        onClick={() => setOpen((value) => !value)}
        open={open}
        panelId={panelId}
        ref={triggerRef}
        resultCount={resultCount}
        totalCount={totalCount}
      />
    </div>
  );
}

function FilterTrigger({
  activeCount,
  onClick,
  open,
  panelId,
  ref,
  resultCount,
  totalCount,
}: {
  activeCount: number;
  onClick: () => void;
  open: boolean;
  panelId: string;
  ref: React.Ref<HTMLButtonElement>;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Filter review, showing ${resultCount} of ${totalCount} files${activeCount > 0 ? `, ${activeCount} active` : ""}`}
      aria-expanded={open}
      aria-controls={panelId}
      aria-haspopup="dialog"
      title="Filter and order the review"
      onClick={onClick}
      className={cn(
        "relative size-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground [&_svg]:size-3.5",
        (open || activeCount > 0) && "bg-accent text-foreground",
      )}
    >
      <SlidersHorizontal aria-hidden="true" />
      {activeCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-info text-[8.5px] font-semibold leading-none text-background"
        >
          {activeCount}
        </span>
      ) : null}
    </Button>
  );
}

function FilterField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="app-filter-label mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function FilterCheck({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "app-filter-check flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border px-2 text-[11px] transition-[background-color,border-color,color,scale] active:scale-[0.98]",
        checked
          ? "border-info-border bg-info-muted text-foreground"
          : "border-border/70 bg-muted/25 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
      )}
    >
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="truncate">{label}</span>
    </label>
  );
}

export function countActiveFilters(filters: ReviewFilters): number {
  return [
    filters.binary,
    filters.conflicts,
    filters.dependency,
    filters.hideDeleted,
    filters.hideGenerated,
    filters.hideLock,
    filters.hideViewed,
    filters.path.length > 0,
    filters.extensions.length > 0,
    filters.statuses.length > 0,
    filters.changeSizes.length > 0,
  ].filter(Boolean).length;
}
