import { outreachTableFrame } from "./outreach-table-layout";
import { OutreachListActions, outreachTabAction } from "./OutreachListActions";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { OutreachTableSkeleton } from "./OutreachTableSkeleton";
export function OutreachListPending({view}:{view:"campaigns"|"one-time"|"messages"}) {
 const {t}=useI18n(),d=t.outreachCommon,z=t.admin.zaad;
 const headers=view==="campaigns"?[d.groupName,z.campaigns.status,d.tabLabels["contact-lists"],d.campaignSync.type,z.residents.actions]:view==="messages"?[d.groupName,z.messages.body,z.messages.voice,d.messageUi.asset,z.residents.actions]:[d.groupName,d.dispatchUi.createdAt,z.oneTime.uniqueRecipients,d.dispatchUi.status,z.residents.actions];
 return <section className="space-y-5"><OutreachListActions>{view==="campaigns"&&<button className={outreachTabAction} disabled>{d.reload}</button>}{view!=="one-time"&&<button className={outreachTabAction} disabled>{d.sync}</button>}{view!=="campaigns"&&<button className={outreachTabAction} disabled>{z.common.create}</button>}</OutreachListActions><div className={outreachTableFrame}><table className="w-full min-w-[720px] text-left text-sm" aria-busy="true"><thead className="bg-surface-hover"><tr>{headers.map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="[&>tr:first-child]:border-t [&>tr:first-child]:border-line"><OutreachTableSkeleton columns={5}/></tbody></table></div></section>;
}
