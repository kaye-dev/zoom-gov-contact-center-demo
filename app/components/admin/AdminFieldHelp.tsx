"use client";
import { useEffect, useReducer, useRef } from "react";
import { InfoIcon } from "@/app/components/svg/InfoIcon";
import {
  helpReducer,
  initialHelpState,
  isHelpOpen,
} from "./AdminPageTitleHelp";

export function AdminFieldHelp({
  id,
  description,
  label,
  fieldLabel,
  defaultOpen = false,
}: {
  id: string;
  description: string;
  label: string;
  fieldLabel?: { htmlFor: string; text: string };
  defaultOpen?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [state, dispatch] = useReducer(helpReducer, { ...initialHelpState, pinned: defaultOpen });
  const open = isHelpOpen(state);
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
        !group.current?.contains(event.target)
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
  return (
    <div
      ref={group}
      className={fieldLabel ? "relative flex shrink-0 items-center gap-1" : "relative flex w-fit max-w-full items-center gap-2"}
    >
      {fieldLabel && <label htmlFor={fieldLabel.htmlFor} className="block text-sm font-semibold">{fieldLabel.text}</label>}
      <button
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
      <div
        id={id}
        role="tooltip"
        onPointerEnter={(event) => enter(event.pointerType)}
        onPointerLeave={leave}
        className={
          open
            ? "absolute left-0 md:left-auto md:right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2.5rem)] rounded-lg bg-fg px-3 py-2 text-sm leading-6 text-surface shadow-lg"
            : "sr-only"
        }
      >
        {description}
      </div>
    </div>
  );
}
