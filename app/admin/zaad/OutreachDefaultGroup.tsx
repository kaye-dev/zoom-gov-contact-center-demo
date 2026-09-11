"use client";
import { outreachTableFrame } from "./outreach-table-layout";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";

import { DefaultGroupBinding } from "./OutreachDefaultGroupBinding";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { AdminFieldHelp } from "@/app/components/admin/AdminFieldHelp";
import { RefreshIcon } from "@/app/components/svg/RefreshIcon";
import { SearchInput } from "@/app/components/admin/SearchInput";
import { Pagination } from "@/app/components/admin/Pagination";
import { Select } from "@/app/components/Select";
import { TableRowActions } from "@/app/components/admin/TableRowActions";
import { DEFAULT_GROUP_TOPICS, isPendingSync, type DefaultGroupDetail, type GroupSyncResult, type SyncedGroupMember } from "@/lib/zaad/default-groups";
import type { TenantKey } from "@/lib/tenants";
import { outreachMutation, outreachRequest, OutreachApiError } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

export function useDefaultGroupName() {
  const { t } = useI18n();
  return (tenant: TenantKey, topic: string) => tenant === "univ"
    ? t.universityOutreach.topicLabels[(DEFAULT_GROUP_TOPICS.univ as readonly string[]).indexOf(topic)] ?? topic
    : topic === "disaster-radio" ? t.outreachCommon.defaultGroups.radioName : t.municipalOutreach.topics[topic as keyof typeof t.municipalOutreach.topics] ?? topic;
}

