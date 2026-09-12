"use client";
import { useState } from "react";
import { PasswordInput } from "@/app/components/PasswordInput";
import { Feedback } from "@/app/components/admin/Feedback";
import { DemoFrame, type DemoEntryCopy } from "@/app/components/DemoEntry";
export type AccessCopy = { title: string; description: string; code: string; helpTitle: string; help: string; submit: string; busy: string; error: string };
export function AccessCodeForm({ frame, copy, onSubmit }: { frame: DemoEntryCopy; copy: AccessCopy; onSubmit: (code: string) => Promise<string | null> }) {
 const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
 return <DemoFrame copy={frame}><main className="mx-auto w-full max-w-md px-5 py-12 md:py-20"><h1 className="text-2xl font-bold">{copy.title}</h1><p className="mt-4 whitespace-pre-line text-fg-muted leading-7">{copy.description}</p><form className="mt-8 space-y-5" aria-busy={busy} onSubmit={async event => {event.preventDefault(); if(busy) return; setBusy(true); setError(null); try { setError(await onSubmit(code)); } catch { setError(copy.error); } finally {setBusy(false);} }}><PasswordInput label={copy.code} value={code} onChange={event => setCode(event.target.value)} required autoComplete="current-password" aria-describedby={error ? "access-help access-error" : "access-help"} aria-invalid={Boolean(error)} disabled={busy}/><p id="access-help" className="text-sm leading-6 text-fg-muted"><strong className="block font-bold">{copy.helpTitle}</strong>{copy.help}</p>{error && <div id="access-error"><Feedback tone="error">{error}</Feedback></div>}<button disabled={busy} className="w-full rounded-md bg-primary text-white px-4 py-3 font-bold cursor-pointer hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-60">{busy ? copy.busy : copy.submit}</button></form></main></DemoFrame>;
}
