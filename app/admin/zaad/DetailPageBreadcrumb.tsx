"use client";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { resolveOutreachView, outreachParentHref } from "@/lib/admin-routing";
import { DetailBreadcrumb } from "@/app/components/admin/DetailBreadcrumb";
export function DetailPageBreadcrumb({title,disabled=false}:{title:string;disabled?:boolean}){
 const {t,locale}=useI18n(), query=useSearchParams(); const tenant=query.get("tenant")==="univ"?"univ":"lg";
 const selected=resolveOutreachView(tenant,query.get("view"),query.get("workflow"));
 const label=locale==="ja"?`${t.universityOutreach.brand}（${t.outreachCommon.tabLabels[selected]}）`:`${t.universityOutreach.brand} (${t.outreachCommon.tabLabels[selected]})`;
 return <DetailBreadcrumb label={label} current={title} href={outreachParentHref(tenant,new URLSearchParams(query.toString()))} disabled={disabled}/>;
}
