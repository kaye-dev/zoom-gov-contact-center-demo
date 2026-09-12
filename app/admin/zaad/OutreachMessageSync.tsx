"use client";
import { Feedback } from "@/app/components/admin/Feedback";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { TextSnippetIcon } from "@/app/components/svg/TextSnippetIcon";
import { Checkbox } from "@/app/components/Checkbox";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import { OutreachTableSkeleton } from "./OutreachTableSkeleton";
import type { OutreachPanelProps } from "./OutreachView";
import type { AudioCandidates, AudioImportInput, AudioImportResult, AudioCandidate } from "@/lib/zaad/message-import-contracts";
import { outreachRequest, outreachMutation, OutreachApiError } from "./outreach-client";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
export function OutreachMessageSync({tenant,permissions,fullAccess,setDirty,setSaving,confirmed}:OutreachPanelProps&{confirmed:(ids:string[])=>Promise<void>}){
 const {t}=useI18n(),c=t.outreachCommon.messageImport,z=t.admin.zaad,d=t.outreachCommon;
 const [items,setItems]=useState<AudioCandidate[]|null>(null),[selected,setSelected]=useState<string[]>([]),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");const lock=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 const disclosureId=useId(),[expanded,setExpanded]=useState<string[]>([]);
 const [candidateSet,setCandidateSet]=useState<AudioCandidates|null>(null),[unknown,setUnknown]=useState(false);
 const attempt=useRef<AudioImportInput|null>(null),errorRef=useRef<HTMLDivElement>(null);
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
   if(lock.current||!writable||(!unknown&&(!candidateSet||selected.length<1||selected.length>100)))return;
   lock.current=true;setBusy(true);setSaving?.(true);setError("");
   let rejected=false;
   try{
     if(!attempt.current){
       const chosen=(items??[]).filter(item=>selected.includes(itemKey(item))&&item.selectable);
       if(chosen.length!==selected.length)throw new Error("SELECTION_CHANGED");
       attempt.current={operationKey:crypto.randomUUID(),accountId:candidateSet!.accountId,items:chosen.map(({assetId,assetItemId,observedDigest,expectedUpdatedAt})=>({assetId,assetItemId,observedDigest,expectedUpdatedAt}))};
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
 return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">{c.title}</h1><button className={secondary} disabled={busy||unknown||!writable} onClick={()=>{setItems(null);setExpanded([]);setCandidateSet(null);setSelected([]);setError("");setReload(value=>value+1);}}>{d.reload}</button></div><DetailPageBreadcrumb title={c.title} disabled={busy||unknown}/>{!writable&&<Feedback tone="warning">{d.campaignSync.permission}</Feedback>}{error&&<Feedback tone={unknown ? "warning" : "error"} ref={errorRef} tabIndex={-1}>{error}</Feedback>}<div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[640px] table-fixed text-left text-sm" aria-busy={(!items&&writable)||busy}><colgroup><col className="w-20"/><col/><col className="w-28"/><col className="w-36"/></colgroup><thead className="bg-surface-hover"><tr>{[c.select,d.groupName,c.language,z.messages.voice].map(label=><th key={label} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line [&>tr:first-child]:border-t [&>tr:first-child]:border-line">{!items&&writable?<OutreachTableSkeleton columns={4}/>:(items??[]).map((row,index)=>{const key=itemKey(row),open=expanded.includes(key),panelId=`${disclosureId}-${index}`;return <Fragment key={key}><tr className="align-top"><td className="whitespace-nowrap px-4 py-3"><Checkbox aria-label={`${c.select}: ${row.name}`} checked={selected.includes(key)} disabled={busy||unknown||!writable||!row.selectable||(!selected.includes(key)&&selected.length>=100)} onChange={event=>{setSelected(current=>event.target.checked?[...current,key]:current.filter(id=>id!==key));setDirty(true);}}/></td><td className="px-4 py-3 leading-7"><div className="flex items-start gap-2"><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{row.name}</span><button type="button" className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed" aria-label={`${row.name}: ${open?c.hideBody:c.showBody}`} title={open?c.hideBody:c.showBody} aria-expanded={open} aria-controls={panelId} disabled={busy} onClick={()=>setExpanded(current=>open?current.filter(id=>id!==key):[...current,key])}><TextSnippetIcon/></button></div></td><td className="whitespace-nowrap px-4 py-3 leading-7">{row.languageCode}</td><td className="px-4 py-3 leading-7 [overflow-wrap:anywhere]">{row.voiceId??c.voiceUnknown}</td></tr>{open&&<tr><td colSpan={4} className="bg-surface-hover px-4 py-4 sm:px-5"><section id={panelId} aria-label={`${row.name}: ${z.messages.body}`} className="max-w-3xl space-y-2"><h2 className="text-sm font-bold">{z.messages.body}</h2><p className="whitespace-pre-wrap text-base leading-7 text-fg [overflow-wrap:anywhere]">{row.body??c.bodyMissing}</p></section></td></tr>}</Fragment>;})}</tbody></table></div><div className="flex justify-end"><button className={primary} disabled={busy||!writable||(!unknown&&(!candidateSet||!items||!selected.length||selected.length>100))} onClick={()=>void save()}>{unknown?z.common.retry:c.action}</button></div></section>;
}
