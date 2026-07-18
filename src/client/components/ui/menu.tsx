import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn.js";
import { Button } from "./button.js";

const MARGIN = 8;
const MENU_WIDTH = 208;
const FOCUSABLE = "button:not(:disabled), select:not(:disabled), [href]";

/**
 * Anchored popup menu built on the same fixed-position `<dialog>` pattern the
 * settings and filter popovers use, so all three share one look and one set of
 * dismiss semantics without pulling in a menu dependency.
 */
export function Menu({
  align = "end",
  children,
  className,
  icon,
  label,
  triggerClassName,
}: {
  align?: "start" | "end";
  children: (close: () => void) => ReactNode;
  className?: string;
  icon: ReactNode;
  label: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect == null) return;
      const width = Math.min(MENU_WIDTH, window.innerWidth - MARGIN * 2);
      const preferredLeft = align === "end" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(MARGIN, preferredLeft), window.innerWidth - width - MARGIN);
      const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
      const spaceAbove = rect.top - MARGIN;
      const below = spaceBelow >= Math.min(240, spaceAbove);
      setStyle({
        left,
        maxHeight: Math.max(160, (below ? spaceBelow : spaceAbove) - 4),
        position: "fixed",
        width,
        ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [align, open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        panelRef.current?.contains(target) !== true &&
        triggerRef.current?.contains(target) !== true
      ) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = (current + delta + items.length) % items.length;
      items[next]?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  return (
    <>
      <Button
        ref={triggerRef}
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={cn(
          "size-7 rounded-md text-muted-foreground hover:text-foreground",
          open && "bg-accent text-foreground",
          triggerClassName,
        )}
        onClick={() => setOpen((value) => !value)}
        size="icon"
        title={label}
        variant="ghost"
      >
        {icon}
      </Button>
      {open
        ? createPortal(
            <dialog
              ref={panelRef}
              aria-label={label}
              className={cn(
                "app-menu-popover z-[95] m-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-popover p-1 text-left text-popover-foreground",
                className,
              )}
              id={panelId}
              open
              style={style ?? { visibility: "hidden" }}
            >
              {children(close)}
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}

export function MenuItem({
  "aria-label": ariaLabel,
  children,
  disabled,
  icon,
  onSelect,
  variant = "default",
}: {
  "aria-label"?: string;
  children: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  onSelect: () => void;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] leading-none transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        variant === "destructive"
          ? "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 [&_svg]:text-destructive"
          : "text-foreground hover:bg-accent focus-visible:bg-accent",
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div aria-hidden="true" className="my-1 h-px bg-border" />;
}