export function OutreachDefaultGroup(props: OutreachPanelProps & { id: string; startEditing?: boolean; close: () => void }) {
  const { tenant, id, permissions, fullAccess, setDirty, setSaving, startEditing } = props;
  const { t } = useI18n(), d = t.outreachCommon.defaultGroups, common = t.admin.zaad.common, groupName = useDefaultGroupName();
  const query = useSearchParams(), router = useRouter(), cursor = query.get("cursor") ?? "0", search = query.get("query") ?? "";
  const [text, setText] = useState(search), [composing, setComposing] = useState(false);
  const queryString = query.toString();
  useEffect(() => { if (composing || text === search) return; const timer = setTimeout(() => { const params = new URLSearchParams(queryString); params.set("query", text); params.set("cursor", "0"); router.replace(`/admin/zaad?${params}`, { scroll: false }); }, 200); return () => clearTimeout(timer); }, [text, composing, search, queryString, router]);
  const [data, setData] = useState<DefaultGroupDetail | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(Boolean(startEditing)), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [error, setError] = useState(""), [operationId, setOperationId] = useState<string | null>(null), [menu, setMenu] = useState<string | null>(null), [linking, setLinking] = useState<SyncedGroupMember | null>(null);
  const lock = useRef(false), mounted = useRef(true), operationKey = useRef<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (!busy) (error ? errorRef.current : notice ? noticeRef.current : null)?.focus(); }, [notice, error, busy]);
  const storageKey = `outreach-sync:${tenant}:${id}`;
  const writable = Boolean(fullAccess && permissions.update);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [storageKey]);
  useEffect(() => {
    const controller = new AbortController();
    outreachRequest<DefaultGroupDetail>(tenant, `default-groups/${encodeURIComponent(id)}?cursor=${encodeURIComponent(cursor)}&query=${encodeURIComponent(search)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setData(result); setFailed(false); setOperationId(sessionStorage.getItem(storageKey)); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [tenant, id, cursor, search, reload, storageKey]);
  function refresh() { setReload(n => n + 1); }
  function href(offset: number, text = search) { const params = new URLSearchParams(query.toString()); params.set("cursor", String(offset)); params.set("query", text); return `/admin/zaad?${params}`; }
  async function sync(memberId?: string, resume = false) {
    if (lock.current || !writable || !data) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError(""); setNotice("");
    try {
      if (!resume) operationKey.current = crypto.randomUUID();
      let result = resume && operationId
        ? await outreachRequest<GroupSyncResult>(tenant, `sync-operations/${encodeURIComponent(operationId)}`)
        : await outreachMutation<GroupSyncResult>(tenant, `default-groups/${encodeURIComponent(id)}/sync`, { operationKey: operationKey.current, revision: data.group.version, ...(memberId ? { memberIds: [memberId] } : {}) });
      sessionStorage.setItem(storageKey, result.operationId); setOperationId(result.operationId);
      while (result.status === "PENDING" && mounted.current) {
        const pendingBefore = result.counts.pending;
        result = await outreachMutation<GroupSyncResult>(tenant, `sync-operations/${encodeURIComponent(result.operationId)}/advance`, {});
        if (mounted.current) setNotice(d.partial.replace("{synced}", String(result.counts.synced)).replace("{failed}", String(result.counts.failed + result.counts.pending)));
        if (result.counts.pending === pendingBefore) break;
      }
      if (!mounted.current) return;
      setNotice(result.status === "COMPLETED" ? d.complete.replace("{count}", String(result.counts.synced)) : d.partial.replace("{synced}", String(result.counts.synced)).replace("{failed}", String(result.counts.failed)));
      if (result.status !== "PENDING") { sessionStorage.removeItem(storageKey); setOperationId(null); operationKey.current = null; } refresh();
    } catch (failure) { if (mounted.current) setError(failure instanceof OutreachApiError && failure.code === "GROUP_NOT_CONFIGURED" ? d.missingHelp : common.failure); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setSaving?.(false); } }
  }
  if (failed || !data) return <section className="space-y-5"><h1 className="text-2xl font-bold">{t.outreachCommon.tabLabels["contact-lists"]}</h1><DetailPageBreadcrumb title={t.outreachCommon.tabLabels["contact-lists"]} />{failed ? <OutreachFailure retry={() => { setFailed(false); refresh(); }} /> : <OutreachLoading />}</section>;
  const name = groupName(tenant, data.group.topicKey), configured = data.group.bindingState === "CONFIGURED", total = data.summary.total, unsynced = data.summary.unsynced;
  return <section className="space-y-5" aria-labelledby="default-group-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 w-full flex-col items-start gap-x-4 gap-y-2 md:w-auto md:flex-row md:flex-wrap md:items-center"><h1 id="default-group-title" className="text-2xl font-bold">{name}</h1><p className="break-all text-sm text-fg-muted"><span className="sr-only">{d.listId}：</span>{data.group.contactListId ?? d.missing}</p><div className="flex flex-wrap items-center gap-4">{writable && <button className="inline-flex min-h-11 cursor-pointer items-center gap-1 whitespace-nowrap text-sm text-accent hover:text-accent/70 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed" aria-label={data.group.contactListId ? `${t.outreachCommon.defaultGroups.updateShort}: ${d.listId}` : d.configure} disabled={busy} onClick={() => setEditing(true)}>{data.group.contactListId ? t.outreachCommon.defaultGroups.updateShort : d.configure}{data.group.contactListId && <RefreshIcon width={18} height={18} />}</button>}{writable && <button className="cursor-pointer whitespace-nowrap text-sm text-accent disabled:cursor-not-allowed disabled:opacity-50 md:hidden" disabled={busy || !configured || unsynced === 0} onClick={() => void sync()}>{t.outreachCommon.defaultGroups.bulk}</button>}</div></div><div className="ml-auto flex w-full flex-wrap items-center justify-end gap-3 md:w-auto md:flex-nowrap"><SearchInput label={common.search} placeholder={common.search} containerClassName="w-full min-w-0 md:w-64 xl:w-80" value={text} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setText(event.currentTarget.value); setComposing(false); }} onChange={event => setText(event.target.value)} />{operationId && writable && <button className={secondary} disabled={busy} onClick={() => void sync(undefined, true)}>{d.resume}</button>}{writable && <button className={`${primary} hidden md:inline-flex`} disabled={busy || !configured || unsynced === 0} onClick={() => void sync()}>{t.outreachCommon.defaultGroups.bulk}</button>}</div></div><DetailPageBreadcrumb title={name} disabled={busy} />
    {!configured && <p role="alert" className="border-l-2 border-accent pl-3 text-sm text-red-700 dark:text-red-300">{data.group.bindingState === "MISSING" ? d.missingHelp : t.outreachCommon.bindingConflict}</p>}
    {configured && data.providerState !== "READY" && <div role="alert" className="flex flex-wrap gap-3 text-sm"><p>{d.providerFailure}</p><button className={secondary} onClick={refresh}>{common.retry}</button></div>}

    {notice && <p ref={noticeRef} tabIndex={-1} role="status" className="text-sm">{notice}</p>}{error && <p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}
    {!data.items.length ? <p className="py-6">{common.empty}</p> : <div className={outreachTableFrame}><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-surface-hover"><tr>{[t.admin.zaad.residents.name, t.admin.zaad.residents.phone, d.source, t.admin.zaad.messages.status, t.admin.zaad.residents.actions].map((label, index) => <th key={label} className={`px-4 py-3 ${index === 4 ? "text-center" : ""}`}>{index === 3 ? <div className="inline-flex items-center gap-2 whitespace-nowrap">{label}<span aria-label={`${d.unsynced.replace("{count}", String(unsynced ?? "—"))} / ${d.total.replace("{count}", String(total ?? "—"))}`} className="font-normal text-fg-muted">（{unsynced ?? "—"}/{total ?? "—"}）</span><AdminFieldHelp id={`sync-status-help-${id}`} label={d.syncStatusHelp} description={d.boundary} portal /></div> : label}</th>)}</tr></thead><tbody className="divide-y divide-line [&>tr:first-child]:border-t [&>tr:first-child]:border-line">{data.items.map(row => {
      const canSync = writable && row.source === "SITE" && isPendingSync(row.syncStatus);
      const needsLink = row.syncStatus === "UNKNOWN" || row.syncStatus === "DIFFERENCE";
      return <tr key={row.id}><td className="px-4 py-3">{row.displayName}</td><td className="whitespace-nowrap px-4 py-3">{row.phones.map(p => p.number).join(" / ")}</td><td className="px-4 py-3">{row.source === "Zoom" ? "Zoom" : d.site}</td><td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full bg-surface-hover px-2 py-1 ${row.syncStatus === "FAILED" ? "text-red-700 dark:text-red-300" : "text-fg"}`}>{d.statuses[row.syncStatus]}</span>{row.lastErrorCode === "GROUP_IN_USE" && <p className="mt-1 text-xs text-fg-muted">{d.waiting}</p>}{needsLink && <p className="mt-1 max-w-xs text-xs text-fg-muted">{d.unknownHelp}</p>}{row.retryAfter && <p className="mt-1 text-xs text-fg-muted">{new Date(row.retryAfter).toLocaleString()}</p>}</td><td className="px-4 py-3 text-center"><div className="flex justify-center">{canSync && needsLink ? <TableRowActions label={`${row.displayName}: ${t.admin.zaad.residents.actions}`} open={menu === row.id} onOpenChange={value => setMenu(value ? row.id : null)} items={[{ id: "sync", label: t.outreachCommon.sync, disabled: busy || !configured, onSelect: () => void sync(row.id) }, { id: "link", label: d.reconcile, disabled: busy || !configured, onSelect: () => setLinking(row) }]} /> : canSync ? <button className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:text-accent hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed" aria-label={t.outreachCommon.sync} title={t.outreachCommon.sync} disabled={busy || !configured || row.syncStatus === "SYNCING"} onClick={() => void sync(row.id)}><RefreshIcon /></button> : "—"}</div></td></tr>;
    })}</tbody></table></div>}
    {data.total > 100 && <Pagination page={Math.floor(Number(cursor) / 100) + 1} totalPages={Math.ceil(data.total / 100)} previousHref={href(Math.max(0, Number(cursor) - 100))} nextHref={href(Number(cursor) + 100)} ariaLabel={common.next} previousLabel={common.previous} nextLabel={common.next} />}
    {editing && writable && <DefaultGroupBinding tenant={tenant} group={data.group} name={name} setDirty={setDirty} setSaving={setSaving} close={() => setEditing(false)} saved={() => { setEditing(false); refresh(); }} />}
    {linking && <RegistrationLink tenant={tenant} groupId={id} member={linking} setSaving={setSaving} close={() => setLinking(null)} saved={() => { setLinking(null); refresh(); }} />}
  </section>;
}

