"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { Select } from "@/app/components/Select";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { type ContactDto, referenceKey } from "@/lib/zaad/outreach-contracts";
import type { TenantKey } from "@/lib/tenants";
import { OutreachApiError, outreachAll, outreachMutation } from "./outreach-client";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

export type GroupMember = { id: string; displayName: string; phones: { number: string }[]; observedDigest: string; mapping: { syncState: string; version: number; personId: string | null; personOrigin: string | null } | null };
export type MemberAction = { mode: "add" | "edit" | "delete" | "link"; member?: GroupMember };
export function OutreachGroupMember({ tenant, group, action, close, saved, setDirty, setSaving }: {
  tenant: TenantKey; group: { id: string; name: string; departmentKey: string | null }; action: MemberAction;
  close: () => void; saved: () => void; setDirty: (value: boolean) => void; setSaving?: (value: boolean) => void;
}) {
  const { t } = useI18n(), d = t.outreachCommon, z = t.admin.zaad;
  const { mode, member } = action, selecting = mode === "add" || mode === "link";
  const [contacts, setContacts] = useState<ContactDto[] | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(""), [name, setName] = useState(member?.displayName ?? ""), [phone, setPhone] = useState(member?.phones[0]?.number ?? ""), [attestation, setAttestation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false);
  const deleteCancelRef = useRef<HTMLButtonElement>(null), discardCancelRef = useRef<HTMLButtonElement>(null);
  const dirty = useRef(false), lock = useRef(false), operation = useRef<string | null>(null);
  const changed = () => { dirty.current = true; setDirty(true); operation.current = null; };
  useEffect(() => {
    if (!selecting) return;
    const controller = new AbortController();
    outreachAll<ContactDto>(tenant, "contacts", { signal: controller.signal }).then(rows => {
      if (!controller.signal.aborted) { setContacts(rows.filter(row => row.departmentKey === group.departmentKey && row.reference.origin !== "IMPORT_CANDIDATE")); setFailed(false); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [tenant, selecting, group.departmentKey, reload]);
  const finish = () => { setDirty(false); close(); };
  const requestClose = () => { if (lock.current) return; if (dirty.current) setDiscard(true); else finish(); };
  async function submit() {
    if (lock.current) return;
    const crm = contacts?.find(row => referenceKey(row.reference) === selected);
    if (selecting && !crm) { setError(z.common.failure); return; }
    lock.current = true; setBusy(true); setSaving?.(true); setError(""); operation.current ??= crypto.randomUUID();
    const path = `contact-lists/${encodeURIComponent(group.id)}/contacts${member ? `/${encodeURIComponent(member.id)}` : ""}`;
    try {
      if (mode === "link") await outreachMutation(tenant, `${path}/link`, { reference: crm!.reference, attestation, version: member!.mapping?.version, expectedDigest: member!.observedDigest });
      else if (mode === "add") await outreachMutation(tenant, path, { operationKey: operation.current, reference: crm!.reference });
      else await outreachMutation(tenant, path, { operationKey: operation.current, expectedDigest: member!.observedDigest, ...(mode === "edit" ? { name, phone } : {}) }, mode === "edit" ? "PATCH" : "DELETE");
      dirty.current = false; setDirty(false); saved(); close();
    } catch (failure) { setError(failure instanceof OutreachApiError ? (Object.hasOwn(d.memberErrors, failure.code) ? d.memberErrors[failure.code as keyof typeof d.memberErrors] : z.common.failure) : z.common.failure); } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  const title = mode === "add" ? d.memberAdd : mode === "edit" ? d.memberEdit : mode === "delete" ? d.memberDelete : d.link;
  return <>
    <ModalDialog initialFocusRef={mode === "delete" ? deleteCancelRef : undefined} title={title} description={group.name} locked={busy || discard} onRequestClose={requestClose}>
      <form className="space-y-4" onChange={changed} onSubmit={event => { event.preventDefault(); void submit(); }}>
        <p className="text-sm leading-6 text-fg-muted">{d.memberBoundary}</p>
        {(mode === "edit" || mode === "add") && <p className="text-sm leading-6 text-fg-muted">{d.groupSync.sharedEdit}</p>}
        {mode === "delete" && <p className="text-sm leading-6 text-fg-muted">{d.groupSync.sharedMemberDelete}</p>}
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={busy} className="space-y-4">
          {selecting && (failed ? <div role="alert"><p>{z.common.failure}</p><button type="button" className={secondary} onClick={() => setReload(value => value + 1)}>{z.common.retry}</button></div> : contacts === null ? <p role="status">{z.common.loading}</p> : <label className="block">{d.people}<Select required value={selected} onChange={event => setSelected(event.target.value)}><option value="">{d.select}</option>{contacts.map(row => <option key={referenceKey(row.reference)} value={referenceKey(row.reference)}>{row.name} · {row.phone}{row.studentNumber ? ` · ${row.studentNumber}` : ""}</option>)}</Select></label>)}
          {mode === "link" && <label className="block">{d.attestation}<textarea required maxLength={2000} className={input} value={attestation} onChange={event => setAttestation(event.target.value)} /></label>}
          {mode === "edit" && <><label className="block">{z.residents.name}<input required maxLength={100} className={input} value={name} onChange={event => setName(event.target.value)} /></label><label className="block">{z.residents.phone}<input required type="tel" className={input} value={phone} onChange={event => setPhone(event.target.value)} /></label></>}
          {mode === "delete" && <p>{member?.displayName} · {member?.phones.map(row => row.number).join(" / ")}</p>}
        </fieldset>
        <div className="flex justify-end gap-3"><button ref={deleteCancelRef} type="button" className={secondary} disabled={busy} onClick={requestClose}>{z.common.cancel}</button><button className={primary} disabled={busy || (selecting && (!selected || failed))}>{mode === "delete" ? z.common.delete : z.common.save}</button></div>
      </form>
    </ModalDialog>
    {discard && <ModalDialog initialFocusRef={discardCancelRef} title={d.confirmDiscard} description={title} onRequestClose={() => setDiscard(false)}><div className="flex justify-end gap-3"><button ref={discardCancelRef} className={secondary} onClick={() => setDiscard(false)}>{z.common.cancel}</button><button className={primary} onClick={finish}>{d.discard}</button></div></ModalDialog>}
  </>;
}
