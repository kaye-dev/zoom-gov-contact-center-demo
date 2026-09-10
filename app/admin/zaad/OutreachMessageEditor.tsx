"use client";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { Select } from "@/app/components/Select";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { OUTREACH_VOICES } from "@/lib/zaad/message-contracts";
import { OutreachApiError, outreachMutation } from "./outreach-client";
import type { OutreachPanelProps } from "./OutreachView";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

export type OutreachMessage = { id: string; name: string; body: string; voiceId: string; languageCode: string; departmentKey: string | null; version: number; generationState?: string; inUse?: boolean; zoomAssetId?: string | null; retiredAt?: string | null };
export function OutreachMessagePreview({ close }: { close: () => void }) {
  const { t } = useI18n(), m = t.outreachCommon.messageUi;
  const cancel = useRef<HTMLButtonElement>(null);
  return <ModalDialog title={m.previewTitle} description={m.previewHelp} initialFocusRef={cancel} onRequestClose={close}><div className="flex justify-end gap-3"><button className={secondary} disabled>{m.play}</button><button ref={cancel} className={primary} onClick={close}>{t.admin.zaad.common.close}</button></div></ModalDialog>;
}
export function OutreachMessageEditor({ message, close, saved, tenant, departments, permissions, setDirty, setSaving }: OutreachPanelProps & { message: OutreachMessage | null; close: () => void; saved: () => void }) {
  const { t } = useI18n(), z = t.admin.zaad, d = t.outreachCommon, m = d.messageUi;
  const [draft, setDraft] = useState<OutreachMessage>(() => message ?? { id: "", name: "", body: "", voiceId: "Tomoko", languageCode: "ja-JP", departmentKey: departments[0], version: 0 });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false), [preview, setPreview] = useState(false);
  const dirty = useRef(false), lock = useRef(false), cancel = useRef<HTMLButtonElement>(null), name = useRef<HTMLInputElement>(null);
  const writable = !message?.retiredAt && (message ? permissions.update : permissions.create);
  useEffect(() => { if (writable) name.current?.focus(); }, [writable]);
  function change(patch: Partial<OutreachMessage>) { if (!writable || lock.current) return; setDraft(current => ({ ...current, ...patch })); dirty.current = true; setDirty(true); }
  function finish() { dirty.current = false; setDirty(false); close(); }
  async function save() {
    if (!writable || lock.current) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError("");
    try {
      await outreachMutation(tenant, draft.id ? `messages/${encodeURIComponent(draft.id)}` : "messages", { name: draft.name, body: draft.body, voiceId: draft.voiceId, languageCode: draft.languageCode, departmentKey: draft.departmentKey, ...(draft.id ? { version: draft.version } : {}) }, draft.id ? "PATCH" : "POST");
      dirty.current = false; setDirty(false); saved();
    } catch (cause) { setError(cause instanceof OutreachApiError && cause.code === "VERSION_CONFLICT" ? m.conflict : z.common.failure); }
    finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  return <section className="max-w-3xl space-y-6" aria-labelledby="message-page-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 id="message-page-title" className="text-2xl font-bold">{message?.name ?? z.messages.createTitle}</h1></div><DetailPageBreadcrumb title={message?.name ?? z.messages.createTitle} disabled={busy} />
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      <fieldset className="space-y-5" disabled={busy || !writable}><legend className="sr-only">{message ? z.messages.editTitle : z.messages.createTitle}</legend>
        <label className="block">{d.groupName}<input ref={name} required maxLength={100} className={input} value={draft.name} onChange={event => change({ name: event.target.value })} /></label>
        <label className="block">{d.department}<Select value={draft.departmentKey ?? ""} onChange={event => change({ departmentKey: event.target.value })}><option value="" disabled>{d.select}</option>{departments.map(key => <option key={key} value={key}>{d.departments[key] ?? d.unknown}</option>)}</Select></label>
        <label className="block">{z.messages.body}<textarea required maxLength={2000} rows={6} className={input} value={draft.body} onChange={event => change({ body: event.target.value })} /></label>
        <label className="block">{z.messages.voice}<Select value={draft.voiceId} onChange={event => change({ voiceId: event.target.value })}>{OUTREACH_VOICES.map(voice => <option key={voice}>{voice}</option>)}</Select></label>
      </fieldset>
      <p className="text-sm leading-7 text-fg-muted">{d.audioGate}</p>{message && <p className="text-sm leading-7 text-fg-muted">{m.revisionHelp}</p>}
      <div className="flex flex-wrap gap-3">{writable && <button className={primary} disabled={busy}>{busy ? t.admin.industrySettings.saving : message ? z.common.save : z.common.create}</button>}<button type="button" className={secondary} disabled={busy} onClick={() => setPreview(true)}>{m.previewAction}</button></div>
    </form>
    {preview && <OutreachMessagePreview close={() => setPreview(false)} />}
    {discard && <ModalDialog title={d.confirmDiscard} description={draft.name} initialFocusRef={cancel} onRequestClose={() => setDiscard(false)}><div className="flex justify-end gap-3"><button ref={cancel} className={secondary} onClick={() => setDiscard(false)}>{z.common.cancel}</button><button className={primary} onClick={finish}>{d.discard}</button></div></ModalDialog>}
  </section>;
}