function RegistrationLink({ tenant, groupId, member, close, saved, setSaving }: { tenant: TenantKey; groupId: string; member: SyncedGroupMember; close: () => void; saved: () => void; setSaving?: (value: boolean) => void }) {
  const { t } = useI18n(), d = t.outreachCommon.defaultGroups, common = t.admin.zaad.common;
  const [candidates, setCandidates] = useState<SyncedGroupMember[]>([]), [selected, setSelected] = useState(""), [attestation, setAttestation] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => { const controller = new AbortController(); (async () => { const items: SyncedGroupMember[] = []; let cursor: string | null = null; do { const result: DefaultGroupDetail = await outreachRequest(tenant, `default-groups/${encodeURIComponent(groupId)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal: controller.signal }); items.push(...result.items.filter(row => row.source === "Zoom" || row.id === member.id)); cursor = result.nextCursor; } while (cursor); if (!controller.signal.aborted) setCandidates(items.filter(row => row.zoomContactId && row.observedDigest)); })().catch(() => { if (!controller.signal.aborted) setError(common.failure); }); return () => controller.abort(); }, [tenant, groupId, member.id, common.failure]);
  async function save() { if (lock.current) return; const row = candidates.find(r => r.id === selected); if (!row) return; lock.current = true; setBusy(true); setSaving?.(true); try { await outreachMutation(tenant, `default-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(member.id)}/link`, { version: member.version, contactId: row.zoomContactId, expectedDigest: row.observedDigest, attestation }); saved(); } catch { setError(common.failure); } finally { lock.current = false; setBusy(false); setSaving?.(false); } }
  return <ModalDialog title={d.reconcile} description={member.displayName} locked={busy} onRequestClose={close}><form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}><p className="text-sm text-fg-muted">{d.reconcileHelp}</p><label className="block">{d.contactId}<Select required value={selected} onChange={event => setSelected(event.target.value)}><option value="">{t.outreachCommon.select}</option>{candidates.map(row => <option key={row.id} value={row.id}>{row.displayName} · {row.phones.map(p => p.number).join(" / ")} · {row.zoomContactId}</option>)}</Select></label><label className="block">{t.outreachCommon.attestation}<textarea required maxLength={2000} className={input} value={attestation} onChange={event => setAttestation(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<div className="flex justify-end gap-3"><button type="button" className={secondary} disabled={busy} onClick={close}>{common.cancel}</button><button className={primary} disabled={busy || !selected}>{common.save}</button></div></form></ModalDialog>;
}
