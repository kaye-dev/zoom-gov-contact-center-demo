"use client";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import { useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { Select } from "@/app/components/Select";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { CASES } from "@/lib/zaad/university/demo";
import { outreachMutation } from "./outreach-client";
import type { OutreachPanelProps } from "./OutreachView";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

export type OutreachGroup = { kind?: "DEFAULT" | "REGULAR"; topicKey?: string; contactListId?: string | null; bindingState?: string; id: string; name: string; description: string; departmentKey: string | null; version: number; revision: string; updatedAt?: string | null; contactCount: number | null; mutationBlock?: "GROUP_IN_USE" | "CAMPAIGN_REFERENCE_UNKNOWN" | null };
export function OutreachGroupEditor({ group, close, saved, tenant, departments, permissions, setDirty, setSaving }: OutreachPanelProps & { group: OutreachGroup | null; close: () => void; saved: () => void }) {
  const { t } = useI18n(), z = t.admin.zaad, d = t.outreachCommon;
  const [draft, setDraft] = useState(() => group ?? { id: "", name: "", description: "", departmentKey: departments[0], version: 0, revision: "", contactCount: 0 });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false);
  const dirty = useRef(false), lock = useRef(false), operation = useRef<string | null>(null), cancel = useRef<HTMLButtonElement>(null);
  const writable = group ? permissions.update && !group.mutationBlock : permissions.create;
  function change(patch: Partial<OutreachGroup>) { if (!writable || lock.current) return; setDraft(current => ({ ...current, ...patch })); operation.current = null; dirty.current = true; setDirty(true); }
  function finish() { dirty.current = false; setDirty(false); close(); }
  async function save() {
    if (!writable || lock.current) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError(""); operation.current ??= crypto.randomUUID();
    try {
      await outreachMutation(tenant, draft.id ? `contact-lists/${encodeURIComponent(draft.id)}` : "contact-lists", { operationKey: operation.current, name: draft.name, description: draft.description, departmentKey: draft.departmentKey, ...(draft.id ? { version: draft.version, expectedRevision: draft.revision } : {}) }, draft.id ? "PATCH" : "POST");
      dirty.current = false; setDirty(false); saved();
    } catch { setError(z.common.failure); }
    finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  return <section className="max-w-3xl space-y-6" aria-labelledby="group-page-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 id="group-page-title" className="text-2xl font-bold">{group?.name ?? d.groupCreate}</h1></div><DetailPageBreadcrumb title={group?.name ?? d.groupCreate} disabled={busy} />
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
      {group && <p className="text-sm leading-7 text-fg-muted">{d.groupSync.sharedEdit}</p>}
      {group?.mutationBlock && <p role="alert" className="text-sm leading-7">{d.groupMutationBlocks[group.mutationBlock]}</p>}
      {error && <p role="alert">{error}</p>}
      <fieldset className="space-y-5" disabled={busy || !writable}><legend className="sr-only">{group ? d.groupEdit : d.groupCreate}</legend>
        {tenant === "univ" && !group && <label className="block">{d.examples}<Select defaultValue="" onChange={event => { const example = CASES.find(row => row.id === event.target.value); if (example) change({ name: t.universityOutreach.templateText[example.name], description: t.universityOutreach.templateText[example.purpose] }); }}><option value="">{d.select}</option>{CASES.map(example => <option key={example.id} value={example.id}>{t.universityOutreach.templateText[example.name]}</option>)}</Select></label>}
        <label className="block">{d.groupName}<input required className={input} maxLength={100} value={draft.name} onChange={event => change({ name: event.target.value })} /></label>
        <label className="block">{z.contactLists.descriptionLabel}<textarea className={input} maxLength={500} value={draft.description} onChange={event => change({ description: event.target.value })} /></label>
        <label className="block">{d.department}<Select required value={draft.departmentKey ?? ""} onChange={event => change({ departmentKey: event.target.value })}><option value="" disabled>{d.groupSync.unassigned}</option>{departments.map(key => <option key={key} value={key}>{d.departments[key] ?? d.unknown}</option>)}</Select></label>
      </fieldset>
      {!group && <p className="text-sm leading-7 text-fg-muted">{d.emptyGroupHelp}</p>}
      {writable && <button className={primary} disabled={busy}>{busy ? t.admin.industrySettings.saving : group ? z.common.save : z.common.create}</button>}
    </form>
    {discard && <ModalDialog title={d.confirmDiscard} description={draft.name} initialFocusRef={cancel} onRequestClose={() => setDiscard(false)}><div className="flex justify-end gap-3"><button ref={cancel} className={secondary} onClick={() => setDiscard(false)}>{z.common.cancel}</button><button className={primary} onClick={finish}>{d.discard}</button></div></ModalDialog>}
  </section>;
}
