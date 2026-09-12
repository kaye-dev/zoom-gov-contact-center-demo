"use client";
import { useState } from "react";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { Select } from "@/app/components/Select";
import { PasswordInput } from "@/app/components/PasswordInput";
import { Feedback } from "@/app/components/admin/Feedback";
import { FeedbackToast } from "@/app/components/admin/FeedbackToast";
import { settingsInputFocusClassName } from "@/app/components/admin/settings-form-styles";
import { SITE_ACCESS_SCOPES, sessionExpiry, type SiteAccessScope, type SiteAccessSnapshot } from "@/lib/site-access";
export type AccessSettingsCopy = { readonly: string; loadError: string; reload: string; conflict: string; discardTitle: string; discardDescription: string; discard: string; cancel: string; title: string; description: string; scope: string; scopes: string[]; public: string; restricted: string; code: string; codeHelp: string; duration: string; durationHelp: string; impact: string; save: string; saving: string; saved: string; close: string; error: string; state: string };
export type AccessValue = { enabled: boolean; days: number; hasCode: boolean };
export function AccessSettings({copy, initialValues, allowedScopes, updateScopes, onLoad, onSave}: {
 copy: AccessSettingsCopy;
 initialValues: Partial<Record<SiteAccessScope, SiteAccessSnapshot>>;
 allowedScopes: SiteAccessScope[];
 updateScopes: SiteAccessScope[];
 onLoad: (scope: SiteAccessScope) => Promise<SiteAccessSnapshot>;
 onSave: (scope: SiteAccessScope, value: AccessValue, code: string, revision: number) => Promise<SiteAccessSnapshot>;
}) {
 const [scope,setScope] = useState<SiteAccessScope>(allowedScopes[0] ?? "global");
 const [snapshots,setSnapshots] = useState(initialValues);
 const initial = initialValues[allowedScopes[0]];
 const [value,setValue] = useState<AccessValue>({enabled:initial?.enabled ?? false,days:initial?.sessionDays ?? 1,hasCode:initial?.hasCode ?? false});
 const [code,setCode] = useState("");
 const [pendingScope,setPendingScope] = useState<SiteAccessScope | null>(null);
 const [busy,setBusy] = useState(false),[error,setError] = useState<string | null>(null),[saved,setSaved] = useState(false);
 const snapshot = snapshots[scope];
 const readonly = !updateScopes.includes(scope);
 const disabled = busy || readonly || !snapshot;
 const adopt = (key: SiteAccessScope, next: SiteAccessSnapshot) => {
   setSnapshots(current => ({...current,[key]:next}));
   setValue({enabled:next.enabled,days:next.sessionDays,hasCode:next.hasCode});
   setCode("");setError(null);setSaved(false);
 };
 const switchScope = async (key: SiteAccessScope) => {
   setPendingScope(null);setScope(key);setBusy(true);setError(null);setSaved(false);setCode("");
   // A fresh read makes switching/reloading an explicit revision refresh.
   setSnapshots(current => ({...current,[key]:undefined}));
   try {adopt(key,await onLoad(key));} catch {setError(copy.loadError);} finally {setBusy(false);}
 };
 return <section className="ml-1 mt-12 max-w-5xl border-t border-line pt-8"><h2 className="text-xl font-bold">{copy.title}</h2><p className="mt-3 text-sm leading-6 text-fg-muted">{copy.description}</p><form className="mt-6 space-y-6" aria-busy={busy} onSubmit={async event => {event.preventDefault(); if(busy)return; setError(null); setSaved(false); if(disabled || !snapshot)return; if(!sessionExpiry(value.days,new Date()) || (code && !/^[A-Za-z0-9]{8,64}$/.test(code)) || (value.enabled && !value.hasCode && !code)){setError(copy.error);return;} setBusy(true);try {const next=await onSave(scope,value,code,snapshot.revision);adopt(scope,next);setSaved(true);}catch(cause){setError(cause instanceof Error && cause.message === "SITE_ACCESS_SETTINGS_CONFLICT" ? copy.conflict : copy.error);}finally{setBusy(false);}}}><label className="block max-w-xl space-y-2"><span className="text-sm font-bold">{copy.scope}</span><Select value={scope} disabled={busy} onChange={event=>{const key=event.target.value as SiteAccessScope;if(code || value.enabled!==snapshot?.enabled || value.days!==snapshot?.sessionDays){setPendingScope(key);}else{switchScope(key);}}}>{allowedScopes.map(key=><option key={key} value={key}>{copy.scopes[SITE_ACCESS_SCOPES.indexOf(key)]}</option>)}</Select></label><fieldset disabled={disabled} className="space-y-3"><legend className="mb-3 font-bold">{copy.state}</legend><div className="grid max-w-xl gap-3 sm:grid-cols-2">{[false,true].map(enabled=><label key={String(enabled)} className={`flex gap-3 items-center rounded-lg border p-4 cursor-pointer ${enabled===value.enabled?"border-accent bg-surface-selected":"border-line"}`}><input type="radio" name="access" className="h-5 w-5 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed" checked={value.enabled===enabled} onChange={()=>{setValue({...value,enabled});setSaved(false);}}/>{enabled?copy.restricted:copy.public}</label>)}</div></fieldset>{snapshot && value.enabled&&<div className="max-w-xl space-y-5"><PasswordInput label={copy.code} value={code} onChange={event=>setCode(event.target.value)} autoComplete="new-password" disabled={disabled} aria-describedby={error ? "code-help access-settings-error" : "code-help"} aria-invalid={Boolean(error)}/><p id="code-help" className="text-sm text-fg-muted leading-6">{copy.codeHelp}</p><label className="block space-y-2"><span className="text-sm font-bold">{copy.duration}</span><input type="number" min="1" required value={value.days} disabled={disabled} onChange={event=>setValue({...value,days:Number(event.target.value)})} className={`block w-32 rounded-md border border-line bg-surface px-3 py-2 ${settingsInputFocusClassName}`} aria-describedby="duration-help"/></label><p id="duration-help" className="text-sm text-fg-muted">{copy.durationHelp}</p><Feedback tone="warning">{copy.impact}</Feedback></div>}{readonly&&<Feedback tone="info">{copy.readonly}</Feedback>}{(!snapshot || error)&&<div id="access-settings-error"><Feedback tone="error">{error ?? copy.loadError}</Feedback><button type="button" disabled={busy} className="mt-3 cursor-pointer underline disabled:cursor-not-allowed" onClick={()=>void switchScope(scope)}>{copy.reload}</button></div>}<button disabled={disabled} className="rounded-md bg-primary text-white px-5 py-3 font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">{busy?copy.saving:copy.save}</button></form>{pendingScope&&<ModalDialog title={copy.discardTitle} description={copy.discardDescription} onRequestClose={()=>setPendingScope(null)}><div className="mt-6 flex justify-end gap-3"><button type="button" className="cursor-pointer rounded-md border border-line px-4 py-2" onClick={()=>setPendingScope(null)}>{copy.cancel}</button><button type="button" className="cursor-pointer rounded-md bg-primary text-white px-4 py-2" onClick={()=>switchScope(pendingScope)}>{copy.discard}</button></div></ModalDialog>}{saved&&<FeedbackToast id="access-saved" tone="success" closeLabel={copy.close} onClose={()=>setSaved(false)}>{copy.saved}</FeedbackToast>}</section>;
}
