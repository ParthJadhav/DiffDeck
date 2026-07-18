import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog.js";

export function ConfirmationDialog({
  busy = false,
  cancelLabel = "Cancel",
  confirmLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  description: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog == null) return;

    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      queueMicrotask(() => returnFocusRef.current?.focus());
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <Dialog
      ref={dialogRef}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="app-confirmation-dialog w-[min(28rem,calc(100vw-2rem))] max-w-none rounded-xl text-popover-foreground"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onOpenChange(false);
      }}
      onClose={() => {
        if (!busy) onOpenChange(false);
      }}
    >
      <DialogContent className="p-4 shadow-none sm:p-5">
        <DialogHeader>
          <DialogTitle id={titleId} className="text-base">
            {title}
          </DialogTitle>
          <DialogDescription id={descriptionId} className="leading-5">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-5 sm:flex-row">
          <Button autoFocus disabled={busy} onClick={() => onOpenChange(false)} variant="outline">
            {cancelLabel}
          </Button>
          <Button disabled={busy} onClick={onConfirm} variant="destructive">
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
    document.body,
  );
}
