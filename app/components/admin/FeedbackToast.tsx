"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Feedback, type FeedbackProps } from "./Feedback";

function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "hidden"] });
  return () => { document.removeEventListener("visibilitychange", listener); observer.disconnect(); };
}
const isBlocked = () => document.hidden || Boolean(document.querySelector('[aria-modal="true"]:not([hidden])'));

/** Keep the adopted presentation mounted while hidden so paused time is not reset. */
export function FeedbackToast({ id, onClose, ...props }: FeedbackProps & { id: string; onClose: () => void; closeLabel: string }) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [raisedBottom, setRaisedBottom] = useState<number>();
  const blocked = useSyncExternalStore(subscribeVisibility, isBlocked, () => true);
  const remaining = useRef(6000), root = useRef<HTMLDivElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => { remaining.current = 6000; }, [id]);
  useEffect(() => {
    if (blocked || hovered || focused || props.action || props.tone === "warning" || props.tone === "error") return;
    const start = Date.now(), timer = window.setTimeout(() => close.current(), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - start)); };
  }, [blocked, hovered, focused, id, props.tone, props.action]);
  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || root.current?.contains(target)) return;
      returnFocus.current = target;
      const toast = root.current?.getBoundingClientRect(), rect = target.getBoundingClientRect();
      if (toast && rect.bottom > toast.top && rect.top < toast.bottom && rect.right > toast.left && rect.left < toast.right) {
        setRaisedBottom(window.innerHeight - rect.top + 8);
      } else setRaisedBottom(undefined);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
  function dismiss() {
    const restore = root.current?.contains(document.activeElement);
    close.current();
    if (restore) {
      const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>('#outreach-panel h2[tabindex="-1"], #outreach-panel h1, [role="tab"][aria-selected="true"]');
      target?.focus();
    }
  }
  return <div ref={root} hidden={blocked} inert={blocked} aria-hidden={blocked || undefined} className="feedback-toast pointer-events-none fixed z-40 w-[calc(100%-2rem)] max-w-[28rem] shadow-lg" style={raisedBottom === undefined ? undefined : { bottom: raisedBottom }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget)) returnFocus.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : returnFocus.current; setFocused(true); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <Feedback {...props} className={`pointer-events-auto ${props.className ?? ""}`} onClose={dismiss}/>
  </div>;
}
