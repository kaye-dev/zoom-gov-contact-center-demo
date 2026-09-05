export type MenuCloseReason = "escape" | "select" | "tab" | "outside" | "scroll" | "resize";

export function rowActionPresentation(count: number) {
  return count === 0 ? "empty" : count === 1 ? "direct" : "menu";
}

export function menuFocusIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return (current + 1 + count) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  return null;
}

export function returnsFocusToTrigger(reason: MenuCloseReason) {
  return reason === "escape" || reason === "select";
}

export function activateRowAction(disabled: boolean | undefined, action: () => void) {
  if (disabled) return false;
  action();
  return true;
}

/** Shared with the event handler so keyboard tests exercise the actual focus decisions. */
export function handleRowActionMenuKey(
  event: { key: string; preventDefault(): void; stopPropagation(): void },
  elements: HTMLElement[],
  current: HTMLElement | null,
  close: (reason: MenuCloseReason) => void,
  trigger: HTMLButtonElement | null,
) {
  const next = menuFocusIndex(event.key, current ? elements.indexOf(current) : -1, elements.length);
  if (next !== null) { event.preventDefault(); elements[next]?.focus(); }
  else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close("escape"); }
  else if (event.key === "Tab") {
    close("tab");
    trigger?.focus({ preventScroll: true });
  }
}

export function createRowActionSubmissionGuard() {
  const pending = new Set<string>();
  const completed = new Set<string>();
  return {
    begin(id: string) {
      if (pending.size > 0 || completed.has(id)) return false;
      pending.add(id);
      return true;
    },
    end(id: string, success: boolean) {
      pending.delete(id);
      if (success) completed.add(id);
    },
  };
}

export function placeRowActionMenu(
  trigger: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const margin = 8;
  const gap = 4;
  const width = Math.min(Math.max(176, menu.width), Math.max(0, viewport.width - margin * 2));
  const below = Math.max(0, viewport.height - trigger.bottom - gap - margin);
  const above = Math.max(0, trigger.top - gap - margin);
  const flip = menu.height > below && above > below;
  const maxHeight = flip ? above : below;
  const height = Math.min(menu.height, maxHeight);
  return {
    left: Math.max(margin, Math.min(trigger.right - width, viewport.width - width - margin)),
    top: Math.max(margin, flip ? trigger.top - gap - height : trigger.bottom + gap),
    width,
    maxHeight,
  };
}

/** Snapshot before mutation; a deleted row cannot supply a focus target later. */
export function captureRowActionFocus(trigger: HTMLButtonElement) {
  const region = trigger.closest<HTMLElement>("[data-row-action-region]");
  const triggers = Array.from(region?.querySelectorAll<HTMLElement>("[data-row-action-trigger]") ?? []);
  const following = triggers.slice(triggers.indexOf(trigger) + 1);
  const heading = region?.querySelector<HTMLElement>("[data-row-action-heading]");
  return (removed = false) => {
    window.requestAnimationFrame(() => {
      const target = !removed && trigger.isConnected
        ? trigger
        : following.find((element) => element.isConnected) ?? heading;
      target?.focus({ preventScroll: true });
    });
  };
}
