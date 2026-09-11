"use client";
import { OutreachActionHost } from "./OutreachListActions";
import { OutreachListPending } from "./OutreachListPending";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { AdminTenantRouteSelect } from "@/app/components/admin/AdminTenantRouteSelect";
import { AdminPageTitleHelp } from "@/app/components/admin/AdminPageTitleHelp";
import type { OutreachCommonDictionary } from "@/app/i18n/outreach-common";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import type { TenantKey } from "@/lib/tenants";
import { OUTREACH_VIEWS as views, resolveOutreachView, isOutreachDetailPage } from "@/lib/admin-routing";
import { MunicipalWorkflowPanel } from "./MunicipalWorkflowPanel";
import { outreachRequest } from "./outreach-client";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
import { OutreachContacts } from "./OutreachContacts";
import { OutreachMessages } from "./OutreachMessages";
import { OutreachGroups } from "./OutreachGroups";
import { OutreachCampaigns } from "./OutreachCampaigns";
import { OutreachDispatches } from "./OutreachDispatches";
export type OutreachPermissions = { create: boolean; update: boolean; delete: boolean };
export type OutreachPanelProps = { fullAccess?: boolean; tenant: TenantKey; permissions: OutreachPermissions; setDirty: (dirty: boolean) => void; setSaving?: (saving: boolean) => void; years?: number[]; serverDate?: string };
export function OutreachView({ tenant, allowedTenants, permissions, canConfigure, years, serverDate }: Omit<OutreachPanelProps, "setDirty"> & { allowedTenants: readonly TenantKey[]; canConfigure: boolean }) {
  const { t } = useI18n(), d = t.outreachCommon, z = t.admin.zaad, router = useRouter(), query = useSearchParams();
  const selected = resolveOutreachView(tenant, query.get("view"), query.get("workflow"));
  const showingGroupDetail = isOutreachDetailPage(selected, new URLSearchParams(query.toString()));

  const [actionHost, setActionHost] = useState<HTMLDivElement | null>(null);
  const [connection, setConnection] = useState<{ state: string } | null>(null), [failure, setFailure] = useState(false), [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false), [fullAccess, setFullAccess] = useState(false);
  const [dirty, setDirty] = useState(false), [pending, setPending] = useState<string | null>(null), cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    outreachRequest<{ tenantKey: TenantKey; connection: { state: string }; fullAccess: boolean }>(tenant, "connection", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setConnection(result.connection); setFullAccess(result.fullAccess); } }).catch(() => { if (!controller.signal.aborted) setFailure(true); });
    return () => controller.abort();
  }, [tenant, reload]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const previousUrl = window.location.href, previousState = window.history.state;
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href);
      if (destination.origin !== window.location.origin || !destination.pathname.startsWith("/admin") || destination.href === previousUrl) return;
      event.preventDefault(); event.stopPropagation();
      if (!saving) setPending(destination.pathname + destination.search);
    };
    const pop = (event: PopStateEvent) => {
      const destination = window.location.pathname + window.location.search;
      event.stopImmediatePropagation();
      window.history.pushState(previousState, "", previousUrl);
      if (!saving) setPending(destination);
    };
    document.addEventListener("click", click, true); window.addEventListener("popstate", pop, true);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("popstate", pop, true); };
  }, [dirty, saving, query]);
  function navigate(href: string) { if (saving) return; if (dirty) setPending(href); else router.push(href); }
  const panelProps = { fullAccess, tenant, permissions, setDirty, setSaving, years, serverDate };
  let panel: ReactNode;
  if (selected === "contact-lists" && query.get("section") === "contacts") panel = <OutreachContacts {...panelProps} />;
  else if (selected === "messages") panel = <OutreachMessages {...panelProps} />;
  else if (selected === "contact-lists") panel = <OutreachGroups {...panelProps} />;
  else if (selected === "campaigns") panel = <OutreachCampaigns {...panelProps} />;
  else if (tenant === "lg" && query.get("workflow") === "fraud") panel = <MunicipalWorkflowPanel {...panelProps} />;
  else panel = <OutreachDispatches {...panelProps} />;
  const configured = !failure && connection?.state === "connected";
  const returnTo = `/admin/zaad?${new URLSearchParams({ tenant, view: selected })}`;
  const setupHref = `/admin/developer-api?${new URLSearchParams({ returnTo })}`;
  return <OutreachActionHost.Provider value={showingGroupDetail ? null : actionHost}><section>
    {!showingGroupDetail && <div data-admin-page-chrome className="space-y-4"><div data-admin-page-header className="ml-1 mr-0 flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><AdminPageTitleHelp title={t.universityOutreach.brand} description={z.description} label={z.infoLabel} />{!showingGroupDetail && <AdminTenantRouteSelect allowed={allowedTenants} dirty={dirty} saving={saving} />}</div>
      {!showingGroupDetail && <div className="-mx-4 flex flex-col border-b border-line px-4 md:-mx-6 md:px-6 xl:flex-row xl:items-center"><nav aria-label={z.title} className="min-w-0 overflow-x-auto"><div role="tablist" className="flex min-w-max items-center gap-6">{views.map((view, index) => <button key={view} id={`outreach-tab-${view}`} role="tab" disabled={saving} aria-controls="outreach-panel" aria-selected={selected === view} tabIndex={selected === view ? 0 : -1} className={`cursor-pointer disabled:cursor-not-allowed whitespace-nowrap min-h-14 border-b-2 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${selected === view ? "border-accent text-accent enabled:hover:text-accent/70" : "border-transparent text-fg enabled:hover:text-accent"}`} onClick={() => navigate(`/admin/zaad?tenant=${tenant}&view=${view}`)} onKeyDown={event => { let next = index; if (event.key === "ArrowRight") next = (index + 1) % views.length; else if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = views.length - 1; else return; event.preventDefault(); document.getElementById(`outreach-tab-${views[next]}`)?.focus(); navigate(`/admin/zaad?tenant=${tenant}&view=${views[next]}`); }}>{d.tabLabels[view]}</button>)}</div></nav><div ref={setActionHost} role="group" aria-label={`${d.tabLabels[selected]}: ${z.residents.actions}`} className="flex min-w-0 flex-wrap items-center gap-6 border-t border-line xl:ml-6 xl:border-t-0 xl:before:mr-0 xl:before:h-6 xl:before:border-l xl:before:border-line" /></div>}
    </div>}
    <div id="outreach-panel" data-admin-page-body role={configured && !showingGroupDetail ? "tabpanel" : undefined} aria-labelledby={configured && !showingGroupDetail ? `outreach-tab-${selected}` : undefined} className={`ml-1 mr-0 ${showingGroupDetail ? "" : "-mt-px"}`} key={`${tenant}:${selected}`}>
      {showingGroupDetail && selected !== "contact-lists" && (!connection || failure || connection.state !== "connected") && <div className="mb-5 space-y-5"><h1 className="text-2xl font-bold">{d.tabLabels[selected]}</h1><DetailPageBreadcrumb title={d.tabLabels[selected]} /></div>}
      {selected === "contact-lists" ? panel : !connection && !failure ? showingGroupDetail ? <OutreachLoading /> : <OutreachListPending view={selected} /> : failure || (connection && !["connected", "missing"].includes(connection.state)) ? <OutreachFailure retry={() => { setFailure(false); setConnection(null); setReload(value => value + 1); }} /> : connection?.state === "missing" ? <OutreachSetupGate copy={d} canConfigure={canConfigure} href={setupHref} /> : panel}
    </div>
    {pending && <ModalDialog title={d.confirmDiscard} description={t.admin.industrySettings.help} initialFocusRef={cancelRef} onRequestClose={() => setPending(null)}><div className="flex flex-wrap justify-end gap-3"><button ref={cancelRef} className={secondary} onClick={() => setPending(null)}>{z.common.cancel}</button><button className={primary} onClick={() => { const href = pending; setDirty(false); setPending(null); router.push(href); }}>{d.discard}</button></div></ModalDialog>}
  </section></OutreachActionHost.Provider>;
}
export function OutreachLoading() { const { t } = useI18n(); return <div role="status" aria-busy="true" aria-label={t.admin.zaad.common.loading} className="space-y-3">{[1, 2, 3, 4].map(row => <div key={row} className="h-14 animate-pulse rounded-md bg-surface-hover" />)}</div>; }
export function OutreachFailure({ retry }: { retry: () => void }) { const { t } = useI18n(); return <div role="alert" className="space-y-4 rounded-lg border border-line p-6"><p>{t.admin.zaad.common.failure}</p><button className={secondary} onClick={retry}>{t.admin.zaad.common.retry}</button></div>; }

export function OutreachSetupGate({ copy, canConfigure, href }: { copy: Pick<OutreachCommonDictionary, "setupLabel" | "setupHelp" | "setupPermission">; canConfigure: boolean; href: string }) {
  return <section data-zoom-unconfigured className="flex min-h-[calc(100dvh-15rem)] flex-col items-center justify-center gap-4 text-center">
    {canConfigure ? <Link id="zoom-api-settings" className={primary} href={href}>{copy.setupLabel}</Link> : <span id="zoom-api-settings" role="link" aria-disabled="true" tabIndex={-1} className={primary + " cursor-not-allowed opacity-50"}>{copy.setupLabel}</span>}
    <p className="max-w-md text-sm leading-7 text-fg-muted">{copy.setupHelp}{!canConfigure && copy.setupPermission}</p>
  </section>;
}
