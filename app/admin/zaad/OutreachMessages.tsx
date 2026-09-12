"use client";
import { Feedback } from "@/app/components/admin/Feedback";
import { useOutreachFeedback } from "./OutreachFeedbackProvider";
import { outreachTableFrame } from "./outreach-table-layout";
import { OutreachListActions, outreachTabAction } from "./OutreachListActions";
import { OutreachMessageSync } from "./OutreachMessageSync";
import { OutreachImportedAudioEditor } from "./OutreachImportedAudioEditor";
import { isImportedAudio, type ImportedAudioMessage } from "@/lib/zaad/message-import-contracts";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import { handleOutreachRowClick } from "./outreach-row-navigation";
import { OutreachTableSkeleton } from "./OutreachTableSkeleton";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { TableRowActions, type TableRowAction } from "@/app/components/admin/TableRowActions";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { OutreachApiError, outreachMutation, outreachRequest, type ListResult } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { OutreachMessageEditor, OutreachMessagePreview, type OutreachMessage } from "./OutreachMessageEditor";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

type CatalogMessage = (OutreachMessage & {sourceKind:"TEXT"}) | ImportedAudioMessage;
export function OutreachMessages(props: OutreachPanelProps) {
  const { tenant, permissions, setSaving } = props;
  const notify = useOutreachFeedback();
  const { t } = useI18n(), z = t.admin.zaad, d = t.outreachCommon, m = d.messageUi, c=d.messageImport, e=d.messageEdit;
  const router = useRouter(), query = useSearchParams(), state = query.get("state"), id = query.get("detail");
  const routeKey = `${tenant}:${id}`, editing = state === "message-edit" && Boolean(id);
  const listVisible = !state;
  const [data, setData] = useState<ListResult<CatalogMessage> | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<OutreachMessage | null>(null), [loadedKey, setLoadedKey] = useState(""), [detailFailure, setDetailFailure] = useState("");
  const [deleting, setDeleting] = useState<CatalogMessage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [preview, setPreview] = useState(false);
  const unlinkAttempt = useRef<{operationKey:string;expectedUpdatedAt:string;expectedDigest:string}|null>(null);
  const lock = useRef(false), cancel = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null), focusList = useRef(false);
  const [importNotice,setImportNotice]=useState("");
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => { if (!listVisible) return; const controller = new AbortController(); outreachRequest<ListResult<CatalogMessage>>(tenant, "message-catalog", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setData(result); setFailed(false); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [tenant, reload, listVisible]);
  useEffect(() => {
    if (!editing || !id) return;
    const controller = new AbortController();
    outreachRequest<OutreachMessage>(tenant, `messages/${encodeURIComponent(id)}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setDetail(result); setLoadedKey(routeKey); setDetailFailure(""); } }).catch(() => { if (!controller.signal.aborted) setDetailFailure(routeKey); });
    return () => controller.abort();
  }, [tenant, id, editing, routeKey, reload]);
  useEffect(() => { if (!editing && state !== "message-create" && data && focusList.current) { heading.current?.focus(); focusList.current = false; } }, [editing, state, data]);
  function href(nextState?: string, messageId?: string) { const params = new URLSearchParams(query.toString()); params.delete("state"); params.delete("detail"); if (nextState) params.set("state", nextState); if (messageId) params.set("detail", messageId); return `/admin/zaad?${params}`; }
  function back() { focusList.current = true; router.replace(href(), { scroll: false }); }
  function edit(row?: CatalogMessage) { if(row&&isImportedAudio(row)){router.push(href("message-audio-detail",row.id),{scroll:false});return;}  router.push(href(row ? "message-edit" : "message-create", row?.id), { scroll: false }); }
  function refresh() { setData(null); setFailed(false); setLoadedKey(""); setReload(value => value + 1); }
  function close() { if (!lock.current) { setDeleting(null); setError(""); } }
  async function remove(retire = false) {
    if (!deleting || lock.current || (retire ? !permissions.update : !permissions.delete)) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError("");
    try { if(isImportedAudio(deleting)){unlinkAttempt.current??={operationKey:crypto.randomUUID(),expectedUpdatedAt:deleting.updatedAt,expectedDigest:deleting.expectedDigest};await outreachMutation(tenant,`imported-audio-messages/${encodeURIComponent(deleting.id)}`,unlinkAttempt.current,"DELETE");unlinkAttempt.current=null;notify({id:crypto.randomUUID(),messageKey:"messageEdit.unlinked"});}else await outreachMutation(tenant, `messages/${encodeURIComponent(deleting.id)}${retire ? "/retire" : ""}`, { expectedUpdatedAt: deleting.updatedAt, expectedDigest: deleting.expectedDigest }, retire ? "POST" : "DELETE"); setDeleting(null); focusList.current = true; refresh(); }
    catch (cause) { const code = cause instanceof OutreachApiError ? cause.code : ""; setError(code === "MESSAGE_IN_USE" ? m.inUse : code === "ASSET_USAGE_NOT_VERIFIED" ? m.usageUnknown : code === "CONTENT_CHANGED" ? m.conflict : z.common.failure); }
    finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  function actions(row: CatalogMessage): TableRowAction[] {
    if(isImportedAudio(row)) return [{id:"edit",label:z.common.edit,disabled:busy||!props.fullAccess||!permissions.update,disabledReason:d.campaignSync.permission,onSelect:()=>edit(row)},{id:"delete",label:z.common.delete,tone:"danger",disabled:busy||!permissions.delete,disabledReason:d.campaignSync.permission,onSelect:()=>{unlinkAttempt.current=null;setDeleting(row);setError("");}}];
    return [{ id: "preview", label: m.previewAction, disabled: busy, onSelect: () => setPreview(true) }, ...(permissions.update ? [{ id: "edit", label: z.common.edit, disabled: busy, onSelect: () => edit(row) }] : []), ...(permissions.delete ? [{ id: "delete", label: z.common.delete, tone: "danger" as const, disabled: busy, onSelect: () => { setDeleting(row); setError(""); } }] : [])];
  }
  function generationLabel(row: CatalogMessage) { if(isImportedAudio(row))return c.imported; const labels: Record<string, string> = { NOT_GENERATED: m.notGenerated, GENERATING: m.generating, FAILED: m.failed, READY: m.ready }; return labels[row.generationState ?? ""] ?? m.unknown; }
  async function imported(ids:string[]){const result=await outreachRequest<ListResult<CatalogMessage>>(tenant,"message-catalog");if(!ids.every(id=>result.items.some(row=>row.id===id)))throw new Error("READBACK");setData(result);props.setDirty(false);setImportNotice(c.saved.replace("{count}",String(ids.length)));router.replace(`/admin/zaad?tenant=${tenant}&view=messages`,{scroll:false});}
  if(state==="message-sync")return <OutreachMessageSync {...props} confirmed={imported}/>;
  if(state==="message-audio-detail" && id)return <ImportedAudioLoader key={routeKey} {...props} id={id} saved={()=>{setImportNotice("");refresh();back();notify({id:crypto.randomUUID(),messageKey:"messageEdit.saved"});}}/>;
  const editorProps = { ...props, close: back, saved: () => { setImportNotice(""); refresh(); back(); notify({id:crypto.randomUUID(),messageKey:"messageUi.saved"}); } };
  if (state === "message-create") return <OutreachMessageEditor key={`${tenant}:new`} {...editorProps} message={null} />;
  if (editing && (loadedKey !== routeKey || detailFailure === routeKey)) return <div className="space-y-4"><h1 className="text-2xl font-bold">{z.messages.editTitle}</h1><DetailPageBreadcrumb title={z.messages.editTitle}/>{detailFailure === routeKey ? <OutreachFailure retry={() => { setDetailFailure(""); refresh(); }} /> : <OutreachLoading />}</div>;
  if (editing && detail) return <OutreachMessageEditor key={routeKey} {...editorProps} message={detail} />;
  return <div><OutreachListActions><h2 ref={heading} tabIndex={-1} className="sr-only">{d.tabLabels["messages"]}</h2><button className={outreachTabAction} disabled={busy||!props.fullAccess||!permissions.create||!permissions.update} onClick={()=>router.push(href("message-sync"),{scroll:false})}>{d.sync}</button>{permissions.create && <button className={outreachTabAction} disabled={busy} onClick={() => edit()}>{z.common.create}</button>}</OutreachListActions>
    {(importNotice || failed) && <div data-inline-feedback className="space-y-3 py-5">{importNotice && <Feedback tone="success" closeLabel={d.feedback.dismiss} onClose={() => setImportNotice("")}>{importNotice}</Feedback>}{failed && <OutreachFailure retry={refresh} />}</div>}
    <div className={outreachTableFrame}><table aria-busy={!data && !failed} className="w-full min-w-[720px] text-left text-sm"><thead className="bg-surface-hover"><tr><th className="px-4 py-3">{d.groupName}</th><th className="px-4 py-3">{z.messages.body}</th><th className="px-4 py-3">{z.messages.voice}</th><th className="px-4 py-3">{m.asset}</th><th className="px-4 py-3 text-center">{z.residents.actions}</th></tr></thead><tbody className="divide-y divide-line [&>tr:first-child]:border-t [&>tr:first-child]:border-line">{!data && !failed ? <OutreachTableSkeleton columns={5} /> : (data?.items ?? []).map(row => <tr key={row.id} className={busy ? "" : "cursor-pointer hover:bg-surface-hover/40"} onClick={event => handleOutreachRowClick(event, () => edit(row), busy)}><td className="px-4 py-3"><button className="cursor-pointer text-left font-semibold hover:text-accent disabled:cursor-not-allowed" disabled={busy} onClick={() => edit(row)}>{row.name}</button>{!isImportedAudio(row) && row.inUse && <p className="mt-1 text-xs text-fg-muted">{m.referenced}</p>}</td><td className="max-w-sm px-4 py-3"><p className="line-clamp-2 whitespace-pre-wrap break-words">{isImportedAudio(row)&&row.bodyState==="UNCHECKED"?d.audioPlayback.unknown:row.body??c.bodyMissing}</p>{isImportedAudio(row)&&row.body&&row.bodyState!=="UNCHECKED"&&<p className="mt-1 text-xs text-fg-muted">{row.bodyState==="PROVIDER_RETURNED"?d.audioPlayback.source:e.source}</p>}</td><td className="whitespace-nowrap px-4 py-3">{row.voiceId??c.voiceUnknown}<p className="text-xs text-fg-muted">{row.languageCode}</p></td><td className="whitespace-nowrap px-4 py-3">{generationLabel(row)}{row.zoomAssetId && <p className="max-w-xs truncate text-xs text-fg-muted" title={row.zoomAssetId}>{row.zoomAssetId}</p>}</td><td className="px-4 py-3"><div className="flex justify-center"><TableRowActions label={`${row.name}: ${z.residents.actions}`} open={menu === row.id} onOpenChange={value => setMenu(value ? row.id : null)} items={actions(row)} /></div></td></tr>)}</tbody></table></div>
    {preview && <OutreachMessagePreview close={() => setPreview(false)} />}
    {deleting && <ModalDialog initialFocusRef={cancel} title={isImportedAudio(deleting)?e.unlink:deleting.inUse?m.inUseTitle:z.messages.deleteTitle} description={deleting.name} locked={busy} onRequestClose={close}><p className="mb-4 text-sm">{isImportedAudio(deleting)?e.unlinkHelp:deleting.inUse?m.inUse:z.messages.deleteDescription}</p>{error && <Feedback tone="error" className="mb-4">{error}</Feedback>}<div className="flex flex-wrap justify-end gap-3"><button ref={cancel} className={secondary} disabled={busy} onClick={close}>{z.common.cancel}</button>{!isImportedAudio(deleting) && permissions.update && <button className={secondary} disabled={busy} onClick={() => void remove(true)}>{d.retire}</button>}<button className={primary} disabled={busy || !permissions.delete || (!isImportedAudio(deleting) && deleting.inUse)} onClick={() => void remove()}>{isImportedAudio(deleting)?e.unlink:z.common.delete}</button></div></ModalDialog>}
  </div>;
}

function ImportedAudioLoader(props: OutreachPanelProps & {id:string;saved:()=>void}) {
  const {tenant,id}=props;
  const { t } = useI18n(), title = t.outreachCommon.messageImport.detail;
  const [message, setMessage] = useState<ImportedAudioMessage | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    outreachRequest<{ message: ImportedAudioMessage }>(tenant, `imported-audio-messages/${encodeURIComponent(id)}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setMessage(result.message); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [tenant, id, reload]);
  return message ? <OutreachImportedAudioEditor {...props} message={message} /> : <section className="space-y-5"><h1 className="text-2xl font-bold">{title}</h1><DetailPageBreadcrumb title={title}/>{failed ? <OutreachFailure retry={() => { setFailed(false); setReload(value => value+1); }}/> : <OutreachLoading/>}</section>;
}
