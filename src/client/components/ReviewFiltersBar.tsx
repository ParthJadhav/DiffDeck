import { Search, SlidersHorizontal, X } from "lucide-react";
import type { ReviewFilters } from "../lib/reviewSession.js";
import { cn } from "../lib/cn.js";
import { Button } from "./ui/button.js";
import { Checkbox } from "./ui/checkbox.js";

export function ReviewFiltersBar({
  filters,
  onChange,
  resultCount,
  totalCount,
}: {
  filters: ReviewFilters;
  onChange: (filters: ReviewFilters) => void;
  resultCount: number;
  totalCount: number;
}) {
  const activeCount = countActiveFilters(filters);
  const set = <K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) =>
    onChange({ ...filters, [key]: value });
  const reset = () =>
    onChange({
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
    });

  return (
    <section aria-label="Review filters" className="space-y-1.5">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id="diffdeck-review-filter"
          aria-label="Filter changed files by path"
          value={filters.path}
          onChange={(event) => set("path", event.target.value)}
          placeholder="Filter paths…  /"
          className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-8 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        {filters.path.length > 0 ? (
          <button
            type="button"
            aria-label="Clear path filter"
            onClick={() => set("path", "")}
            className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
      <details className="group rounded-md border border-border bg-muted/30">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-2 px-2 text-[11.5px] font-medium">
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          Triage filters
          <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
            {resultCount}/{totalCount}
            {activeCount > 0 ? ` · ${activeCount} active` : ""}
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-border p-2">
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
          <select
            aria-label="Filter by change size"
            value={filters.changeSizes[0] ?? ""}
            onChange={(event) => set("changeSizes", event.target.value ? [event.target.value] : [])}
            className="h-7 rounded border border-input bg-background px-1 text-[11px]"
          >
            <option value="">Any size</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
          <select
            aria-label="Filter by Git status"
            value={filters.statuses[0] ?? ""}
            onChange={(event) => set("statuses", event.target.value ? [event.target.value] : [])}
            className="h-7 rounded border border-input bg-background px-1 text-[11px]"
          >
            <option value="">Any status</option>
            <option value="added">Added</option>
            <option value="modified">Modified</option>
            <option value="deleted">Deleted</option>
            <option value="renamed">Renamed</option>
          </select>
          <input
            aria-label="Filter by file extensions"
            placeholder="Extensions: ts,tsx"
            value={filters.extensions.join(",")}
            onChange={(event) =>
              set(
                "extensions",
                event.target.value
                  .split(",")
                  .map((value) => value.trim().replace(/^\./, "").toLowerCase())
                  .filter(Boolean),
              )
            }
            className="col-span-2 h-7 rounded border border-input bg-background px-2 text-[11px] outline-none focus:border-ring"
          />
          {activeCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={reset}
              className="col-span-2 h-7 text-[11px]"
            >
              Reset all filters
            </Button>
          ) : null}
        </div>
      </details>
    </section>
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
        "flex h-7 cursor-pointer items-center gap-1.5 text-[11px]",
        checked && "text-foreground",
      )}
    >
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function countActiveFilters(filters: ReviewFilters): number {
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
