"use client";
import {useEffect,useRef,useState} from "react";
import {useI18n} from "@/app/i18n/LanguageProvider";
import {outreachSecondary as secondary} from "@/app/notifications/register/StudentNotificationRegistration";
export function OutreachAudioPlayer({load}:{load:(signal:AbortSignal)=>Promise<string>}){
 const {t}=useI18n(),c=t.outreachCommon.audioPlayback,audio=useRef<HTMLAudioElement>(null),pending=useRef<AbortController|null>(null),url=useRef<string|null>(null);
 const [src,setSrc]=useState<string|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{const element=audio.current;return()=>{element?.pause();};},[src]);
 useEffect(()=>{return()=>{pending.current?.abort();if(url.current?.startsWith("blob:"))URL.revokeObjectURL(url.current);};},[]);
 async function prepare(){if(pending.current)return;const controller=new AbortController();pending.current=controller;setBusy(true);setFailed(false);try{const next=await load(controller.signal);if(controller.signal.aborted){if(next.startsWith("blob:"))URL.revokeObjectURL(next);return;}if(url.current?.startsWith("blob:"))URL.revokeObjectURL(url.current);url.current=next;setSrc(next);}catch{if(!controller.signal.aborted)setFailed(true);}finally{if(!controller.signal.aborted)setBusy(false);pending.current=null;}}
 return <div className="space-y-3" aria-busy={busy}>{src&&!failed&&<audio ref={audio} className="w-full" controls preload="none" src={src} aria-label={c.label} onError={()=>setFailed(true)}/>} {!src||failed?<button type="button" className={secondary} disabled={busy} onClick={()=>void prepare()}>{busy?c.loading:failed?c.retry:c.load}</button>:null}{busy&&<p role="status">{c.loading}</p>}{failed&&<p role="alert">{c.failed}</p>}</div>;
}
