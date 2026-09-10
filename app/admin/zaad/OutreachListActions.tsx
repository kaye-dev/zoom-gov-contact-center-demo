"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
export const OutreachActionHost = createContext<HTMLDivElement | null>(null);
export function OutreachListActions({ children }: { children: ReactNode }) {
  const host = useContext(OutreachActionHost);
  return host ? createPortal(children, host) : null;
}

export const outreachTabAction = "inline-flex min-h-14 cursor-pointer items-center justify-center whitespace-nowrap border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-fg-muted hover:text-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
