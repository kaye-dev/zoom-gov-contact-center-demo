"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { Checkbox } from "@/app/components/Checkbox";
import { Select } from "@/app/components/Select";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import { OutreachTableSkeleton } from "./OutreachTableSkeleton";
import type { OutreachPanelProps } from "./OutreachView";
import type { AudioCandidates, AudioImportInput, AudioImportResult, AudioCandidate } from "@/lib/zaad/message-import-contracts";
import { outreachRequest, outreachMutation, OutreachApiError } from "./outreach-client";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
export function OutreachMessageSync({tenant,departments,permissions,fullAccess,setDirty,setSaving,confirmed}:OutreachPanelProps&{confirmed:(ids:string[])=>Promise<void>}){
 const {t}=useI18n(),c=t.outreachCommon.messageImport,z=t.admin.zaad,d=t.outreachCommon;
 const [items,setItems]=useState<AudioCandidate[]|null>(null),[selected,setSelected]=useState<string[]>([]),[department,setDepartment]=useState(departments[0]??""),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");const lock=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 const [candidateSet,setCandidateSet]=useState<AudioCandidates|null>(null),[unknown,setUnknown]=useState(false);
 const attempt=useRef<AudioImportInput|null>(null),errorRef=useRef<HTMLParagraphElement>(null);
 const itemKey=(item:AudioCandidate)=>JSON.stringify([item.assetId,item.assetItemId]);
 const writable=Boolean(fullAccess&&permissions.create&&permissions.update);
 useEffect(()=>{heading.current?.focus();},[]);
 useEffect(()=>{
   if(!writable)return;
   const controller=new AbortController();
   outreachRequest<AudioCandidates>(tenant,"message-import/candidates",{signal:controller.signal}).then(result=>{
     if(!controller.signal.aborted){setItems(result.items);setCandidateSet(result);}
   }).catch(()=>{if(!controller.signal.aborted){setItems([]);setError(z.common.failure);}});
   return()=>controller.abort();
 },[tenant,reload,writable,z.common.failure]);
 useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 async function save(){
   if(lock.current||!writable||(!unknown&&(!candidateSet||selected.length<1||selected.length>100||!department)))return;
   lock.current=true;setBusy(true);setSaving?.(true);setError("");
   let rejected=false;
   try{
     if(!attempt.current){
       const chosen=(items??[]).filter(item=>selected.includes(itemKey(item))&&item.selectable);
       if(chosen.length!==selected.length)throw new Error("SELECTION_CHANGED");
       attempt.current={operationKey:crypto.randomUUID(),accountId:candidateSet!.accountId,departmentKey:department,items:chosen.map(({assetId,assetItemId,observedDigest,version})=>({assetId,assetItemId,observedDigest,version}))};
     }
     let result:AudioImportResult;
     if(unknown){
       try{result=await outreachRequest<AudioImportResult>(tenant,`message-import/operations/${encodeURIComponent(attempt.current.operationKey)}`);}
       catch(failure){if(!(failure instanceof OutreachApiError)||failure.status!==404)throw failure;result=await outreachMutation<AudioImportResult>(tenant,"message-import",attempt.current);}
     }else{
       result=await outreachMutation<AudioImportResult>(tenant,"message-import",attempt.current).catch(failure=>{rejected=failure instanceof OutreachApiError&&failure.status>=400&&failure.status<500;throw failure;});
     }
     if(result.status!=="COMPLETED"||!Array.isArray(result.result?.ids))throw new Error("RESULT_UNKNOWN");
     await confirmed(result.result.ids);setUnknown(false);setDirty(false);
   }catch{
     if(rejected){attempt.current=null;setCandidateSet(null);setError(d.purposeCampaigns.conflict);}
     else{setUnknown(true);setDirty(true);setError(d.purposeCampaigns.unknown);}
   }finally{lock.current=false;setBusy(false);setSaving?.(false);}
 }
 return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">{c.title}</h1><button className={secondary} disabled={busy||unknown||!writable} onClick={()=>{setItems(null);setCandidateSet(null);setSelected([]);setError("");setReload(value=>value+1);}}>{d.reload}</button></div><DetailPageBreadcrumb title={c.title} disabled={busy||unknown}/><p className="text-sm leading-7 text-fg-muted">{c.help}</p><label className="block max-w-sm">{d.department}<Select value={department} disabled={busy||unknown||!writable} onChange={event=>{setDepartment(event.target.value);setDirty(true);}}>{departments.map(key=><option key={key} value={key}>{d.departments[key]??key}</option>)}</Select></label>{!writable&&<p role="alert">{d.campaignSync.permission}</p>}{error&&<p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}<div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[720px] text-left text-sm" aria-busy={(!items&&writable)||busy}><thead className="bg-surface-hover"><tr>{[c.select,d.groupName,c.language,z.messages.voice,z.messages.body].map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line [&>tr:first-child]:border-t [&>tr:first-child]:border-line">{!items&&writable?<OutreachTableSkeleton columns={5}/>:(items??[]).map(row=><tr key={itemKey(row)}><td className="px-4 py-3"><Checkbox aria-label={`${c.select}: ${row.name}`} checked={selected.includes(itemKey(row))} disabled={busy||unknown||!writable||!row.selectable||(!selected.includes(itemKey(row))&&selected.length>=100)} onChange={event=>{setSelected(current=>event.target.checked?[...current,itemKey(row)]:current.filter(id=>id!==itemKey(row)));setDirty(true);}}/></td><td className="px-4 py-3">{row.name}<p className="text-xs text-fg-muted">{row.assetId} · {row.assetItemId}{row.imported?` · ${c.imported}`:""}</p></td><td className="px-4 py-3">{row.languageCode}</td><td className="px-4 py-3">{row.voiceId??c.voiceUnknown}</td><td className="px-4 py-3">{c.bodyMissing}</td></tr>)}</tbody></table></div><div className="flex justify-end"><button className={primary} disabled={busy||!writable||(!unknown&&(!candidateSet||!items||!selected.length||selected.length>100||!department))} onClick={()=>void save()}>{unknown?z.common.retry:c.action}</button></div></section>;
}
