type Entry = { root: HTMLElement; returnFocus: HTMLElement | null };
type OriginalState = { inert: boolean; ariaHidden: string | null };

/** One owner for background state, including when nested dialogs unmount together. */
export function createModalStack(document: Document) {
  const entries: Entry[] = [];
  const originalStates = new Map<HTMLElement, OriginalState>();
  let originalOverflow = "";
  let originalFocus: HTMLElement | null = null;

  function restore() {
    for (const [element, state] of originalStates) {
      element.inert = state.inert;
      if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", state.ariaHidden);
    }
  }

  function isolate() {
    restore();
    const top = entries.at(-1);
    for (const child of Array.from(document.body.children)) {
      const element = child as HTMLElement;
      if (!originalStates.has(element)) {
        originalStates.set(element, { inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") });
      }
      if (element !== top?.root) {
        element.inert = true;
        element.setAttribute("aria-hidden", "true");
      }
    }
    document.body.style.overflow = "hidden";
  }

  return {
    register(root: HTMLElement) {
      const entry: Entry = { root, returnFocus: document.activeElement as HTMLElement | null };
      if (entries.length === 0) {
        originalOverflow = document.body.style.overflow;
        originalFocus = entry.returnFocus;
      }
      entries.push(entry);
      isolate();
      return {
        isTop: () => entries.at(-1) === entry,
        release(): HTMLElement | null {
          const index = entries.indexOf(entry);
          if (index < 0) return null;
          const wasTop = entries.at(-1) === entry;
          entries.splice(index, 1);
          if (entries.length === 0) {
            restore();
            originalStates.clear();
            document.body.style.overflow = originalOverflow;
            const target = originalFocus;
            originalFocus = null;
            return target?.isConnected ? target : null;
          }
          isolate();
          const top = entries.at(-1)!;
          return wasTop && entry.returnFocus?.isConnected && top.root.contains(entry.returnFocus)
            ? entry.returnFocus : null;
        },
      };
    },
  };
}

const stacks = new WeakMap<Document, ReturnType<typeof createModalStack>>();
export function modalStackFor(document: Document) {
  let stack = stacks.get(document);
  if (!stack) { stack = createModalStack(document); stacks.set(document, stack); }
  return stack;
}
