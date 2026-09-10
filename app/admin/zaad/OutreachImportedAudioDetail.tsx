"use client";
import {useEffect,useRef} from "react";
import {useI18n} from "@/app/i18n/LanguageProvider";
import {DetailPageBreadcrumb} from "./DetailPageBreadcrumb";
import type {ImportedAudioMessage} from "@/lib/zaad/message-import-contracts";
export function OutreachImportedAudioDetail({message}:{message:ImportedAudioMessage}){
 const {t}=useI18n(),c=t.outreachCommon.messageImport,title=useRef<HTMLHeadingElement>(null);useEffect(()=>{title.current?.focus();},[message.id]);
 return <section className="max-w-3xl space-y-5"><h1 ref={title} tabIndex={-1} className="text-2xl font-bold">{message.name}</h1><DetailPageBreadcrumb title={message.name}/><p className="text-sm leading-7 text-fg-muted">{c.restriction}</p><dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 text-sm"><dt>{t.admin.zaad.messages.body}</dt><dd>{c.bodyMissing}</dd><dt>{t.admin.zaad.messages.voice}</dt><dd>{message.voiceId??c.voiceUnknown}</dd><dt>{c.language}</dt><dd>{message.languageCode}</dd><dt>{t.outreachCommon.messageUi.asset}</dt><dd className="break-all">{message.zoomAssetId} · {message.assetItemId}</dd></dl><p className="text-sm text-fg-muted">{c.source}</p></section>;
}
