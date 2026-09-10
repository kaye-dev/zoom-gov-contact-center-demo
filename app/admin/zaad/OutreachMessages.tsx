"use client";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { TableRowActions, type TableRowAction } from "@/app/components/admin/TableRowActions";
import { AdminFieldHelp } from "@/app/components/admin/AdminFieldHelp";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { OutreachApiError, outreachMutation, outreachRequest, type ListResult } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { OutreachMessageEditor, OutreachMessagePreview, type OutreachMessage } from "./OutreachMessageEditor";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

export function OutreachMessages(props: OutreachPanelProps) {
  const { tenant, permissions, setSaving } = props;
  const { t } = useI18n(), z = t.admin.zaad, d = t.outreachCommon, m = d.messageUi;
  const router = useRouter(), query = useSearchParams(), state = query.get("state"), id = query.get("detail");
  const routeKey = `${tenant}:${id}`, editing = state === "message-edit" && Boolean(id);
  const [data, setData] = useState<ListResult<OutreachMessage> | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<OutreachMessage | null>(null), [loadedKey, setLoadedKey] = useState(""), [detailFailure, setDetailFailure] = useState("");
  const [deleting, setDeleting] = useState<OutreachMessage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), [preview, setPreview] = useState(false);
  const lock = useRef(false), cancel = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null), focusList = useRef(false);
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); outreachRequest<ListResult<OutreachMessage>>(tenant, "messages", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [tenant, reload]);
  useEffect(() => {
    if (!editing || !id) return;
    const controller = new AbortController();
    outreachRequest<OutreachMessage>(tenant, `messages/${encodeURIComponent(id)}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setDetail(result); setLoadedKey(routeKey); setDetailFailure(""); } }).catch(() => { if (!controller.signal.aborted) setDetailFailure(routeKey); });
    return () => controller.abort();
  }, [tenant, id, editing, routeKey, reload]);
  useEffect(() => { if (!editing && state !== "message-create" && data && focusList.current) { heading.current?.focus(); focusList.current = false; } }, [editing, state, data]);
  function href(nextState?: string, messageId?: string) { const params = new URLSearchParams(query.toString()); params.delete("state"); params.delete("detail"); if (nextState) params.set("state", nextState); if (messageId) params.set("detail", messageId); return `/admin/zaad?${params}`; }
  function back() { focusList.current = true; router.replace(href(), { scroll: false }); }
  function edit(row?: OutreachMessage) { setSaved(false); router.push(href(row ? "message-edit" : "message-create", row?.id), { scroll: false }); }
  function refresh() { setFailed(false); setLoadedKey(""); setReload(value => value + 1); }
  function close() { if (!lock.current) { setDeleting(null); setError(""); } }
  async function remove(retire = false) {
    if (!deleting || lock.current || (retire ? !permissions.update : !permissions.delete)) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError("");
    try { await outreachMutation(tenant, `messages/${encodeURIComponent(deleting.id)}${retire ? "/retire" : ""}`, { version: deleting.version }, retire ? "POST" : "DELETE"); setDeleting(null); focusList.current = true; refresh(); }
    catch (cause) { const code = cause instanceof OutreachApiError ? cause.code : ""; setError(code === "MESSAGE_IN_USE" ? m.inUse : code === "ASSET_USAGE_NOT_VERIFIED" ? m.usageUnknown : code === "VERSION_CONFLICT" ? m.conflict : z.common.failure); }
    finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  function actions(row: OutreachMessage): TableRowAction[] {
    return [{ id: "preview", label: m.previewAction, disabled: busy, onSelect: () => setPreview(true) }, ...(permissions.update ? [{ id: "edit", label: z.common.edit, disabled: busy, onSelect: () => edit(row) }] : []), ...(permissions.delete ? [{ id: "delete", label: z.common.delete, tone: "danger" as const, disabled: busy, onSelect: () => { setDeleting(row); setError(""); } }] : [])];
  }
  function generationLabel(row: OutreachMessage) { const labels: Record<string, string> = { NOT_GENERATED: m.notGenerated, GENERATING: m.generating, FAILED: m.failed, READY: m.ready }; return labels[row.generationState ?? ""] ?? m.unknown; }
  const editorProps = { ...props, close: back, saved: () => { setSaved(true); refresh(); back(); } };
  if (state === "message-create") return <OutreachMessageEditor key={`${tenant}:new`} {...editorProps} message={null} />;
  if (editing && (loadedKey !== routeKey || detailFailure === routeKey)) return <div className="space-y-4"><h1 className="text-2xl font-bold">{z.messages.editTitle}</h1><DetailPageBreadcrumb title={z.messages.editTitle} />{detailFailure === routeKey ? <OutreachFailure retry={() => { setDetailFailure(""); refresh(); }} /> : <OutreachLoading />}</div>;
  if (editing && detail) return <OutreachMessageEditor key={routeKey} {...editorProps} message={detail} />;
  if (failed) return <OutreachFailure retry={refresh} />;
  if (!data) return <OutreachLoading />;
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 ref={heading} tabIndex={-1} className="text-lg font-bold">{d.tabLabels["messages"]}</h2><AdminFieldHelp id="outreach-messages-audio-help" label={d.tabLabels["messages"]} description={d.audioGate} portal /></div>{permissions.create && <button className={primary} disabled={busy} onClick={() => edit()}>{z.common.create}</button>}</div>
    {saved && <p role="status">{m.saved}</p>}
    <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-line bg-surface-hover"><tr><th className="px-4 py-3">{d.groupName}</th><th className="px-4 py-3">{z.messages.body}</th><th className="px-4 py-3">{z.messages.voice}</th><th className="px-4 py-3">{m.asset}</th><th className="px-4 py-3 text-center">{z.residents.actions}</th></tr></thead><tbody className="divide-y divide-line">{data.items.map(row => <tr key={row.id}><td className="px-4 py-3"><button className="cursor-pointer text-left font-semibold hover:text-accent disabled:cursor-not-allowed" disabled={busy} onClick={() => edit(row)}>{row.name}</button><p className="mt-1 text-xs text-fg-muted">{d.version} {row.version}{row.inUse ? ` · ${m.referenced}` : ""}</p></td><td className="max-w-sm px-4 py-3"><p className="line-clamp-2 whitespace-pre-wrap break-words">{row.body}</p></td><td className="whitespace-nowrap px-4 py-3">{row.voiceId}<p className="text-xs text-fg-muted">{row.languageCode}</p></td><td className="whitespace-nowrap px-4 py-3">{generationLabel(row)}{row.zoomAssetId && <p className="max-w-xs truncate text-xs text-fg-muted" title={row.zoomAssetId}>{row.zoomAssetId}</p>}</td><td className="px-4 py-3"><div className="flex justify-center"><TableRowActions label={`${row.name}: ${z.residents.actions}`} open={menu === row.id} onOpenChange={value => setMenu(value ? row.id : null)} items={actions(row)} /></div></td></tr>)}</tbody></table></div>
    {preview && <OutreachMessagePreview close={() => setPreview(false)} />}
    {deleting && <ModalDialog initialFocusRef={cancel} title={deleting.inUse ? m.inUseTitle : z.messages.deleteTitle} description={deleting.name} locked={busy} onRequestClose={close}><p className="mb-4 text-sm">{deleting.inUse ? m.inUse : z.messages.deleteDescription}</p>{error && <p role="alert" className="mb-4">{error}</p>}<div className="flex flex-wrap justify-end gap-3"><button ref={cancel} className={secondary} disabled={busy} onClick={close}>{z.common.cancel}</button>{permissions.update && <button className={secondary} disabled={busy} onClick={() => void remove(true)}>{d.retire}</button>}<button className={primary} disabled={busy || !permissions.delete || deleting.inUse} onClick={() => void remove()}>{z.common.delete}</button></div></ModalDialog>}
  </div>;
}
