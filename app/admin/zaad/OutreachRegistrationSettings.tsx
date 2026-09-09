"use client";
import { MunicipalCallerNoticeSettings } from "./MunicipalCallerNoticeSettings";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { Checkbox } from "@/app/components/Checkbox";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { outreachMutation, outreachRequest } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
type Setting = { enabled: boolean; version: number };
export function OutreachRegistrationSettings(props: OutreachPanelProps & { close: () => void }) {
  const { tenant, permissions, setDirty, setSaving, close } = props;
  const callerDirty = useRef(false);
  const { t } = useI18n(), d = t.outreachCommon, z = t.admin.zaad;
  const [setting, setSetting] = useState<Setting | null>(null), [enabled, setEnabled] = useState(false), [failed, setFailed] = useState(false), [reload, setReload] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(false), [success, setSuccess] = useState(false), [discard, setDiscard] = useState(false);
  const lock = useRef(false);
  useEffect(() => { const controller = new AbortController(); outreachRequest<{ setting: Setting }>(tenant, "registration-reception", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setSetting(result.setting); setEnabled(result.setting.enabled); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [tenant, reload]);
  const finish = () => { setDirty(false); close(); };
  const requestClose = () => { if (lock.current || busy) return; if (callerDirty.current || (setting && setting.enabled !== enabled)) setDiscard(true); else finish(); };
  async function save() {
    if (lock.current || !setting) return; lock.current = true; setBusy(true); setSaving?.(true); setError(false); setSuccess(false);
    try { const result = await outreachMutation<{ setting: Setting }>(tenant, "registration-reception", { enabled, version: setting.version }, "PUT"); setSetting(result.setting); setDirty(callerDirty.current); setSuccess(true); }
    catch { setError(true); } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  if (failed) return <OutreachFailure retry={() => { setFailed(false); setReload(value => value + 1); }} />;
  if (!setting) return <OutreachLoading />;
  return <section className="max-w-3xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{d.registrationSettings}</h2><button className={secondary} disabled={busy} onClick={requestClose}>{z.common.previous}</button></div><p className="text-sm leading-6 text-fg-muted">{d.registrationHelp}</p><form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>{error && <p role="alert">{z.common.failure}</p>}{success && <p role="status">{z.common.success}</p>}<label className="flex items-start gap-3"><Checkbox checked={enabled} disabled={busy || !permissions.update} onChange={event => { setEnabled(event.target.checked); setDirty(callerDirty.current || event.target.checked !== setting.enabled); setSuccess(false); }} />{d.registrationEnabled}</label>{permissions.update && <button className={primary} disabled={busy || setting.enabled === enabled}>{z.common.save}</button>}</form>{tenant === "lg" && <MunicipalCallerNoticeSettings {...props} setSaving={value => { setBusy(value); setSaving?.(value); }} setDirty={value => { callerDirty.current = value; setDirty(value || setting.enabled !== enabled); }} />}{discard && <ModalDialog title={d.confirmDiscard} description={d.registrationSettings} onRequestClose={() => setDiscard(false)}><div className="flex justify-end gap-3"><button className={secondary} onClick={() => setDiscard(false)}>{z.common.cancel}</button><button className={primary} onClick={finish}>{d.discard}</button></div></ModalDialog>}</section>;
}
