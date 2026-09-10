"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { Select } from "@/app/components/Select";
import { AdminFieldHelp } from "@/app/components/admin/AdminFieldHelp";
import { RefreshIcon } from "@/app/components/svg/RefreshIcon";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
import { MUNICIPAL_PURPOSES, purposeTopic } from "@/lib/zaad/municipal/contracts";
import type { PurposeBinding, PurposeCandidate, PurposeCandidates, PurposeMode } from "@/lib/zaad/purpose-campaigns";
import { loadPurposeCampaignCandidates } from "./outreach-purpose-client";
import { outreachMutation, outreachRequest, OutreachApiError } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";

type BindingList = { tenantKey: string; accountId: string; rows: PurposeBinding[] };
type Props = OutreachPanelProps & { mode: PurposeMode; children?: ReactNode | ((assigned: ReadonlySet<string>) => ReactNode); onSaved?: () => void; openCampaign?: (id: string) => void };
export function OutreachPurposeBindings({ mode, children, onSaved, openCampaign, ...props }: Props) {
  const { t } = useI18n(), d = t.outreachCommon, c = d.purposeCampaigns, z = t.admin.zaad;
  const [rows, setRows] = useState<PurposeBinding[] | null>(null), [target, setTarget] = useState<PurposeBinding | null>(null), [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    outreachRequest<BindingList>(props.tenant, "purpose-campaigns", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setRows(result.rows); setFailed(false); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [props.tenant, reload]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);
  const purposes = mode === "regular" ? MUNICIPAL_PURPOSES : ["FRAUD_ALERT"] as const;
  if (props.tenant !== "lg") return null;
  if (failed) return <OutreachFailure retry={() => { setFailed(false); setReload(value => value + 1); }} />;
  if (!rows) return <OutreachLoading />;
  const assigned = new Set(rows.filter(row => row.mode === "regular" && row.campaignId).map(row => row.campaignId!));
  return <section className="space-y-3" aria-label={c.label}>
    {notice && <p ref={noticeRef} tabIndex={-1} role="status" className="text-sm">{notice}</p>}
    <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-line bg-surface-hover"><tr>{(mode === "regular" ? [d.groupName, z.campaigns.status, d.tabLabels["contact-lists"], d.campaignSync.type, z.residents.actions] : [d.groupName, d.dispatchUi.createdAt, z.oneTime.uniqueRecipients, d.dispatchUi.status, z.residents.actions]).map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{purposes.map(purpose => {
      const row = rows.find(item => item.mode === mode && item.purpose === purpose); if (!row) return null;
      const name = t.municipalOutreach.topics[purposeTopic[purpose]];
      return <tr key={purpose}><td className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-2">{name}{mode === "one-time" && <AdminFieldHelp id="outreach-fraud-help" label={name} description={d.dispatchUi.historyHelp} portal />}</span>{row.campaignId && <p className="mt-1 text-xs font-normal text-fg-muted">{openCampaign && row.available ? <button className="cursor-pointer text-left hover:text-accent" onClick={() => openCampaign(row.campaignId!)}>{row.campaignName} · {row.campaignId}</button> : <>{row.campaignName ?? d.unknown} · {row.campaignId}</>}</p>}</td>{mode === "one-time" && <><td className="px-4 py-3">—</td><td className="px-4 py-3">—</td></>}<td className="px-4 py-3"><span className="inline-flex whitespace-nowrap rounded-full bg-surface-hover px-2 py-1">{!row.available ? d.unknown : row.campaignId ? c.linked : c.unlinked}</span></td>{mode === "regular" && <><td className="px-4 py-3">{row.contactListName ?? "—"}</td><td className="px-4 py-3">{row.campaignId && row.available ? "Agentless Dialer" : "—"}</td></>}<td className="px-4 py-3"><button className="cursor-pointer whitespace-nowrap text-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={!props.fullAccess || !props.permissions.update} onClick={() => { setNotice(""); setTarget(row); }}>{row.campaignId ? d.defaultGroups.update : c.link}</button></td></tr>;
    })}{typeof children === "function" ? children(assigned) : children}</tbody></table></div>
    {target && <PurposeBindingDialog key={`${mode}:${target.purpose}`} mode={mode} row={target} name={t.municipalOutreach.topics[purposeTopic[target.purpose]]} {...props} close={() => setTarget(null)} saved={result => { setRows(result.rows); setTarget(null); setNotice(c.saved); onSaved?.(); }} />}
  </section>;
}
function PurposeBindingDialog({ mode, row, name, close, saved, tenant, setDirty, setSaving }: OutreachPanelProps & { mode: PurposeMode; row: PurposeBinding; name: string; close: () => void; saved: (result: BindingList) => void }) {
  const { t } = useI18n(), c = t.outreachCommon.purposeCampaigns, common = t.admin.zaad.common;
  const [selected, setSelected] = useState(row.campaignId ?? ""), [items, setItems] = useState<PurposeCandidate[]>([]), [candidateSet, setCandidateSet] = useState<PurposeCandidates | null>(null);
  const [loading, setLoading] = useState(true), [reload, setReload] = useState(0), [busy, setBusy] = useState(false), [discard, setDiscard] = useState(false), [error, setError] = useState(""), [unknown, setUnknown] = useState(false);
  const lock = useRef(false), attempt = useRef<{ key: string; campaignId: string; accountId: string; revision: number } | null>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const path = `purpose-campaigns/${mode}/${row.purpose}`;
  useEffect(() => {
    const controller = new AbortController();
    void loadPurposeCampaignCandidates(tenant, path, controller.signal).then(result => {
      if (!controller.signal.aborted) { setItems(result.items); setCandidateSet(result); setLoading(false); }
    }).catch(() => { if (!controller.signal.aborted) { setLoading(false); setError(common.failure); } });
    return () => controller.abort();
  }, [tenant, path, reload, common.failure]);
  useEffect(() => { if (!busy && error) errorRef.current?.focus(); }, [busy, error]);
  function refresh() { setLoading(true); setError(""); setCandidateSet(null); setReload(value => value + 1); }
  function finish() { setDirty(false); close(); }
  function requestClose() { if (lock.current || unknown) return; if (selected !== (row.campaignId ?? "")) setDiscard(true); else finish(); }
  async function save() {
    const chosen = items.find(item => item.id === selected && item.selectable);
    if (lock.current || (!unknown && (!candidateSet || !chosen || loading))) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError("");
    let rejected = false;
    try {
      if (attempt.current) {
        const result = await outreachRequest<{ status: string }>(tenant, `purpose-campaigns/operations/${encodeURIComponent(attempt.current.key)}`);
        if (result.status !== "COMPLETED") throw new Error("UNKNOWN_RESULT");
      } else {
        attempt.current = { key: crypto.randomUUID(), campaignId: selected, accountId: candidateSet!.accountId, revision: candidateSet!.revision };
        await outreachMutation(tenant, path, { operationKey: attempt.current.key, accountId: attempt.current.accountId, revision: attempt.current.revision, campaignId: attempt.current.campaignId }, "PUT").catch(failure => { rejected = failure instanceof OutreachApiError && failure.status >= 400 && failure.status < 500; throw failure; });
      }
      const result = await outreachRequest<BindingList>(tenant, "purpose-campaigns");
      const observed = result.rows.find(item => item.mode === mode && item.purpose === row.purpose);
      if (!observed || observed.campaignId !== attempt.current!.campaignId || !observed.available) throw new Error("READBACK_MISMATCH");
      setUnknown(false); setDirty(false); saved(result);
    } catch {
      if (rejected) { attempt.current = null; setCandidateSet(null); setError(c.conflict); }
      else { setUnknown(true); setDirty(true); setError(c.unknown); }
    } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  const valid = Boolean(candidateSet && items.some(item => item.id === selected && item.selectable));
  return <><ModalDialog title={c.title} description={name} locked={busy || discard || unknown} onRequestClose={requestClose}><form className="mt-5 space-y-5" aria-busy={loading || busy} onSubmit={event => { event.preventDefault(); void save(); }}>
    {loading ? <p role="status">{c.loading}</p> : <><div className="flex items-end gap-2"><label className="min-w-0 flex-1">{c.campaign}<Select containerClassName="min-w-0" value={selected} disabled={busy || unknown || !candidateSet} onChange={event => { setSelected(event.target.value); setDirty(event.target.value !== (row.campaignId ?? "")); }}><option value="">{c.select}</option>{selected && !items.some(item => item.id === selected) && <option value={selected} disabled>{selected} — {c.assigned}</option>}{items.map(item => <option key={item.id} value={item.id} disabled={!item.selectable}>{item.name} — {item.id}{!item.selectable ? ` (${c.assigned})` : ""}</option>)}</Select></label><button type="button" className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-surface-hover disabled:cursor-not-allowed" aria-label={c.refresh} disabled={busy || unknown} onClick={refresh}><RefreshIcon /></button></div>{candidateSet && row.campaignId && (!candidateSet.current.available || !items.some(item => item.id === row.campaignId && item.selectable)) && <p className="text-sm text-fg-muted">{c.unavailable}</p>}</>}
    {selected && <p className="break-all text-sm text-fg-muted">{c.campaignId}：{selected}</p>}{row.campaignId && selected !== row.campaignId && <p className="text-sm text-fg-muted">{c.changeHelp}</p>}{error && <p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}<div className="flex justify-end gap-3"><button type="button" className={secondary} disabled={busy || unknown} onClick={requestClose}>{common.cancel}</button><button className={primary} disabled={busy || (!unknown && (loading || !valid))}>{common.save}</button></div>
  </form></ModalDialog>{discard && <ModalDialog title={t.outreachCommon.confirmDiscard} description={name} onRequestClose={() => setDiscard(false)}><div className="mt-5 flex justify-end gap-3"><button className={secondary} onClick={() => setDiscard(false)}>{common.cancel}</button><button className={primary} onClick={finish}>{t.outreachCommon.discard}</button></div></ModalDialog>}</>;
}
