"use client";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";

import { useCallback, useEffect, useRef, useState } from "react";
import { Checkbox } from "@/app/components/Checkbox";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { SearchInput } from "@/app/components/admin/SearchInput";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type { GroupSyncCandidate } from "@/lib/server/zaad/group-sync";
import { formatGroupUpdatedAt, sortContactLists, type GroupSortKey } from "@/lib/zaad/group-sync";
import { outreachMutation, outreachRequest, OutreachApiError, type ListResult } from "./outreach-client";
import type { OutreachPanelProps } from "./OutreachView";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

type Inventory = { accountId: string; items: GroupSyncCandidate[] };
type Props = Pick<OutreachPanelProps, "tenant" | "setDirty" | "setSaving"> & {
  writable: boolean; close: () => void; confirmed: (ids: string[]) => Promise<void>;
};
export function OutreachGroupSync({ tenant, writable, setDirty, setSaving, close, confirmed }: Props) {
  const { t, locale } = useI18n(), d = t.outreachCommon, c = d.groupSync, z = t.admin.zaad;
  const [inventory, setInventory] = useState<Inventory | null>(null), [loading, setLoading] = useState(writable), [readFailed, setReadFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState(""), [sort, setSort] = useState<GroupSortKey>("name"), [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false);
  const lock = useRef(false), controller = useRef<AbortController | null>(null), heading = useRef<HTMLHeadingElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const operation = useRef<{ key: string; accountId: string; ids: string[] } | null>(null);
  const load = useCallback(async () => {
    if (!writable || lock.current) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    let accountId: string | null = null, cursor: string | null = null;
    const items = new Map<string, GroupSyncCandidate>(), seen = new Set<string>();
    async function readPages() {
      for (let page = 0; page < 100; page++) {
        const result: ListResult<GroupSyncCandidate> & { accountId: string } = await outreachRequest(tenant, `contact-lists/sync-candidates${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal: request.signal });
        if (request.signal.aborted) return;
        if (!result.accountId || !Array.isArray(result.items)) throw new OutreachApiError("INVALID_RESPONSE", 502);
        if (accountId && accountId !== result.accountId) throw new OutreachApiError("ACCOUNT_CHANGED", 409);
        accountId = result.accountId;
        for (const row of result.items) items.set(row.id, row);
        if (!result.nextCursor) return { accountId, items: [...items.values()] };
        if (seen.has(result.nextCursor) || page === 99) throw new OutreachApiError("PAGINATION_LIMIT", 502);
        seen.add(result.nextCursor); cursor = result.nextCursor;
      }
    }
    return readPages().then(result => {
      if (request.signal.aborted || !result) return;
      setInventory(result);
      setSelected(previous => previous.filter(id => items.get(id)?.selectable));
      setReadFailed(false); setLoading(false);
    }).catch(failure => {
      if (request.signal.aborted) return;
      setReadFailed(true);
      setError(failure instanceof OutreachApiError && failure.code === "ACCOUNT_CHANGED" ? c.accountChanged : items.size ? c.incomplete : c.loadFailed);
      setLoading(false);
    });
  }, [tenant, writable, c.accountChanged, c.incomplete, c.loadFailed]);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { setDirty(selected.length > 0 || unknown); }, [selected.length, unknown, setDirty]);
  const finish = () => { controller.current?.abort(); setDirty(false); close(); };
  const requestClose = () => { if (lock.current) return; if (selected.length || unknown) setDiscard(true); else finish(); };
  const rows = sortContactLists((inventory?.items ?? []).filter(row => row.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))), sort, direction, locale);
  const selectable = rows.filter(row => row.selectable), selectedVisible = selectable.filter(row => selected.includes(row.id)).length;
  const currentSelection = selected.length > 0 && selected.every(id => inventory?.items.some(row => row.id === id && row.selectable));
  const blocked = busy || loading || readFailed || unknown || !writable;
  function choose(ids: string[]) {
    if (blocked) return;
    if (ids.length > 100) { setError(c.limit); return; }
    operation.current = null; setSelected(ids); setError("");
  }
  function reorder(key: GroupSortKey) { setDirection(sort === key && direction === "asc" ? "desc" : "asc"); setSort(key); }
  async function save() {
    if (!writable || lock.current || !inventory || (!unknown && (readFailed || loading || !currentSelection))) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError("");
    operation.current ??= { key: crypto.randomUUID(), accountId: inventory.accountId, ids: [...selected] };
    const current = operation.current;
    try {
      let completed = false;
      if (unknown) {
        try { const previous = await outreachRequest<{ status: string }>(tenant, `contact-lists/sync-operations/${encodeURIComponent(current.key)}`); completed = previous.status === "COMPLETED"; }
        catch (failure) { if (!(failure instanceof OutreachApiError && failure.status === 404)) throw failure; }
      }
      if (!completed) {
        const result = await outreachMutation<{ status: string }>(tenant, "contact-lists/sync-bindings", { operationKey: current.key, accountId: current.accountId, contactListIds: current.ids });
        if (result.status !== "COMPLETED") throw new Error("Sync result is not confirmed");
      }
      await confirmed(current.ids); setDirty(false);
    } catch (failure) {
      if (failure instanceof OutreachApiError && failure.status >= 400 && failure.status < 500) {
        setUnknown(false); operation.current = null;
        setError(failure.code === "ACCOUNT_CHANGED" ? c.accountChanged : failure.status === 409 || failure.status === 404 ? c.conflict : z.common.failure);
        setReadFailed(true);
      } else { setUnknown(true); setError(c.resultUnknown); }
    } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  return <section aria-labelledby="group-sync-title" className="max-w-4xl space-y-6" aria-busy={loading || busy} data-group-sync-state={busy ? "saving" : unknown ? "unknown" : loading ? "loading" : readFailed ? "error" : selected.length ? "selected" : rows.length ? "ready" : "empty"}>
    <h1 id="group-sync-title" ref={heading} tabIndex={-1} className="text-2xl font-bold">{c.title}</h1><DetailPageBreadcrumb title={c.title} disabled={busy} />
    <p className="font-semibold">{c.destination.replace("{tenant}", t.admin.industrySettings.names[tenant])}</p>
    {!writable ? <p role="alert">{c.permission}</p> : <>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1 space-y-2"><label className="block text-sm font-semibold" htmlFor="group-sync-search">{c.search}</label><SearchInput id="group-sync-search" label={c.search} value={query} disabled={busy || unknown} onChange={event => setQuery(event.target.value)} /></div><button className={secondary} disabled={busy || loading || unknown} onClick={() => { setLoading(true); setReadFailed(false); setError(""); setSelected([]); operation.current = null; void load(); }}>{d.reload}</button></div>
      {loading && <p role="status">{z.common.loading}</p>}
      {!!rows.length && <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-line"><tr><th scope="col" className="w-12 p-3"><Checkbox aria-label={c.selectAll} checked={selectable.length > 0 && selectedVisible === selectable.length} indeterminate={selectedVisible > 0 && selectedVisible < selectable.length} disabled={blocked || !selectable.length} onChange={event => choose(event.target.checked ? [...new Set([...selected, ...selectable.map(row => row.id)])] : selected.filter(id => !selectable.some(row => row.id === id)))} /></th>{([["name", c.name], ["updatedAt", c.updatedAt], ["contactCount", c.contacts]] as const).map(([key, label]) => <th key={key} scope="col" aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"} className="p-3"><button type="button" className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed" disabled={busy || unknown} onClick={() => reorder(key)}>{label}<span aria-hidden="true">{sort === key ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map(row => <tr key={row.id}><td className="p-3"><Checkbox id={`group-candidate-${row.id}`} aria-label={row.name} checked={selected.includes(row.id)} disabled={blocked || !row.selectable} onChange={event => choose(event.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} /></td><td className="p-3"><label htmlFor={`group-candidate-${row.id}`} className={`break-words font-semibold ${!blocked && row.selectable ? "cursor-pointer" : ""}`}>{row.name}</label>{row.added && <span className="ml-2 text-fg-muted">{d.added}</span>}</td><td className="whitespace-nowrap p-3">{formatGroupUpdatedAt(row.updatedAt, locale)}</td><td className="p-3 tabular-nums">{row.contactCount ?? "—"}</td></tr>)}</tbody></table></div>}
      {!loading && !readFailed && !rows.length && <p className="p-8 text-center text-fg-muted">{z.common.empty}</p>}
    </>}
    <div className="flex flex-wrap justify-end gap-3"><button className={secondary} disabled={busy} onClick={requestClose}>{z.common.cancel}</button>{writable && <button className={primary} disabled={busy || (!unknown && (loading || readFailed || !currentSelection))} onClick={() => void save()}>{busy ? t.admin.industrySettings.saving : unknown ? c.checkResult : c.add.replace("{count}", String(selected.length))}</button>}</div>
    {discard && <ModalDialog title={d.confirmDiscard} description={c.title} initialFocusRef={cancel} onRequestClose={() => setDiscard(false)}><div className="flex flex-wrap justify-end gap-3"><button ref={cancel} className={secondary} onClick={() => setDiscard(false)}>{z.common.cancel}</button><button className={primary} onClick={finish}>{d.discard}</button></div></ModalDialog>}
  </section>;
}
