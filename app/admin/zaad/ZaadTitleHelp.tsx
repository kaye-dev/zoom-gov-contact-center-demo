import { useEffect, useId, useReducer, useRef } from "react";

import { InfoIcon } from "@/app/components/svg/InfoIcon";

export type HelpState = { hover: boolean; focus: boolean; pinned: boolean; dismissed: boolean };
export type HelpEvent = "enter" | "leave" | "focus" | "dismiss" | "toggle";
export const initialHelpState: HelpState = { hover: false, focus: false, pinned: false, dismissed: false };
export function helpReducer(state: HelpState, event: HelpEvent): HelpState {
  switch (event) {
    case "enter": return { ...state, hover: true, dismissed: false };
    case "leave": return { ...state, hover: false };
    case "focus": return { ...state, focus: true, dismissed: false };
    case "dismiss": return { ...initialHelpState, dismissed: true };
    case "toggle": return state.pinned
      ? { ...initialHelpState, dismissed: true }
      : { ...state, pinned: true, dismissed: false };
  }
}
export function isHelpOpen(state: HelpState) {
  return !state.dismissed && (state.hover || state.focus || state.pinned);
}

export function ZaadTitleHelp({ title, description, label }: { title: string; description: string; label: string }) {
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, dispatch] = useReducer(helpReducer, initialHelpState);
  const open = isHelpOpen(state);
  const clearClose = () => { clearTimeout(closeTimer.current); };
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
      if (event.target instanceof Node && !group.current?.contains(event.target)) dispatch("dismiss");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { clearTimeout(closeTimer.current); dispatch("dismiss"); }
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
    <div ref={group} className="relative mt-1 flex w-fit max-w-full items-center gap-2">
      <h1 className="text-3xl font-bold text-fg">{title}</h1>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onPointerEnter={(event) => enter(event.pointerType)}
        onPointerLeave={leave}
        onFocus={() => dispatch("focus")}
        onBlur={() => dispatch("dismiss")}
        onClick={() => dispatch("toggle")}
        className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <InfoIcon className="h-6 w-6" />
      </button>
      <div
        id={id}
        role="tooltip"
        onPointerEnter={(event) => enter(event.pointerType)}
        onPointerLeave={leave}
        className={open ? "absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-fg px-3 py-2 text-sm leading-6 text-surface shadow-lg" : "sr-only"}
      >
        {description}
      </div>
    </div>
  );
}
