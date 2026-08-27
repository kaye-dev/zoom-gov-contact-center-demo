"use client";

import { useRef, type ReactNode } from "react";

import { ModalDialog } from "@/app/components/admin/ModalDialog";

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
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      title={title}
      description={description}
      locked={isSubmitting}
      initialFocusRef={cancelButtonRef}
      onRequestClose={onClose}
    >
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
    </ModalDialog>
  );
}
