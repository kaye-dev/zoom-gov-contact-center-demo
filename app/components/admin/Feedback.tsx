"use client";
import { type HTMLAttributes, type Ref, type ReactNode } from "react";
import { CloseIcon } from "@/app/components/svg/CloseIcon";
import { InfoIcon } from "@/app/components/svg/InfoIcon";
export type FeedbackTone = "success" | "info" | "warning" | "error";
export type FeedbackProps = { tone: FeedbackTone; children: ReactNode; closeLabel?: string; onClose?: () => void; action?: ReactNode; ref?: Ref<HTMLDivElement> } & Omit<HTMLAttributes<HTMLDivElement>, "children">;
export function Feedback({ tone, children, closeLabel, onClose, action, className = "", role, ref, ...attributes }: FeedbackProps) {
 return <div {...attributes} ref={ref} data-feedback-tone={tone} role={role ?? (tone === "error" ? "alert" : "status")} aria-atomic="true" className={`feedback flex items-start gap-3 rounded-md border p-4 text-sm leading-6 ${className}`}>
  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">{tone === "info" ? <InfoIcon className="h-6 w-6"/> : <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 text-xs font-bold">{tone === "success" ? "✓" : tone === "warning" ? "!" : "×"}</span>}</span>
  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}{action && <div className="mt-2">{action}</div>}</div>
  {onClose && <button type="button" className="-m-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-surface/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label={closeLabel} onClick={onClose}><CloseIcon className="h-5 w-5"/></button>}
 </div>;
}
export function InlineFeedback(props: FeedbackProps) { return <div data-inline-feedback className="space-y-3 py-5"><Feedback {...props}/></div>; }
