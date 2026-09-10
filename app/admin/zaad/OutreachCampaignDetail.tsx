"use client";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";

import { useEffect, useRef, useState } from "react";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
import type { ZoomCampaignDto } from "@/lib/server/zaad/zoom-client";
import { outreachMutation, outreachRequest } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";

type CampaignDetail = ZoomCampaignDto & {
  bindingVersion: number;
  pauseReady: boolean;
  departmentKey: string | null;
  notificationTopic: string | null;
};

type Props = OutreachPanelProps & {
  id: string;
  confirmation?: boolean;
  close: () => void;
  preview: () => void;
};

export function OutreachCampaignDetail({ tenant, permissions, setSaving, id, confirmation = false, close, preview }: Props) {
  const { t } = useI18n(), d = t.outreachCommon, z = t.admin.zaad, u = d.campaignUi;
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [pausing, setPausing] = useState(false);
  const title = useRef<HTMLHeadingElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const lock = useRef(false), operationKey = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    outreachRequest<{ campaign: CampaignDetail }>(tenant, `campaigns/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setDetail(result.campaign); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [tenant, id, reload]);
  useEffect(() => { if (detail && !confirmation) title.current?.focus(); }, [detail, confirmation]);

  function refresh() { setDetail(null); setFailed(false); setReload(value => value + 1); }
  async function pause() {
    if (!detail || lock.current || !permissions.update || !detail.pauseReady || detail.status.toLowerCase() !== "running") return;
    lock.current = true; setBusy(true); setSaving?.(true); setError("");
    operationKey.current ??= crypto.randomUUID();
    try {
      await outreachMutation(tenant, `campaigns/${encodeURIComponent(id)}/status`, {
        operationKey: operationKey.current, status: "Paused", version: detail.bindingVersion, expectedRevision: detail.revision,
      }, "PATCH");
      setPausing(false); refresh();
    } catch { setError(z.oneTime.resultUnknown); }
    finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }

  const failure = !id || failed;
  const content = failure ? <OutreachFailure retry={refresh} /> : !detail ? <OutreachLoading /> : <>
    {confirmation && <p className="font-semibold">{detail.name}</p>}
    {confirmation && <p className="text-sm leading-7">{u.confirmHelp}</p>}
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 text-sm">
      {[
        [z.campaigns.status, d.stateLabels[detail.status.toUpperCase()] ?? d.unknown],
        [d.campaignSync.type, detail.dialingMethod === "agentless" ? "Agentless Dialer" : d.unknown],
        [d.tabs[1], detail.contactListName ?? detail.contactListId ?? d.unknown],
        [z.oneTime.maskedCaller, detail.callerIdMasked ?? d.unknown],
        [z.oneTime.queue, detail.queueName ?? d.unknown],
        [z.oneTime.maxConcurrency, String(detail.maxConcurrentCalls ?? d.unknown)],
        [z.oneTime.businessHours, detail.businessHours ?? d.unknown],
        [z.oneTime.retryPolicy, detail.retryPolicy ?? d.unknown],
        [z.oneTime.dncPolicy, detail.dncPolicy ?? d.unknown],
        [z.oneTime.alwaysRunning, detail.alwaysRunning ? z.oneTime.enabled : z.oneTime.disabled],
        [d.department, detail.departmentKey ? d.departments[detail.departmentKey] ?? d.unknown : d.pending],
      ].map(([label, value]) => <div key={label} className="contents"><dt className="text-fg-muted">{label}</dt><dd className="break-words">{value}</dd></div>)}
    </dl>
    <p className="text-sm leading-7 text-fg-muted">{d.liveGate}</p>
    {!confirmation && <>
      <div className="flex flex-wrap gap-3">
        <button className={primary} disabled={!permissions.update || !["ready", "paused"].includes(detail.status.toLowerCase())} title={u.previewUnavailable} onClick={preview}>{d.preview}</button>
        <button className={secondary} disabled={!permissions.update || !detail.pauseReady || detail.status.toLowerCase() !== "running"} title={!detail.pauseReady ? d.liveGate : undefined} onClick={() => { operationKey.current = null; setError(""); setPausing(true); }}>{z.campaigns.pause}</button>
        <button className={secondary} onClick={refresh}>{d.reload}</button>
      </div>
      <p className="text-sm leading-7 text-fg-muted">{u.pauseHelp}</p>
    </>}
  </>;

  if (confirmation) return <ModalDialog title={u.confirmTitle} description={d.liveGate} initialFocusRef={cancel} onRequestClose={close} maxWidthClassName="max-w-3xl">
    <div className="space-y-5">{content}<div className="flex justify-end gap-3"><button className={primary} disabled title={d.liveGate}>{d.dispatchUi.execute}</button><button ref={cancel} className={secondary} onClick={close}>{z.common.close}</button></div></div>
  </ModalDialog>;
  return <section className="max-w-4xl space-y-6" aria-labelledby="campaign-detail-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 id="campaign-detail-title" ref={title} tabIndex={-1} className="text-2xl font-bold">{detail?.name ?? z.campaigns.details}</h1></div><DetailPageBreadcrumb title={detail?.name ?? z.campaigns.details} disabled={busy} />
    {content}
    {pausing && detail && <ModalDialog title={z.campaigns.pauseTitle} description={u.pauseHelp} locked={busy} initialFocusRef={cancel} onRequestClose={() => { if (!lock.current) setPausing(false); }}>
      {error && <p role="alert" className="mb-4">{error}</p>}
      <div className="flex justify-end gap-3"><button ref={cancel} className={secondary} disabled={busy} onClick={() => setPausing(false)}>{z.common.cancel}</button><button className={primary} disabled={busy} onClick={() => void pause()}>{z.campaigns.pause}</button></div>
    </ModalDialog>}
  </section>;
}
