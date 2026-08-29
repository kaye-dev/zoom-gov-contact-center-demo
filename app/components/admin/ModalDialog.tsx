"use client";

import { createPortal } from "react-dom";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

type ModalDialogProps = {
  title: string;
  description: string;
  children: ReactNode;
  onRequestClose: () => void;
  locked?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  maxWidthClassName?: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const subscribeToClient = () => () => undefined;

export function ModalDialog({
  title,
  description,
  children,
  onRequestClose,
  locked = false,
  initialFocusRef,
  maxWidthClassName = "max-w-lg",
}: ModalDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const isClient = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const closeFromEffect = useEffectEvent(() => {
    if (!locked) onRequestClose();
  });

  useEffect(() => {
    if (!isClient) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const portalRoot = dialogRef.current?.parentElement;
    const siblings = Array.from(document.body.children).filter(
      (element) => element !== portalRoot,
    );
    const previousStates = siblings.map((element) => ({
      element: element as HTMLElement,
      inert: (element as HTMLElement).inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

    document.body.style.overflow = "hidden";
    for (const { element } of previousStates) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }

    const focusTarget =
      initialFocusRef?.current ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialogRef.current;
    focusTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFromEffect();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const { element, inert, ariaHidden } of previousStates) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      previouslyFocused?.focus();
    };
  }, [isClient, initialFocusRef]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
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

  if (!isClient) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onRequestClose();
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={locked}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className={`relative my-auto max-h-[calc(100dvh-2rem)] w-full ${maxWidthClassName} overflow-y-auto rounded-xl border border-line bg-surface-raised p-6 text-fg shadow-2xl`}
      >
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-fg-muted">
          {description}
        </p>
        {children}
      </div>
    </div>,
    document.body,
  );
}
