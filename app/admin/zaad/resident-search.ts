type Page = { query: string; cursor: string | null; history: Array<string | null> };

/** One owner for debounce, pagination and request generations, including refresh. */
export function createResidentSearch<T>({
  request, onPending, onResult, onError, onBusy,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
}: {
  request: (query: string, cursor: string | null) => Promise<T>;
  onPending: () => void;
  onResult: (payload: T, page: Page) => void;
  onError: (error: unknown) => void;
  onBusy: (busy: boolean) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let generation = 0;
  let disposed = false;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let page: Page = { query: "", cursor: null, history: [] };
  let input = "";
  let composing = false;
  const clearTimer = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const setBusy = (value: boolean) => { busy = value; onBusy(value); };
  const load = async (next: Page) => {
    if (disposed) return;
    clearTimer();
    const ticket = ++generation;
    page = next;
    setBusy(true);
    onPending();
    try {
      const payload = await request(next.query, next.cursor);
      if (disposed || ticket !== generation) return;
      onResult(payload, next);
    } catch (error) {
      if (disposed || ticket !== generation) return;
      onError(error);
    } finally {
      if (!disposed && ticket === generation) setBusy(false);
    }
  };
  return {
    start: () => load(page),
    input(value: string, isComposing = false) {
      if (disposed) return;
      input = value;
      composing = isComposing;
      ++generation; // Invalidate immediately, not only when debounce expires.
      clearTimer();
      setBusy(true);
      if (composing) return;
      timer = schedule(() => {
        void load({ query: input.trim(), cursor: null, history: [] });
      }, 200);
    },
    previous() {
      if (busy || !page.history.length) return;
      void load({ ...page, cursor: page.history.at(-1) ?? null, history: page.history.slice(0, -1) });
    },
    next(cursor: string | null) {
      if (busy || !cursor) return;
      void load({ ...page, cursor, history: [...page.history, page.cursor] });
    },
    refresh() {
      // A pending input owns the next refresh; never flush an IME composition.
      if (composing || timer !== undefined) return;
      void load(page);
    },
    dispose() { disposed = true; ++generation; clearTimer(); },
  };
}

export function formatResidentCount(template: string, total: number, locale: string) {
  return template.replace("{count}", new Intl.NumberFormat(locale).format(total));
}
