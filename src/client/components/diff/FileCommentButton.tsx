import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.js";
import { Textarea } from "../ui/textarea.js";

export function FileCommentButton({
  draft,
  onDraftChange,
  onSubmit,
  path,
}: {
  draft: string;
  onDraftChange: (body: string) => void;
  onSubmit: (body: string) => void;
  path: string;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const descriptionId = useId();
  const titleId = useId();
  const panelRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect == null) return;
      const margin = 12;
      const width = Math.min(360, window.innerWidth - margin * 2);
      const left = Math.min(
        Math.max(margin, rect.right - width),
        window.innerWidth - width - margin,
      );
      const availableBelow = window.innerHeight - rect.bottom - margin;
      setStyle({
        left,
        maxHeight: Math.max(220, window.innerHeight - margin * 2),
        position: "fixed",
        top: availableBelow >= 230 ? rect.bottom + 6 : Math.max(margin, rect.top - 226),
        width,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const submit = () => {
    const body = draft.trim();
    if (body.length === 0) return;
    onSubmit(body);
    setOpen(false);
    triggerRef.current?.focus();
    toast.success("Added file-level note");
  };

  return (
    <>
      <Button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Add file-level note to ${path}`}
        data-file-comment-path={path}
        className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((current) => !current)}
        size="icon"
        title={`Add file-level note to ${path}`}
        variant="ghost"
      >
        <MessageSquarePlus />
      </Button>
      {open
        ? createPortal(
            <Dialog
              ref={panelRef}
              open
              aria-describedby={descriptionId}
              aria-labelledby={titleId}
              className="z-[90] overflow-visible rounded-lg text-popover-foreground"
              style={style}
            >
              <DialogContent className="relative p-3 shadow-xl">
                <DialogHeader className="pr-8">
                  <DialogTitle id={titleId}>File-level note</DialogTitle>
                  <DialogDescription id={descriptionId} className="text-xs">
                    Comment on <span className="font-mono text-foreground">{path}</span> without
                    attaching the note to one line.
                  </DialogDescription>
                  <Button
                    aria-label="Close file-level note"
                    className="absolute right-2 top-2 size-7"
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </DialogHeader>
                <Textarea
                  aria-label={`File-level note for ${path}`}
                  className="mt-3 min-h-24 resize-y"
                  onChange={(event) => onDraftChange(event.target.value)}
                  placeholder="What should change in this file?"
                  value={draft}
                />
                <DialogFooter className="mt-3 flex-row justify-end">
                  <Button
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Keep draft
                  </Button>
                  <Button disabled={draft.trim().length === 0} onClick={submit} size="sm">
                    Add note
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>,
            document.body,
          )
        : null}
    </>
  );
}
