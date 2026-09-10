"use client";
import { AdminFieldHelp } from "@/app/components/admin/AdminFieldHelp";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ZoomCampaignDto } from "@/lib/server/zaad/zoom-client";
import { MunicipalWorkflowPanel } from "./MunicipalWorkflowPanel";
import { OutreachCampaignSync } from "./OutreachCampaignSync";
import { TableRowActions } from "@/app/components/admin/TableRowActions";
import { OutreachCampaignDetail } from "./OutreachCampaignDetail";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { outreachRequest, type ListResult } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
import { OutreachPurposeBindings } from "./OutreachPurposeBindings";
type Campaign = ZoomCampaignDto & { selectable?: boolean; added?: boolean; disabledReason?: string };
export function OutreachCampaigns(props: OutreachPanelProps) {
  return <OutreachCampaignList key={props.tenant} {...props} />;
}

function OutreachCampaignList(props: OutreachPanelProps) {
  const { tenant, permissions } = props;
  const queryParams = useSearchParams(), router = useRouter();
  const state = queryParams.get("state"), detailId = queryParams.get("detail") ?? "";
  const detailOpen = state === "campaign-detail", confirmationOpen = state === "campaign-confirm";
  const syncOpen = state === "campaign-sync";
  const syncButton = useRef<HTMLButtonElement>(null), returnToSync = useRef(false);
  const [success, setSuccess] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const workflowOpen = tenant === "lg" && (queryParams.has("workflow") || queryParams.get("step") === "cases");
  const { t } = useI18n(), d = t.outreachCommon, z = t.admin.zaad;
  const [data, setData] = useState<ListResult<Campaign> | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0), [full, setFull] = useState(false);
  const returnToRow = useRef<string | null>(null), rowButtons = useRef(new Map<string, HTMLButtonElement>());
  function campaignRoute(nextState?: string, id?: string) {
    const params = new URLSearchParams(queryParams.toString());
    params.delete("state"); params.delete("detail");
    if (nextState) params.set("state", nextState);
    if (id) params.set("detail", id);
    return `/admin/zaad?${params}`;
  }
  function openCampaign(id: string, confirmation = false) {
    setMenu(null); router.push(campaignRoute(confirmation ? "campaign-confirm" : "campaign-detail", id), { scroll: false });
  }
  function closeCampaign() { returnToRow.current = detailId; router.replace(campaignRoute(), { scroll: false }); }
  useEffect(() => {
    if (!detailOpen && !confirmationOpen && returnToRow.current && rowButtons.current.has(returnToRow.current)) {
      rowButtons.current.get(returnToRow.current)?.focus(); returnToRow.current = null;
    }
  }, [detailOpen, confirmationOpen, data]);
  function syncRoute(open: boolean) { const params = new URLSearchParams(queryParams.toString()); params.delete("state"); if (open) params.set("state", "campaign-sync"); return `/admin/zaad?${params}`; }
  function closeSync() { returnToSync.current = true; router.replace(syncRoute(false), { scroll: false }); }
  useEffect(() => { if (!syncOpen && returnToSync.current && syncButton.current) { returnToSync.current = false; syncButton.current.focus(); } }, [syncOpen, data]);
  async function confirmed(ids: string[]) { const rows = await outreachRequest<ListResult<Campaign>>(tenant, "campaigns"); if (!ids.every(id => rows.items.some(row => row.id === id))) throw new Error("Campaign readback missing selected IDs"); setData(rows); setSuccess(d.campaignSync.saved); closeSync(); }

  useEffect(() => { if (workflowOpen) return; const controller = new AbortController(); Promise.all([outreachRequest<ListResult<Campaign>>(tenant, "campaigns", { signal: controller.signal }), outreachRequest<{ fullAccess: boolean }>(tenant, "connection", { signal: controller.signal })]).then(([rows, connection]) => { if (!controller.signal.aborted) { setData(rows); setFull(connection.fullAccess); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [tenant, reload, workflowOpen]);
  const refresh = () => { setFailed(false); setReload(value => value + 1); };
  if (workflowOpen) return <MunicipalWorkflowPanel {...props} />;
  if (detailOpen) return <OutreachCampaignDetail key={`${tenant}:${detailId}`} {...props} id={detailId} close={closeCampaign} preview={() => openCampaign(detailId, true)} />;
  if (syncOpen) return <OutreachCampaignSync key={tenant} tenant={tenant} writable={Boolean(props.fullAccess && permissions.update)} setDirty={props.setDirty} setSaving={props.setSaving} close={closeSync} confirmed={confirmed} />;
  if (failed) return <OutreachFailure retry={refresh} />;
  if (!data) return <OutreachLoading />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="shrink-0 text-lg font-bold">{d.tabLabels["campaigns"]} {tenant !== "lg" && <span className="text-sm font-normal text-fg-muted">({data.total ?? data.items.length})</span>}</h2><AdminFieldHelp id="outreach-campaign-live-help" label={d.tabLabels["campaigns"]} description={d.liveGate} portal /></div><div className="ml-auto flex flex-wrap gap-3"><button className={secondary} onClick={refresh}>{d.reload}</button><button ref={syncButton} className={secondary} disabled={!full || !permissions.update} title={!full || !permissions.update ? d.campaignSync.permission : undefined} onClick={() => { setSuccess(""); router.push(syncRoute(true), { scroll: false }); }}>{d.sync}</button></div></div>{(!full || !permissions.update) && <p className="text-sm text-fg-muted">{d.campaignSync.permission}</p>}{success && <p role="status">{success}</p>}{tenant === "lg" ? <OutreachPurposeBindings {...props} fullAccess={full} mode="regular" onSaved={refresh} openCampaign={openCampaign}>{assigned => data.items.filter(row => !assigned.has(row.id)).map(row => <tr key={row.id}><td className="px-4 py-3"><button ref={element => { if (element) rowButtons.current.set(row.id, element); else rowButtons.current.delete(row.id); }} className="cursor-pointer text-left font-semibold hover:text-accent" onClick={() => openCampaign(row.id)}>{row.name}</button></td><td className="whitespace-nowrap px-4 py-3">{d.stateLabels[row.status.toUpperCase()] ?? d.unknown}</td><td className="px-4 py-3">{row.contactListName ?? row.contactListId ?? d.unknown}</td><td className="whitespace-nowrap px-4 py-3">{row.dialingMethod === "agentless" ? "Agentless Dialer" : d.unknown}</td><td className="px-4 py-3"><TableRowActions label={`${row.name}: ${z.residents.actions}`} open={menu === row.id} onOpenChange={open => setMenu(open ? row.id : null)} items={[{ id: "detail", label: z.campaigns.details, onSelect: () => openCampaign(row.id) }, { id: "preview", label: d.preview, disabled: !permissions.update || !["ready", "paused"].includes(row.status.toLowerCase()), disabledReason: d.campaignUi.previewUnavailable, onSelect: () => openCampaign(row.id, true) }]} /></td></tr>)}</OutreachPurposeBindings> : !data.items.length ? <p className="py-8 text-center text-fg-muted">{d.campaignSync.empty}</p> : <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-line bg-surface-hover"><tr>{[d.groupName, z.campaigns.status, d.tabLabels["contact-lists"], d.campaignSync.type, z.residents.actions].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{data.items.map(row => <tr key={row.id}><td className="px-4 py-3"><button ref={element => { if (element) rowButtons.current.set(row.id, element); else rowButtons.current.delete(row.id); }} className="cursor-pointer text-left font-semibold hover:text-accent" onClick={() => openCampaign(row.id)}>{row.name}</button></td><td className="whitespace-nowrap px-4 py-3">{d.stateLabels[row.status.toUpperCase()] ?? d.unknown}</td><td className="px-4 py-3">{row.contactListName ?? row.contactListId ?? d.unknown}</td><td className="whitespace-nowrap px-4 py-3">{row.dialingMethod === "agentless" ? "Agentless Dialer" : d.unknown}</td><td className="px-4 py-3"><TableRowActions label={`${row.name}: ${z.residents.actions}`} open={menu === row.id} onOpenChange={open => setMenu(open ? row.id : null)} items={[{ id: "detail", label: z.campaigns.details, onSelect: () => openCampaign(row.id) }, { id: "preview", label: d.preview, disabled: !permissions.update || !["ready", "paused"].includes(row.status.toLowerCase()), disabledReason: d.campaignUi.previewUnavailable, onSelect: () => openCampaign(row.id, true) }]} /></td></tr>)}</tbody></table></div>}

    {confirmationOpen && <OutreachCampaignDetail key={`${tenant}:${detailId}:confirm`} {...props} id={detailId} confirmation close={closeCampaign} preview={() => {}} />}
  </div>;
}
