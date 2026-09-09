"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { Checkbox } from "@/app/components/Checkbox";
import { Select } from "@/app/components/Select";
import { outreachMutation, outreachRequest } from "./outreach-client";
import type { OutreachPanelProps } from "./OutreachView";
import { registrationInputClass as input, outreachPrimary as primary } from "@/app/notifications/register/StudentNotificationRegistration";
type Notice = { departmentKey: string; callerPhone: string; officeUrl: string; version: number };
export function MunicipalCallerNoticeSettings({ departments, permissions, setDirty, setSaving }: OutreachPanelProps) {
  const { t } = useI18n(), d = t.outreachCommon, w = t.municipalWorkflows, z = t.admin.zaad;
  const [items, setItems] = useState<Notice[]>([]), [department, setDepartment] = useState(departments[0]), [phone, setPhone] = useState(""), [url, setUrl] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(false), [success, setSuccess] = useState(false);
  const lock = useRef(false);
  const [edited, setEdited] = useState(false);
  const departmentKeys = departments.join("|");
  useEffect(() => { const controller = new AbortController(); outreachRequest<{ items: Notice[] }>("lg", "municipal/caller-notices", { signal: controller.signal }).then(result => { if (controller.signal.aborted) return; setItems(result.items); const initial = result.items.find(row => row.departmentKey === departmentKeys.split("|")[0]); setPhone(initial?.callerPhone ?? ""); setUrl(initial?.officeUrl ?? ""); setLoaded(true); }).catch(() => { if (!controller.signal.aborted) setError(true); }); return () => controller.abort(); }, [departmentKeys]);
  const change = () => { setEdited(true); setDirty(true); setSuccess(false); };
  async function save() {
    if (lock.current || !loaded) return; lock.current = true; setBusy(true); setSaving?.(true); setError(false);
    try { const result = await outreachMutation<{ notice: Notice }>("lg", "municipal/caller-notices", { departmentKey: department, callerPhone: phone, officeUrl: url, version: items.find(row => row.departmentKey === department)?.version ?? 0, publicationConfirmed: confirmed }, "PUT"); setItems(current => [...current.filter(row => row.departmentKey !== department), result.notice]); setPhone(result.notice.callerPhone); setUrl(result.notice.officeUrl); setConfirmed(false); setEdited(false); setDirty(false); setSuccess(true); } catch { setError(true); } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  return <form className="space-y-4 border-t border-line pt-6" onSubmit={event => { event.preventDefault(); void save(); }}><h3 className="font-semibold">{w.callerPhone}</h3>{error && <p role="alert">{z.common.failure}</p>}{success && <p role="status">{z.common.success}</p>}<fieldset disabled={busy || !loaded || !permissions.update} className="space-y-4"><label className="block">{d.department}<Select value={department} disabled={edited} onChange={event => { const key = event.target.value, row = items.find(item => item.departmentKey === key); setDepartment(key); setPhone(row?.callerPhone ?? ""); setUrl(row?.officeUrl ?? ""); setConfirmed(false); setSuccess(false); }}>{departments.map(key => <option value={key} key={key}>{d.departments[key] ?? d.unknown}</option>)}</Select></label><label className="block">{w.callerPhone}<input className={input} type="tel" required value={phone} onChange={event => { setPhone(event.target.value); change(); }} /></label><label className="block">{w.officialOffice}<input className={input} type="url" required maxLength={500} value={url} onChange={event => { setUrl(event.target.value); change(); }} /></label><label className="flex items-start gap-3"><Checkbox checked={confirmed} onChange={event => { setConfirmed(event.target.checked); change(); }} />{d.publicationConfirmed}</label></fieldset><button className={primary} disabled={busy || !loaded || !permissions.update || !confirmed}>{z.common.save}</button></form>;
}
