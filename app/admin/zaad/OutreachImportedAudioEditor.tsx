"use client";
import {useEffect,useRef,useState} from "react";
import {useI18n} from "@/app/i18n/LanguageProvider";
import {Checkbox} from "@/app/components/Checkbox";
import {Select} from "@/app/components/Select";
import {OUTREACH_VOICES} from "@/lib/zaad/message-contracts";
import {OutreachAudioPlayer} from "./OutreachAudioPlayer";
import {loadImportedAudio, outreachMutation, OutreachApiError} from "./outreach-client";
import {DetailPageBreadcrumb} from "./DetailPageBreadcrumb";
import type {OutreachPanelProps} from "./OutreachView";
import type {ImportedAudioMessage} from "@/lib/zaad/message-import-contracts";
import {registrationInputClass as input,outreachPrimary as primary} from "@/app/notifications/register/StudentNotificationRegistration";
export function OutreachImportedAudioEditor({message,tenant,permissions,fullAccess,setDirty,setSaving,saved}:OutreachPanelProps&{message:ImportedAudioMessage;saved:()=>void}){
 const {t}=useI18n(),c=t.outreachCommon.messageEdit,a=t.outreachCommon.messageImport;
 const [name,setName]=useState(message.name),[replace,setReplace]=useState(false),[body,setBody]=useState(message.body??""),[voice,setVoice]=useState(message.voiceId??"Tomoko"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[unknown,setUnknown]=useState(false);
 const attempt=useRef<{operationKey:string;expectedUpdatedAt:string;expectedDigest:string;name:string;replaceAudio:boolean;body?:string;voiceId?:string}|null>(null);
 const lock=useRef(false),title=useRef<HTMLHeadingElement>(null),writable=Boolean(fullAccess&&permissions.update);
 useEffect(()=>{title.current?.focus();},[message.id]);
 function changed(){setDirty(true);attempt.current=null;}
 async function save(){
   if(lock.current||!writable)return;lock.current=true;setBusy(true);setSaving?.(true);setError("");
   try{
     attempt.current??={operationKey:crypto.randomUUID(),expectedUpdatedAt:message.updatedAt,expectedDigest:message.expectedDigest,name,replaceAudio:replace,...(replace?{body,voiceId:voice}:{})};
     const result=await outreachMutation<{status:string}>(tenant,`imported-audio-messages/${encodeURIComponent(message.id)}`,attempt.current,"PATCH");
     if(result.status!=="COMPLETED")throw new Error("RESULT_UNKNOWN");
     setDirty(false);saved();
   }catch(cause){
     const uncertain=!(cause instanceof OutreachApiError)||cause.status>=500||["AUDIO_UPDATE_RESULT_UNKNOWN","AUDIO_OPERATION_IN_PROGRESS"].includes(cause.code);
     setUnknown(uncertain);setError(uncertain?t.outreachCommon.purposeCampaigns.unknown:cause instanceof OutreachApiError&&["CONTENT_CHANGED","AUDIO_ASSET_CHANGED","OPERATION_CONFLICT"].includes(cause.code)?t.outreachCommon.messageUi.conflict:t.admin.zaad.common.failure);
     if(!uncertain)attempt.current=null;
   }finally{lock.current=false;setBusy(false);setSaving?.(false);}
 }

 return <section className="max-w-3xl space-y-5"><h1 ref={title} tabIndex={-1} className="text-2xl font-bold">{message.name}</h1><DetailPageBreadcrumb title={message.name} disabled={busy}/><p className="text-sm leading-7 text-fg-muted">{c.help}</p><OutreachAudioPlayer key={`${message.id}:${message.updatedAt}`} load={signal=>loadImportedAudio(tenant,message.id,signal)}/><form className="space-y-5" aria-busy={busy} onSubmit={event=>{event.preventDefault();void save();}}><fieldset className="space-y-5" disabled={busy||unknown||!writable}><legend className="sr-only">{t.admin.zaad.common.edit}</legend><label className="block">{t.outreachCommon.groupName}<input className={input} required maxLength={150} value={name} onChange={event=>{setName(event.target.value);changed();}}/></label><p className="text-sm text-fg-muted">{a.language}: {message.languageCode}</p><label className="flex items-center gap-3"><Checkbox checked={replace} disabled={message.languageCode!=="ja-JP"} onChange={event=>{setReplace(event.target.checked);changed();}}/>{c.replace}</label>{replace?<><label className="block">{t.admin.zaad.messages.body}<textarea className={input} required maxLength={500} rows={6} value={body} aria-describedby="audio-body-help" onChange={event=>{setBody(event.target.value);changed();}}/></label><p id="audio-body-help" className="text-sm text-fg-muted">{c.bodyHelp}</p><label className="block">{t.admin.zaad.messages.voice}<Select value={voice} onChange={event=>{setVoice(event.target.value);changed();}}>{OUTREACH_VOICES.map(value=><option key={value}>{value}</option>)}</Select></label></>:<p className="text-sm text-fg-muted">{message.bodyState==="UNCHECKED"?<>{t.outreachCommon.audioPlayback.unknown}{message.body&&<span className="block">{message.bodyFetchedAt} · {message.body}</span>}</>:message.body??a.bodyMissing}{message.body&&message.bodyState!=="UNCHECKED"&&<span className="block">{message.bodyState==="PROVIDER_RETURNED"?t.outreachCommon.audioPlayback.source:c.source}</span>}</p>}<p className="text-sm leading-7">{c.effect}</p></fieldset>{error&&<p role="alert">{error}</p>}<button className={primary} disabled={busy||!writable}>{busy?t.admin.industrySettings.saving:unknown?t.admin.zaad.common.retry:c.save}</button></form></section>;
}
