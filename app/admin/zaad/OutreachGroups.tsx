"use client";
import { OutreachResourceBindings } from "./OutreachResourceBindings";
import { OutreachGroupMember, type GroupMember, type MemberAction } from "./OutreachGroupMember";
import { TableRowActions, type TableRowAction } from "@/app/components/admin/TableRowActions";
import { useRouter, useSearchParams } from "next/navigation";
import { OutreachGroupEditor, type OutreachGroup as Group } from "./OutreachGroupEditor";
import { OutreachZoomImport } from "./OutreachZoomImport";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { outreachMutation, outreachRequest, type ListResult } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
type Member = GroupMember;
export function OutreachGroups(props: OutreachPanelProps) {
  const { tenant, permissions, setDirty, setSaving, fullAccess } = props;
  const [bindingsOpen, setBindingsOpen] = useState(false);
  const { t } = useI18n(), z = t.admin.zaad, d = t.outreachCommon, router = useRouter(), query = useSearchParams();
  const state = query.get("state"), id = query.get("detail"), routeKey = `${tenant}:${id}`;
  const routed = (state === "group-detail" || state === "group-edit") && Boolean(id);
  const [loadedKey, setLoadedKey] = useState(""), [detailFailure, setDetailFailure] = useState("");
  const [data, setData] = useState<ListResult<Group> | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0), [detail, setDetail] = useState<{ group: Group; items: Member[] } | null>(null);
  const [operation, setOperation] = useState(""), [busy, setBusyState] = useState(false), [error, setError] = useState("");
  const setBusy = (value: boolean) => { setBusyState(value); setSaving?.(value); };
  useEffect(() => { const controller = new AbortController(); outreachRequest<ListResult<Group>>(tenant, "contact-lists", { signal: controller.signal }).then(setData).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [tenant, reload]);
  const [memberAction, setMemberAction] = useState<MemberAction | null>(null), [menu, setMenu] = useState<string | null>(null), [deleting, setDeleting] = useState<Group | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const [importing, setImporting] = useState<{ groupId: string; contactId?: string } | null>(null);
  const refresh = () => { setFailed(false); setLoadedKey(""); setReload(value => value + 1); };
  function groupHref(nextState: string | null, groupId?: string) { const params = new URLSearchParams(query.toString()); params.delete("state"); params.delete("detail"); if (nextState) params.set("state", nextState); if (groupId) params.set("detail", groupId); return `/admin/zaad?${params}`; }
  function back() { router.replace(groupHref(null), { scroll: false }); }
  const finish = () => { setDeleting(null); };
  const close = () => { if (!lock.current) finish(); };
  function open(row: Group) { router.push(groupHref("group-detail", row.id), { scroll: false }); }
  useEffect(() => {
    if (!routed || !id) return;
    const controller = new AbortController();
    outreachRequest<{ group: Group; items: Member[] }>(tenant, `contact-lists/${encodeURIComponent(id)}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setDetail(result); setLoadedKey(routeKey); setDetailFailure(""); } }).catch(() => { if (!controller.signal.aborted) setDetailFailure(routeKey); });
    return () => controller.abort();
  }, [tenant, id, routed, routeKey, reload]);
  async function remove() {
    if (!deleting || lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await outreachMutation(tenant, `contact-lists/${encodeURIComponent(deleting.id)}`, { operationKey: operation, version: deleting.version }, "DELETE"); if (detail?.group.id === deleting.id) setDetail(null); finish(); refresh(); }
    catch { setError(z.common.failure); } finally { lock.current = false; setBusy(false); }
  }
  function edit(row?: Group) { router.push(groupHref(row ? "group-edit" : "group-create", row?.id), { scroll: false }); }
  function groupActions(row: Group): TableRowAction[] {
    return [...(permissions.update ? [{ id: "edit", label: z.common.edit, disabled: busy, onSelect: () => edit(row) }] : []), ...(permissions.delete ? [{ id: "delete", label: z.common.delete, tone: "danger" as const, disabled: busy, onSelect: () => { setError(""); setOperation(crypto.randomUUID()); setDeleting(row); } }] : [])];
  }
  const mutationBlock = detail?.group.mutationBlock;
  const mutationReason = mutationBlock ? d.groupMutationBlocks[mutationBlock] : undefined;
  function memberActions(member: Member): TableRowAction[] {
    return [...(permissions.update ? [{ id: "edit", label: d.memberEdit, disabled: busy || Boolean(mutationBlock), disabledReason: mutationReason, onSelect: () => setMemberAction({ mode: "edit", member }) }, ...(!member.mapping?.personId || member.mapping.syncState === "DIFFERENCE" ? [{ id: "link", label: d.link, disabled: busy, onSelect: () => setMemberAction({ mode: "link" as const, member }) }] : [])] : []), ...(permissions.create && !member.mapping ? [{ id: "import", label: d.zoomImportUi.singleTitle, disabled: busy, onSelect: () => setImporting({ groupId: detail!.group.id, contactId: member.id }) }] : []), ...(permissions.delete ? [{ id: "delete", label: d.memberDelete, tone: "danger" as const, disabled: busy || Boolean(mutationBlock), disabledReason: mutationReason, onSelect: () => setMemberAction({ mode: "delete", member }) }] : [])];
  }
  if (state === "group-create") return <OutreachGroupEditor key={`${tenant}:new`} {...props} group={null} close={back} saved={() => { refresh(); back(); }} />;
  if (routed && (loadedKey !== routeKey || detailFailure === routeKey)) return <div className="space-y-4"><button className={secondary} onClick={back}>{d.backToContacts}</button>{detailFailure === routeKey ? <OutreachFailure retry={() => { setDetailFailure(""); refresh(); }} /> : <OutreachLoading />}</div>;
  if (state === "group-edit" && routed && detail) return <OutreachGroupEditor key={routeKey} {...props} group={detail.group} close={back} saved={() => { refresh(); back(); }} />;
  const showingDetail = routed && state === "group-detail" && loadedKey === routeKey;
  if (failed && !showingDetail) return <OutreachFailure retry={refresh} />;
  if (!data && !showingDetail) return <OutreachLoading />;
  return <div className="space-y-5">
    {!showingDetail && <><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{d.tabs[1]} <span className="text-sm font-normal text-fg-muted">({data?.total ?? "—"})</span></h2>{fullAccess && permissions.update && <button className={secondary} disabled={busy} onClick={() => setBindingsOpen(true)}>{d.bindingTitle}</button>}{permissions.create && <button className={primary} disabled={busy} onClick={() => edit()}>{z.common.create}</button>}</div>
    <p className="text-sm leading-7 text-fg-muted">{d.groupListHelp}</p>
    {error && !deleting && <p role="alert">{error}</p>}
    {!data?.items.length ? <p className="rounded-lg border border-line p-8 text-center">{z.common.empty}</p> : <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-line bg-surface-hover"><tr><th className="px-4 py-3">{d.groupListName}</th><th className="px-4 py-3">{z.contactLists.descriptionLabel}</th><th className="whitespace-nowrap px-4 py-3">{d.groupMembers}</th><th className="whitespace-nowrap px-4 py-3">{d.groupIndustry}</th><th className="px-4 py-3 text-center">{z.residents.actions}</th></tr></thead><tbody className="divide-y divide-line">{data.items.map(row => <tr key={row.id}><td className="px-4 py-3"><button className="cursor-pointer text-left font-semibold hover:text-accent" disabled={busy} onClick={() => void open(row)}>{row.name}</button></td><td className="px-4 py-3">{row.description}</td><td className="whitespace-nowrap px-4 py-3">{row.contactCount ?? "—"}</td><td className="whitespace-nowrap px-4 py-3">{t.admin.industrySettings.names[tenant]}</td><td className="px-4 py-3"><div className="flex justify-center"><TableRowActions items={groupActions(row)} label={`${row.name}: ${z.residents.actions}`} open={menu === row.id} onOpenChange={value => setMenu(value ? row.id : null)} /></div></td></tr>)}</tbody></table></div>}
    <p className="text-sm leading-7 text-fg-muted">{d.groupScopeHelp}</p>
    </>}
    {showingDetail && detail && <section className="space-y-6" aria-labelledby="group-detail-title"><div className="flex flex-wrap justify-between gap-3"><h2 id="group-detail-title" className="text-lg font-bold">{detail.group.name}</h2><button className={secondary} disabled={busy} onClick={back}>{d.backToContacts}</button></div>{permissions.create && <div className="flex flex-wrap gap-3"><button className={secondary} disabled={busy || Boolean(mutationBlock)} aria-describedby={mutationBlock ? "group-mutation-block" : undefined} onClick={() => setMemberAction({ mode: "add" })}>{d.memberAdd}</button><button className={secondary} disabled={busy} onClick={() => setImporting({ groupId: detail.group.id })}>{d.sync}</button></div>}
      {mutationReason && <div className="space-y-3"><p id="group-mutation-block" role="alert" className="text-sm leading-7">{mutationReason}</p><button className={secondary} disabled={busy} onClick={refresh}>{d.reload}</button></div>}
      {!detail.items.length ? <p>{z.common.empty}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-line"><tr><th className="px-3 py-2">{z.residents.name}</th><th className="px-3 py-2">{z.residents.phone}</th><th className="px-3 py-2">{z.messages.status}</th><th className="px-3 py-2 text-center">{z.residents.actions}</th></tr></thead><tbody className="divide-y divide-line">{detail.items.map(member => <tr key={member.id}><td className="px-3 py-3">{member.displayName}</td><td className="whitespace-nowrap px-3 py-3">{member.phones.map(phone => phone.number).join(" / ") || d.unknown}</td><td className="px-3 py-3">{!member.mapping ? d.zoomOnly : member.mapping.syncState === "DIFFERENCE" ? d.difference : member.mapping.syncState === "LINKED" ? d.linked : d.pending}</td><td className="px-3 py-3"><div className="flex justify-center"><TableRowActions items={memberActions(member)} label={`${member.displayName}: ${z.residents.actions}`} open={menu === member.id} onOpenChange={value => setMenu(value ? member.id : null)} /></div></td></tr>)}</tbody></table></div>}
    <p className="text-sm leading-7 text-fg-muted">{d.memberBoundary}</p>
    </section>}
    {bindingsOpen && <OutreachResourceBindings {...props} close={() => setBindingsOpen(false)} saved={refresh} />}
    {memberAction && detail && <OutreachGroupMember tenant={tenant} group={detail.group} action={memberAction} setDirty={setDirty} setSaving={setBusy} close={() => setMemberAction(null)} saved={refresh} />}
    {importing && <OutreachZoomImport tenant={tenant} setSaving={setSaving} {...importing} close={() => setImporting(null)} saved={refresh} />}
    {deleting && <ModalDialog initialFocusRef={deleteCancelRef} title={d.groupDeleteTitle} description={deleting.name} locked={busy} onRequestClose={close}><p className="mb-4 text-sm">{d.groupDeleteHelp}</p>{error && <p role="alert" className="mb-4">{error}</p>}<div className="flex justify-end gap-3"><button ref={deleteCancelRef} className={secondary} disabled={busy} onClick={close}>{z.common.cancel}</button><button className={primary} disabled={busy} onClick={() => void remove()}>{z.common.delete}</button></div></ModalDialog>}

  </div>;
}
