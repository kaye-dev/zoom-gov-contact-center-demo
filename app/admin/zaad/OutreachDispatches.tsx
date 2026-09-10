"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { TableRowActions } from "@/app/components/admin/TableRowActions";
import { outreachRequest, type ListResult } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { OutreachDispatchEditor } from "./OutreachDispatchEditor";
import type { DispatchConfirmationStatus, DispatchHistory, DispatchRecord } from "./outreach-dispatch-types";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

const canRepeat = (record: { appState: string }) => !["UNKNOWN", "RUNNING", "EXECUTION_REQUESTED", "PREPARING"].includes(record.appState);
export function OutreachDispatches(props: OutreachPanelProps) {
  const { tenant, permissions } = props;
  const { t, locale } = useI18n(), d = t.outreachCommon, z = t.admin.zaad, u = d.dispatchUi;
  const query = useSearchParams(), router = useRouter(), state = query.get("state"), id = query.get("detail");
  const confirmation = state === "dispatch-confirm", routed = ["dispatch-confirm", "dispatch-history", "dispatch-edit", "dispatch-retry"].includes(state ?? "") && Boolean(id), routeKey = `${tenant}:${id}:${confirmation}`;
  const [data, setData] = useState<ListResult<DispatchHistory> | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [record, setRecord] = useState<DispatchRecord | null>(null), [loadedKey, setLoadedKey] = useState(""), [detailFailure, setDetailFailure] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmationStatus, setConfirmationStatus] = useState<DispatchConfirmationStatus>("UNAVAILABLE");
  useEffect(() => { const controller = new AbortController(); outreachRequest<ListResult<DispatchHistory>>(tenant, "one-time-dispatches", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [tenant, reload]);
  useEffect(() => {
    if (!routed || !id) return;
    const controller = new AbortController();
    outreachRequest<{ dispatch: DispatchRecord; confirmationStatus?: DispatchConfirmationStatus }>(tenant, `one-time-dispatches/${encodeURIComponent(id)}${confirmation ? "?confirmation=true" : ""}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setRecord(result.dispatch); setConfirmationStatus(result.confirmationStatus ?? "UNAVAILABLE"); setLoadedKey(routeKey); setDetailFailure(""); } }).catch(() => { if (!controller.signal.aborted) setDetailFailure(routeKey); });
    return () => controller.abort();
  }, [tenant, id, routed, routeKey, reload, confirmation]);
  function href(next?: string, detail?: string) { const params = new URLSearchParams(query.toString()); params.delete("state"); params.delete("detail"); if (next) params.set("state", next); if (detail) params.set("detail", detail); return `/admin/zaad?${params}`; }
  function back() { router.replace(href(), { scroll: false }); }
  function go(next: string, detail?: string) { router.push(href(next, detail), { scroll: false }); }
  function refresh() { setFailed(false); setLoadedKey(""); setReload(value => value + 1); }
  function confirmed(detail: string) { refresh(); router.replace(href("dispatch-confirm", detail), { scroll: false }); }
  if (state === "dispatch-create") return <OutreachDispatchEditor key={`${tenant}:new`} {...props} record={null} rerun={false} close={back} confirmed={confirmed} />;
  if (routed && (loadedKey !== routeKey || detailFailure === routeKey)) return <div className="space-y-4"><button className={secondary} onClick={back}>{d.backToContacts}</button>{detailFailure === routeKey ? <OutreachFailure retry={() => { setDetailFailure(""); refresh(); }} /> : <OutreachLoading />}</div>;
  if (routed && record && ["dispatch-edit", "dispatch-retry"].includes(state ?? "") && record.draft && canRepeat(record)) return <OutreachDispatchEditor key={`${routeKey}:${state}`} {...props} record={record} rerun={state === "dispatch-retry"} close={back} confirmed={confirmed} />;
  if (routed && record) return <OutreachDispatchSnapshot record={record} confirmation={confirmation} confirmationStatus={confirmationStatus} retry={refresh} writable={permissions.create} close={back} edit={() => go("dispatch-edit", record.id)} rerun={() => go("dispatch-retry", record.id)} />;
  if (failed) return <OutreachFailure retry={refresh} />;
  if (!data) return <OutreachLoading />;
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{d.tabLabels["one-time"]}</h2>{permissions.create && <button className={primary} onClick={() => go("dispatch-create")}>{z.common.create}</button>}</div>
    {tenant === "lg" && <Link className={secondary} href="/admin/zaad?tenant=lg&view=one-time&workflow=fraud&step=targets">{t.municipalOutreach.topics["fraud-alert"]}</Link>}
    <p className="text-sm leading-7 text-fg-muted">{u.historyHelp}</p>
    {!data.items.length ? <p className="rounded-lg border border-line p-8 text-center">{z.common.empty}</p> : <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-line bg-surface-hover"><tr>{[d.groupName, u.createdAt, z.oneTime.uniqueRecipients, u.status, z.residents.actions].map(label => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{data.items.map(row => <tr key={row.id}><td className="px-4 py-3"><button className="cursor-pointer text-left font-semibold hover:text-accent" onClick={() => go("dispatch-history", row.id)}>{row.name}</button></td><td className="whitespace-nowrap px-4 py-3">{new Date(row.createdAt).toLocaleString(locale)}</td><td className="whitespace-nowrap px-4 py-3">{row.recipientCount}</td><td className="whitespace-nowrap px-4 py-3">{d.stateLabels[row.appState] ?? d.unknown}</td><td className="px-4 py-3"><TableRowActions label={`${row.name}: ${z.residents.actions}`} open={menu === row.id} onOpenChange={value => setMenu(value ? row.id : null)} items={[{ id: "detail", label: d.snapshot, onSelect: () => go("dispatch-history", row.id) }, ...(permissions.create && canRepeat(row) ? [{ id: "rerun", label: d.rerun, onSelect: () => go("dispatch-retry", row.id) }] : [])]} /></td></tr>)}</tbody></table></div>}
  </div>;
}

function OutreachDispatchSnapshot({ record, confirmation, confirmationStatus, retry, writable, close, edit, rerun }: { record: DispatchRecord; confirmation: boolean; confirmationStatus: DispatchConfirmationStatus; retry: () => void; writable: boolean; close: () => void; edit: () => void; rerun: () => void }) {
  const { t, locale } = useI18n(), z = t.admin.zaad, d = t.outreachCommon, u = d.dispatchUi;
  const snapshot = record.snapshot, title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [record.id, confirmation]);
  return <section className="max-w-4xl space-y-6" aria-labelledby="dispatch-snapshot-title"><div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={title} tabIndex={-1} id="dispatch-snapshot-title" className="text-lg font-bold">{confirmation ? u.confirmTitle : record.name}</h2><button className={secondary} onClick={close}>{d.backToContacts}</button></div>
    <p className="text-sm text-fg-muted">{d.stateLabels[record.appState] ?? d.unknown}</p>
    {confirmation && confirmationStatus !== "CURRENT" && <div role={confirmationStatus === "ALREADY_REQUESTED" ? "status" : "alert"} className="space-y-3 rounded-md border border-line p-4 text-sm leading-7"><p>{u.confirmationStatuses[confirmationStatus]}</p>{confirmationStatus === "UNAVAILABLE" && <button className={secondary} onClick={retry}>{z.common.retry}</button>}</div>}
    {!snapshot ? <p role="alert">{z.oneTime.snapshotPending}</p> : <><dl className="grid gap-3 text-sm"><dt className="font-semibold">{d.groupName}</dt><dd>{snapshot.name}</dd><dt className="font-semibold">{u.connection}</dt><dd>{snapshot.connectionMode === "FLOW" ? d.flow : d.media}</dd><dt className="font-semibold">{z.messages.body}</dt><dd className="whitespace-pre-wrap break-words leading-7">{snapshot.body}</dd><dt className="font-semibold">{z.messages.voice}</dt><dd>{snapshot.voiceId} · {snapshot.languageCode}</dd><dt className="font-semibold">{z.oneTime.uniqueRecipients}</dt><dd className="text-2xl font-bold">{snapshot.recipientCount}</dd></dl>
      {Object.entries(snapshot.exclusions ?? {}).map(([reason, count]) => <p key={reason} className="text-sm">{reason === "MEMBERSHIP_UNVERIFIED" || reason === "MEMBERSHIP_DIFFERENCE" ? d.difference : d.stateLabels[reason] ?? d.unknown}: {count}</p>)}
      {snapshot.excludedTargets && snapshot.excludedTargets.length > 0 && <ul className="space-y-2 text-sm">{snapshot.excludedTargets.map((target, index) => <li key={`${target.reason}:${index}`}>{target.name ?? d.unknown}: {target.reason === "MEMBERSHIP_UNVERIFIED" || target.reason === "MEMBERSHIP_DIFFERENCE" ? d.difference : d.stateLabels[target.reason] ?? d.unknown}</li>)}</ul>}
      {snapshot.recipientCount === 0 && <p role="alert">{d.noEligibleTargets}</p>}
      {snapshot.groups?.length > 0 && <section className="space-y-3"><h3 className="font-semibold">{u.groupsObserved}</h3>{snapshot.groups.map(group => <p key={group.id} className="text-sm">{group.name ?? group.id} · {u.observedAt}: {group.observedAt ? new Date(group.observedAt).toLocaleString(locale) : d.unknown}</p>)}</section>}
      {!confirmation && <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full text-left text-sm"><caption className="mb-3 text-left font-semibold">{u.fixedRecipients}</caption><thead className="border-b border-line bg-surface-hover"><tr><th className="px-4 py-3">{z.residents.name}</th><th className="px-4 py-3">{z.residents.phone}</th></tr></thead><tbody className="divide-y divide-line">{(snapshot.targets ?? []).map(target => <tr key={target.personKey}><td className="px-4 py-3">{target.name ?? d.unknown}</td><td className="whitespace-nowrap px-4 py-3">{target.phone}</td></tr>)}</tbody></table></div>}
      <p className="text-sm leading-7 text-fg-muted">{u.snapshotHelp}</p>
    </>}
    {confirmation && <><p className="text-sm leading-7 text-fg-muted">{d.liveGate} {snapshot?.connectionMode === "FLOW" ? d.flowGate : d.audioGate}</p>{record.expiresAt && <p className="text-sm">{z.oneTime.expiresAt}: {new Date(record.expiresAt).toLocaleString(locale)}</p>}<div className="flex flex-wrap gap-3">{writable && record.draft && canRepeat(record) && <button className={secondary} onClick={edit}>{u.editContent}</button>}<button className={primary} disabled>{u.execute}</button></div></>}
    {!confirmation && writable && record.draft && canRepeat(record) && <button className={primary} onClick={rerun}>{d.rerun}</button>}
  </section>;
}
