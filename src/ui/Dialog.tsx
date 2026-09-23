import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose(): void;
  labelledBy: string; // id of the element that names the dialog
  className?: string;
  children: ReactNode;
}

/** Modal shell: focus moves in on open and back to the opener on close; Tab stays inside; Escape and a backdrop click close. */
export function Dialog({ open, onClose, labelledBy, className, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleClose = () => {
    previousFocus.current?.focus();
    onCloseRef.current();
  };

  // Move focus into the dialog when it opens; give it back to the opener when it closes.
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? dialog)?.focus();
    return () => previousFocus.current?.focus();
  }, [open]);

  // Escape closes from anywhere on the page while open; Tab/Shift+Tab stay inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div
        className={className ? `dialog ${className}` : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={dialogRef}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
