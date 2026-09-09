"use client";
import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/app/components/Checkbox";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type { TenantKey } from "@/lib/tenants";
import { OutreachApiError, outreachMutation } from "./outreach-client";
import { OutreachLoading } from "./OutreachView";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

type Preview = { id: string; previewDigest: string; status: string; rows: { rowKey: string; name: string; phone: string | null; status: string; candidates: { id: string; name: string }[] }[] };
export function OutreachZoomImport({ tenant, groupId, contactId, close, saved, setSaving }: {
  tenant: TenantKey; groupId: string; contactId?: string; close: () => void; saved: () => void; setSaving?: (value: boolean) => void;
}) {
  const { t } = useI18n(), d = t.outreachCommon, z = t.admin.zaad, u = d.zoomImportUi;
  const [preview, setPreview] = useState<Preview | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [hasSaved, setHasSaved] = useState(false);
  const [error, setError] = useState<"request" | "changed" | null>(null), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const op = useRef<string | null>(null), lock = useRef(false), changed = useRef(false), cancel = useRef<HTMLButtonElement>(null);
  const retained = useRef<string[] | null>(null);
  useEffect(() => {
    let live = true; op.current ??= crypto.randomUUID();
    outreachMutation<Preview>(tenant, `contact-lists/${encodeURIComponent(groupId)}/crm-sync/preview`, { operationKey: op.current, ...(contactId ? { contactIds: [contactId] } : {}) })
      .then(result => {
        if (!live) return;
        setPreview(result);
        setSelected(result.rows.filter(row => row.status === "NEW" && (retained.current === null || retained.current.includes(row.rowKey))).map(row => row.rowKey));
      }).catch(() => { if (live) setError("request"); });
    return () => { live = false; };
  }, [tenant, groupId, contactId, retry]);
  function finish() { if (lock.current) return; if (changed.current) saved(); close(); }
  function refresh() {
    retained.current = preview ? selected : null;
    op.current = null; setPreview(null); setError(null); setRetry(value => value + 1);
  }
  async function apply() {
    if (!preview || lock.current || error === "changed" || !selected.length) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError(null);
    try {
      const result = await outreachMutation<Preview>(tenant, `contact-lists/${encodeURIComponent(groupId)}/crm-sync`, { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: selected });
      changed.current = true; setHasSaved(true); setPreview(result);
      setSelected(result.rows.filter(row => selected.includes(row.rowKey) && ["NEW", "FAILED"].includes(row.status)).map(row => row.rowKey));
    } catch (failure) {
      setError(failure instanceof OutreachApiError && ["TARGET_CHANGED", "PREVIEW_EXPIRED"].includes(failure.code) ? "changed" : "request");
    } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  const eligible = preview?.rows.some(row => selected.includes(row.rowKey) && ["NEW", "FAILED"].includes(row.status));
  function statusLabel(status: string) {
    if (status === "NEW") return u.addPending;
    if (status === "LINKED") return d.linked;
    if (status === "CANDIDATE") return d.importStates.MATCH;
    if (status === "INCOMPLETE") return u.incomplete;
    return d.importStates[status] ?? d.unknown;
  }
  return <ModalDialog title={contactId ? u.singleTitle : u.groupTitle} description={u.help} initialFocusRef={cancel} locked={busy} onRequestClose={finish} maxWidthClassName="max-w-3xl">
    <div className="space-y-5" aria-busy={busy}>
      {tenant === "univ" && <p className="text-sm leading-7">{u.studentHelp}</p>}
      {error && <div role="alert" className="space-y-3"><p>{error === "changed" ? u.changed : z.common.failure}</p>{(!preview || error === "changed") && <button className={secondary} onClick={refresh}>{d.reload}</button>}</div>}
      {!preview && !error && <OutreachLoading />}
      {preview && <>
        {preview.rows.some(row => row.status === "FAILED") && <p role="alert">{u.partial}</p>}
        {hasSaved && !preview.rows.some(row => row.status === "FAILED") && <p role="status">{u.saved}</p>}
        <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-line bg-surface-hover"><tr><th scope="col" className="px-4 py-3">{d.select}</th><th scope="col" className="px-4 py-3">{z.residents.name}</th><th scope="col" className="px-4 py-3">{z.residents.phone}</th><th scope="col" className="px-4 py-3">{u.contents}</th></tr></thead>
          <tbody className="divide-y divide-line">{preview.rows.map(row => <tr key={row.rowKey}>
            <td className="px-4 py-3"><Checkbox aria-label={`${row.name}: ${d.select}`} disabled={busy || error === "changed" || !["NEW", "FAILED"].includes(row.status)} checked={selected.includes(row.rowKey)} onChange={event => setSelected(current => event.target.checked ? [...current, row.rowKey] : current.filter(key => key !== row.rowKey))} /></td>
            <td className="px-4 py-3">{row.name}</td><td className="whitespace-nowrap px-4 py-3">{row.phone ?? d.unknown}</td><td className="px-4 py-3">{statusLabel(row.status)}{row.candidates?.map(candidate => <span key={candidate.id} className="block text-sm text-fg-muted">{candidate.name}</span>)}</td>
          </tr>)}</tbody>
        </table></div>
        <p role="status" className="text-sm">{d.selected}: {selected.length}</p><p className="text-sm leading-7 text-fg-muted">{d.consentRequired}</p>
      </>}
      <div className="flex flex-wrap justify-end gap-3"><button ref={cancel} className={secondary} disabled={busy} onClick={finish}>{hasSaved ? z.common.close : z.common.cancel}</button>{preview && <button className={primary} disabled={busy || error === "changed" || !eligible} onClick={() => void apply()}>{busy ? t.admin.industrySettings.saving : error === "request" ? z.common.retry : u.addPending}</button>}</div>
    </div>
  </ModalDialog>;
}
