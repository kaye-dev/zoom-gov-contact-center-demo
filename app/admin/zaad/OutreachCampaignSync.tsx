"use client";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import { useCallback, useEffect, useRef, useState } from "react";
import { Checkbox } from "@/app/components/Checkbox";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { OutreachApiError, outreachMutation, outreachRequest, type ListResult } from "./outreach-client";
import { type OutreachPanelProps } from "./OutreachView";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

export type CampaignCandidate = { id: string; name: string; status: string; dialingMethod: string; selectable: boolean; added: boolean; disabledReason: string | null };
export function OutreachCampaignSync({ tenant, writable, setDirty, setSaving, close, confirmed }: Pick<OutreachPanelProps, "tenant" | "setDirty" | "setSaving"> & { writable: boolean; close: () => void; confirmed: (ids: string[]) => Promise<void> }) {
  const { t } = useI18n(), d = t.outreachCommon, c = d.campaignSync, z = t.admin.zaad;
  const [candidates, setCandidates] = useState<CampaignCandidate[] | null>(null), [loading, setLoading] = useState(writable), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [discard, setDiscard] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lock = useRef(false), operation = useRef<string | null>(null), controller = useRef<AbortController | null>(null), cancel = useRef<HTMLButtonElement>(null);
  const pending = useRef<{ tenant: string; pages: Map<string, CampaignCandidate[]>; cursor?: string; seen: Set<string>; accountId?: string } | null>(null);
  const load = useCallback(() => {
    if (!writable || lock.current) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    const progress: NonNullable<typeof pending.current> = pending.current?.tenant === tenant ? pending.current : { tenant, pages: new Map<string, CampaignCandidate[]>(), seen: new Set<string>() };
    pending.current = progress;
    const readNext = (): Promise<void> => {
      const cursor = progress.cursor;
      return outreachRequest<ListResult<CampaignCandidate> & { accountId: string; incomplete: boolean }>(tenant, `campaigns/sync-candidates${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal: request.signal }).then(result => {
        if (request.signal.aborted) return;
        if (progress.accountId && progress.accountId !== result.accountId) throw new Error("Campaign account changed during inventory");
        progress.accountId = result.accountId;
        progress.pages.set(cursor ?? "", result.items);
        setCandidates([...new Map([...progress.pages.values()].flat().map(row => [row.id, row])).values()]);
        if (result.incomplete) { setReadFailed(true); setError(c.incomplete); setLoading(false); return; }
        if (result.nextCursor) {
          if (progress.seen.has(result.nextCursor) || progress.pages.size >= 100) throw new Error("Campaign pagination did not terminate");
          progress.seen.add(result.nextCursor); progress.cursor = result.nextCursor; return readNext();
        }
        pending.current = null; setReadFailed(false); setLoading(false);
      });
    };
    return readNext().catch(() => { if (!request.signal.aborted) { setReadFailed(true); setError(progress.pages.size ? c.incomplete : c.loadFailed); setLoading(false); } });
  }, [tenant, writable, c.loadFailed, c.incomplete]);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);
  useEffect(() => { if (!loading) heading.current?.focus(); }, [loading]);
  const finish = () => { controller.current?.abort(); setDirty(false); close(); };
  const requestClose = () => { if (lock.current) return; if (selected.length) setDiscard(true); else finish(); };
  const currentSelection = selected.length > 0 && selected.every(id => candidates?.some(row => row.id === id && row.selectable));
  async function save() {
    if (!writable || lock.current || (!unknown && (readFailed || !currentSelection))) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError(""); operation.current ??= crypto.randomUUID();
    try {
      let completed = false;
      if (unknown) {
        try { const previous = await outreachRequest<{ status: string }>(tenant, `campaigns/sync-operations/${encodeURIComponent(operation.current)}`); completed = previous.status === "COMPLETED"; }
        catch (error) { if (!(error instanceof OutreachApiError && error.status === 404)) throw error; }
      }
      if (!completed) { const result = await outreachMutation<{ status: string }>(tenant, "campaigns/sync-bindings", { operationKey: operation.current, campaignIds: selected }); if (result.status !== "COMPLETED") throw new Error("Campaign sync result is not confirmed"); }
      await confirmed(selected); setDirty(false);
    } catch (error) {
      if (error instanceof OutreachApiError && error.status >= 400 && error.status < 500) { setUnknown(false); operation.current = null; setError(error.status === 409 ? d.bindingConflict : z.common.failure); }
      else { setUnknown(true); setError(c.resultUnknown); }
    } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  const filtered = candidates?.filter(row => `${row.name} ${row.id}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <section aria-labelledby="campaign-sync-title" className="max-w-4xl space-y-6" aria-busy={loading || busy}>
    <h1 id="campaign-sync-title" ref={heading} tabIndex={-1} className="text-2xl font-bold">{c.title}</h1><DetailPageBreadcrumb title={c.title} disabled={busy} />
    <p className="font-semibold">{c.destination.replace("{tenant}", t.admin.industrySettings.names[tenant])}</p><p className="text-sm leading-7 text-fg-muted">{c.help}</p>
    {!writable ? <><p role="alert">{c.permission}</p><button className={secondary} onClick={requestClose}>{z.common.cancel}</button></> : <>
      {error && <p role="alert">{error}</p>}
      {!loading && candidates && selected.length > 0 && !currentSelection && !unknown && <p role="alert">{d.bindingConflict}</p>}
      <div className="flex flex-wrap items-end gap-3"><label className="block min-w-0 flex-1 text-sm font-semibold">{c.search}<input className={input} type="search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} /></label><button className={secondary} disabled={busy || loading || unknown} onClick={() => { setLoading(true); setError(""); void load(); }}>{d.reload}</button></div>
      {loading && <p role="status">{c.loading}</p>}
      {candidates && <div className="divide-y divide-line rounded-lg border border-line">{filtered.map(row => <label key={row.id} className={`flex min-h-16 min-w-0 items-start gap-3 p-4 ${row.selectable && !busy && !loading && !unknown ? "cursor-pointer" : ""}`}><Checkbox checked={selected.includes(row.id)} disabled={!row.selectable || busy || loading || unknown} onChange={event => { operation.current = null; const next = event.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id); setSelected(next); setDirty(next.length > 0); }} /><span className="min-w-0"><span className="block break-words font-semibold">{row.name}</span><span className="block break-all text-xs text-fg-muted">{row.id}</span><span className="mt-1 block text-sm text-fg-muted">{c.type}: {row.dialingMethod === "agentless" ? "Agentless Dialer" : row.dialingMethod === "unknown" ? d.unknown : row.dialingMethod} · {z.campaigns.status}: {d.stateLabels[row.status.toUpperCase()] ?? d.unknown}</span>{!row.selectable && <span className="mt-1 block text-sm">{row.added ? d.added : row.dialingMethod === "unknown" ? c.unknownType : c.agentlessRequired}</span>}</span></label>)}{!loading && !filtered.length && <p className="p-4 text-sm text-fg-muted">{candidates.length ? c.noMatches : c.noCandidates}</p>}</div>}
      <p role="status" className="text-sm font-semibold">{d.selected}: {selected.length}</p>
      <div className="flex flex-wrap gap-3"><button className={secondary} disabled={busy} onClick={requestClose}>{z.common.cancel}</button><button className={primary} disabled={busy || loading || (!unknown && (readFailed || !currentSelection))} onClick={() => void save()}>{busy ? c.adding : unknown ? z.common.retry : c.add.replace("{count}", String(selected.length))}</button></div>
    </>}
    {discard && <ModalDialog title={d.confirmDiscard} description={c.title} initialFocusRef={cancel} onRequestClose={() => setDiscard(false)}><div className="flex justify-end gap-3"><button ref={cancel} className={secondary} onClick={() => setDiscard(false)}>{z.common.cancel}</button><button className={primary} onClick={finish}>{d.discard}</button></div></ModalDialog>}
  </section>;
}
