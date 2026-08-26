"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

type ConfirmationDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  isSubmitting: boolean;
  error: string | null;
  danger?: boolean;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  isSubmitting,
  error,
  danger = false,
  children,
  onClose,
  onConfirm,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const closeFromEffect = useEffectEvent(() => {
    if (!isSubmitting) onClose();
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeFromEffect();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]',
      ) ?? [],
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-dialog-title"
        aria-describedby="confirmation-dialog-description"
        onKeyDown={trapFocus}
        className="relative w-full max-w-lg rounded-xl border border-line bg-surface-raised p-6 text-fg shadow-2xl"
      >
        <h2 id="confirmation-dialog-title" className="text-xl font-bold">
          {title}
        </h2>
        <p
          id="confirmation-dialog-description"
          className="mt-3 text-sm leading-6 text-fg-muted"
        >
          {description}
        </p>
        {children}
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              danger
                ? "bg-red-700 hover:bg-red-800"
                : "bg-primary hover:bg-primary-900"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
