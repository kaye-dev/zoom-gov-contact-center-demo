"use client";
import { useEffect, useLayoutEffect, useReducer, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { InfoIcon } from "@/app/components/svg/InfoIcon";
import {
  helpReducer,
  initialHelpState,
  isHelpOpen,
} from "./AdminPageTitleHelp";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function fieldHelpPosition(anchor: { right: number; top: number; bottom: number }, width: number, height: number, viewport: { width: number; height: number }) {
  return {
    left: Math.max(20, Math.min(anchor.right - width, viewport.width - width - 20)),
    top: anchor.bottom + 8 + height <= viewport.height - 8 ? anchor.bottom + 8 : Math.max(8, anchor.top - height - 8),
  };
}

export function AdminFieldHelp({
  id,
  description,
  label,
  fieldLabel,
  defaultOpen = false,
  portal = false,
}: {
  id: string;
  description: string;
  label: string;
  fieldLabel?: { htmlFor: string; text: string };
  defaultOpen?: boolean;
  portal?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null), tooltip = useRef<HTMLDivElement>(null);
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [state, dispatch] = useReducer(helpReducer, { ...initialHelpState, pinned: defaultOpen });
  const open = isHelpOpen(state);
  const floating = portal && hydrated && open;
  const clearClose = () => {
    clearTimeout(closeTimer.current);
  };
  const enter = (pointerType: string) => {
    if (pointerType === "touch") return;
    clearClose();
    dispatch("enter");
  };
  const leave = () => {
    clearClose();
    closeTimer.current = setTimeout(() => dispatch("leave"), 120);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !group.current?.contains(event.target) &&
        !tooltip.current?.contains(event.target)
      )
        dispatch("dismiss");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearTimeout(closeTimer.current);
        dispatch("dismiss");
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!floating || !trigger.current || !tooltip.current) return;
    const position = fieldHelpPosition(trigger.current.getBoundingClientRect(), tooltip.current.offsetWidth, tooltip.current.offsetHeight, { width: window.innerWidth, height: window.innerHeight });
    tooltip.current.style.left = `${position.left}px`;
    tooltip.current.style.top = `${position.top}px`;
    const dismiss = () => { clearTimeout(closeTimer.current); dispatch("dismiss"); };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { window.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, [floating]);
  const descriptionElement = <div
    ref={tooltip}
    id={id}
    role="tooltip"
    onPointerEnter={(event) => enter(event.pointerType)}
    onPointerLeave={leave}
    className={floating
      ? "fixed z-50 w-80 max-w-[calc(100vw-2.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-lg bg-fg px-3 py-2 text-sm font-normal leading-6 text-surface shadow-lg"
      : open && !portal
        ? "absolute left-0 md:left-auto md:right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2.5rem)] rounded-lg bg-fg px-3 py-2 text-sm leading-6 text-surface shadow-lg"
        : "sr-only"}
  >{description}</div>;
  return (
    <div
      ref={group}
      className={fieldLabel ? "relative flex shrink-0 items-center gap-1" : "relative flex w-fit max-w-full items-center gap-2"}
    >
      {fieldLabel && <label htmlFor={fieldLabel.htmlFor} className="block text-sm font-semibold">{fieldLabel.text}</label>}
      <button
        ref={trigger}
        data-field-help-trigger
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onPointerEnter={(event) => enter(event.pointerType)}
        onPointerLeave={leave}
        onFocus={() => dispatch("focus")}
        onBlur={() => dispatch("dismiss")}
        onClick={() => dispatch("toggle")}
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <InfoIcon className="h-5 w-5" />
      </button>
      {floating ? createPortal(descriptionElement, document.body) : descriptionElement}
    </div>
  );
}
