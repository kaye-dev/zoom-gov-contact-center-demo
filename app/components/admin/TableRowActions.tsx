"use client";

import Link from "next/link";
import { Fragment, useEffectEvent, useId, useLayoutEffect, useRef } from "react";
import { createPortal, flushSync } from "react-dom";

import { MoreHorizIcon } from "@/app/components/svg/MoreHorizIcon";
import { activateRowAction, handleRowActionMenuKey, placeRowActionMenu, returnsFocusToTrigger, rowActionPresentation, type MenuCloseReason } from "./table-row-actions";

export type TableRowAction = {
  id: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  describedBy?: string;
  tone?: "normal" | "danger";
} & ({ href: string; onSelect?: never } | { href?: never; onSelect: (trigger: HTMLButtonElement) => void });

export type TableRowActionsProps = {
  items: TableRowAction[];
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TableRowActions({ items, label, open, onOpenChange }: TableRowActionsProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialIndex = useRef(0);
  const presentation = rowActionPresentation(items.length);
  const close = (reason: MenuCloseReason) => {
    onOpenChange(false);
    if (returnsFocusToTrigger(reason)) triggerRef.current?.focus({ preventScroll: true });
  };
  const closeFromEffect = useEffectEvent(close);

  useLayoutEffect(() => {
    if (!open || presentation !== "menu") return;
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    const position = () => {
      menu.style.maxHeight = "none";
      const rect = menu.getBoundingClientRect();
      const placed = placeRowActionMenu(trigger.getBoundingClientRect(),
        { width: rect.width, height: menu.scrollHeight + 2 },
        { width: window.innerWidth, height: window.innerHeight });
      Object.assign(menu.style, {
        left: `${placed.left}px`, top: `${placed.top}px`, width: `${placed.width}px`,
        maxHeight: `${placed.maxHeight}px`, visibility: "visible",
      });
    };
    position();
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]')[initialIndex.current]?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (!menu.contains(target) && !trigger.contains(target)) closeFromEffect("outside");
    };
    const scroll = (event: Event) => {
      if (!menu.contains(event.target as Node)) closeFromEffect("scroll");
    };
    const resize = () => closeFromEffect("resize");
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open, presentation, items.length]);

  const select = (item: TableRowAction) => activateRowAction(item.disabled, () => {
    // Commit the closed menu before a consumer mounts a dialog. ModalDialog captures this trigger.
    flushSync(() => close("select"));
    if (item.onSelect && triggerRef.current) item.onSelect(triggerRef.current);
  });
  const itemClass = (item: TableRowAction) => [
    "block min-h-10 w-full whitespace-normal break-words px-4 py-2 text-left text-sm font-semibold transition-colors focus:bg-surface-hover focus:outline-2 focus:-outline-offset-2 focus:outline-accent",
    item.disabled ? "cursor-not-allowed text-fg-muted opacity-60" : "cursor-pointer hover:bg-surface-hover",
    !item.disabled && item.tone === "danger" ? "text-red-700 dark:text-red-300" : !item.disabled ? "text-fg hover:text-accent" : "",
  ].join(" ");

  if (presentation === "empty") return <span>—</span>;
  if (presentation === "direct") {
    const item = items[0];
    const props = { className: itemClass(item), "aria-describedby": item.describedBy, title: item.disabledReason };
    return item.href && !item.disabled ? (
      <Link {...props} data-row-action-trigger href={item.href} onClick={(event) => event.stopPropagation()}>{item.label}</Link>
    ) : (
      <button {...props} ref={triggerRef} data-row-action-trigger type="button" disabled={item.disabled}
        onClick={(event) => { event.stopPropagation(); select(item); }}>{item.label}</button>
    );
  }

  return <>
    <button ref={triggerRef} id={`${id}-trigger`} data-row-action-trigger type="button"
      aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined}
      className={`inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${open ? "bg-surface-hover text-accent" : ""}`}
      onClick={(event) => { event.stopPropagation(); initialIndex.current = 0; onOpenChange(!open); }}
      onKeyDown={(event) => {
        if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          initialIndex.current = event.key === "ArrowUp" ? items.length - 1 : 0;
          onOpenChange(true);
        } else if (event.key === "Escape" && open) { event.preventDefault(); close("escape"); }
      }}>
      <MoreHorizIcon className="h-6 w-6" />
    </button>
    {open && typeof document !== "undefined" ? createPortal(
      <div ref={menuRef} id={`${id}-menu`} role="menu" aria-labelledby={`${id}-trigger`}
        style={{ visibility: "hidden", width: "max-content", maxWidth: "calc(100vw - 16px)", minWidth: "min(176px, calc(100vw - 16px))" }}
        className="fixed z-[70] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface-raised py-1 text-left shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          const elements = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
          handleRowActionMenuKey(event, elements, document.activeElement as HTMLElement,
            (reason) => flushSync(() => close(reason)), triggerRef.current);
        }}>
        {items.map((item, index) => <Fragment key={item.id}>
          {item.tone === "danger" && index > 0 ? <div role="separator" className="my-1 border-t border-line-subtle" /> : null}
          {(() => {
            const reasonId = item.disabled && item.disabledReason ? `${id}-reason-${index}` : undefined;
            const props = {
              role: "menuitem", tabIndex: -1, "aria-disabled": item.disabled || undefined,
              "aria-describedby": [item.describedBy, reasonId].filter(Boolean).join(" ") || undefined,
              className: itemClass(item),
              onFocus: (event: React.FocusEvent<HTMLElement>) => {
                menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]').forEach((element) => { element.tabIndex = element === event.currentTarget ? 0 : -1; });
              },
            };
            const content = <>{item.label}{reasonId ? <span id={reasonId} className="block text-xs font-normal leading-5">{item.disabledReason}</span> : null}</>;
            return item.href && !item.disabled ? <Link {...props} href={item.href}
              onKeyDown={(event) => { if (event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
              onClick={() => select(item)}>{content}</Link>
              : <button {...props} type="button" onClick={() => select(item)}>{content}</button>;
          })()}
        </Fragment>)}
      </div>, document.body) : null}
  </>;
}
