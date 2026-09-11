import type { MouseEvent } from "react";
/** Preserve native table semantics and the existing focusable name control. */
export function handleOutreachRowClick(event: MouseEvent<HTMLTableRowElement>, navigate: () => void, disabled = false) {
 const target = event.target;
 if (disabled || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
 if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
 if (target.closest('a,button,input,select,textarea,label,[role="button"],[role="checkbox"],[role="menuitem"],[contenteditable="true"],[data-row-action]')) return;
 if (window.getSelection()?.toString()) return;
 navigate();
}
