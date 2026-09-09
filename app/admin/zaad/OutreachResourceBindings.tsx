"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { Select } from "@/app/components/Select";
import { MUNICIPAL_TOPICS } from "@/lib/zaad/municipal/contracts";
import { TOPICS } from "@/lib/zaad/university/contracts";
import { outreachMutation, outreachRequest, type ListResult } from "./outreach-client";
import { OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
type Binding = { id: string; resourceType: string; zoomId: string; departmentKey: string | null; notificationTopic: string | null; version: number };
type Preview = Binding & { accountId: string; observedDigest: string; name: string; running: boolean };
export function OutreachResourceBindings({ tenant, departments, setSaving, setDirty, close, saved }: OutreachPanelProps & { close: () => void; saved: () => void }) {
  const { t } = useI18n(), d = t.outreachCommon, z = t.admin.zaad;
  const [rows, setRows] = useState<Binding[] | null>(null), [type, setType] = useState("CONTACT_LIST"), [id, setId] = useState(""), [department, setDepartment] = useState(departments[0]), [topic, setTopic] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false), [reload, setReload] = useState(0);
  const lock = useRef(false), dirty = useRef(false), operation = useRef<string | null>(null);
  const types = { CONTACT_LIST: d.groups, CAMPAIGN: d.tabs[2], FLOW: d.flow, ASSET: d.media };
  useEffect(() => { const controller = new AbortController(); outreachRequest<ListResult<Binding>>(tenant, "resource-bindings", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setRows(result.items); }).catch(() => { if (!controller.signal.aborted) setError(z.common.failure); }); return () => controller.abort(); }, [tenant, reload, z.common.failure]);
  const change = () => { dirty.current = true; setDirty(true); operation.current = null; };
  const finish = () => { setDirty(false); close(); };
  const requestClose = () => { if (lock.current) return; if (dirty.current) setDiscard(true); else finish(); };
  async function review(resourceType = type, zoomId = id) {
    if (lock.current) return; lock.current = true; setBusy(true); setSaving?.(true); setError(""); setPreview(null);
    try { const result = await outreachMutation<Preview>(tenant, "resource-bindings/preview", { resourceType, zoomId }); setPreview(result); setType(resourceType); setId(zoomId); setDepartment(result.departmentKey ?? departments[0]); setTopic(result.notificationTopic ?? ""); }
    catch { setError(d.bindingConflict); } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  async function submit() {
    if (!preview || lock.current) return; lock.current = true; setBusy(true); setSaving?.(true); setError(""); operation.current ??= crypto.randomUUID();
    try { await outreachMutation(tenant, "resource-bindings", { operationKey: operation.current, resourceType: preview.resourceType, zoomId: preview.zoomId, accountId: preview.accountId, observedDigest: preview.observedDigest, version: preview.version, departmentKey: department, notificationTopic: topic || null }, "PUT"); dirty.current = false; setDirty(false); saved(); close(); }
    catch { setError(d.bindingConflict); } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  return <><ModalDialog title={d.bindingTitle} description={d.bindingHelp} onRequestClose={requestClose} locked={busy || discard} maxWidthClassName="max-w-3xl"><div className="space-y-5">{error && <p role="alert">{error}</p>}{rows === null ? error ? <button className={secondary} onClick={() => { setError(""); setReload(value => value + 1); }}>{z.common.retry}</button> : <OutreachLoading /> : <div className="max-h-40 divide-y divide-line overflow-y-auto">{rows.map(row => <button key={row.id} className="block w-full cursor-pointer break-all py-2 text-left text-sm text-accent hover:underline" disabled={busy} onClick={() => void review(row.resourceType, row.zoomId)}>{types[row.resourceType as keyof typeof types] ?? d.unknown} · {row.zoomId} · {row.departmentKey ? d.departments[row.departmentKey] : d.pending}</button>)}</div>}
    <form className="space-y-4" onChange={change} onSubmit={event => { event.preventDefault(); if (preview) void submit(); else void review(); }}><fieldset disabled={busy} className="space-y-4"><label className="block">{d.bindingType}<Select value={type} onChange={event => { setType(event.target.value); setPreview(null); }}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label><label className="block">{d.bindingId}<input className={input} required maxLength={100} value={id} onChange={event => { setId(event.target.value); setPreview(null); }} /></label>{preview && <><p className="break-all text-sm">{preview.name} · {d.bindingAccount}: {preview.accountId}</p><label className="block">{d.department}<Select value={department} onChange={event => setDepartment(event.target.value)}>{departments.map(key => <option value={key} key={key}>{d.departments[key] ?? d.unknown}</option>)}</Select></label><label className="block">{d.topic}<Select value={topic} onChange={event => setTopic(event.target.value)}><option value="">{d.pending}</option>{(tenant === "lg" ? MUNICIPAL_TOPICS : TOPICS).map((value, index) => <option key={value} value={value}>{tenant === "lg" ? t.municipalOutreach.topics[value] : t.universityOutreach.topicLabels[index]}</option>)}</Select></label>{preview.running && <p className="text-sm">{d.bindingConflict}</p>}</>}</fieldset><div className="flex justify-end gap-3"><button type="button" className={secondary} disabled={busy} onClick={requestClose}>{z.common.cancel}</button><button className={primary} disabled={busy || preview?.running}>{preview ? z.common.save : d.bindingConfirm}</button></div></form></div></ModalDialog>{discard && <ModalDialog title={d.confirmDiscard} description={d.bindingTitle} onRequestClose={() => setDiscard(false)}><div className="flex justify-end gap-3"><button className={secondary} onClick={() => setDiscard(false)}>{z.common.cancel}</button><button className={primary} onClick={finish}>{d.discard}</button></div></ModalDialog>}</>;
}
