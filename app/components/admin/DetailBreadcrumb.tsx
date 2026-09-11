"use client";
import Link from "next/link";
export function DetailBreadcrumb({label,current,href,disabled=false}: {label:string;current:string;href:string;disabled?:boolean}) {
 return <nav aria-label={label} className="text-sm text-fg-muted"><ol className="flex flex-wrap items-center gap-x-3 gap-y-2"><li><Link href={href} aria-disabled={disabled || undefined} onClick={event=>{if(disabled) event.preventDefault();}} className={`rounded-sm hover:text-accent focus-visible:outline-2 focus-visible:outline-accent ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>{label}</Link></li><li className="flex min-w-0 items-center gap-3"><svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none"><path d="m7 4 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><span aria-current="page" className="break-words">{current}</span></li></ol></nav>;
}
