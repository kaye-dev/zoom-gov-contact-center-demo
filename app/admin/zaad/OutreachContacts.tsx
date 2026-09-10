"use client";
import { useEffect, useRef, useState } from "react";
import { OutreachRegistrationSettings } from "./OutreachRegistrationSettings";
import { TableRowActions } from "@/app/components/admin/TableRowActions";
import { SearchInput } from "@/app/components/admin/SearchInput";
import { Pagination } from "@/app/components/admin/Pagination";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { type ContactDto, referenceKey } from "@/lib/zaad/outreach-contracts";
import { outreachMutation, outreachRequest, type ListResult } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { OutreachLegacyContactEditor } from "./OutreachLegacyContactEditor";
import { OutreachContactEditor } from "./OutreachContactEditor";
import { OutreachCsvImport } from "./OutreachCsvImport";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
export function OutreachContacts(props: OutreachPanelProps) {
  const { tenant, permissions } = props, { t } = useI18n(), z = t.admin.zaad, d = t.outreachCommon, router = useRouter(), query = useSearchParams();
  const search = query.get("query") ?? "", cursor = query.get("cursor") ?? "";
  const [text, setText] = useState(search), [data, setData] = useState<(ListResult<ContactDto> & { queryKey: string }) | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const contactState = query.get("state"), contactId = query.get("detail"), contactOrigin = query.get("origin");
  const contactRoute = contactState === "contact-add" ? "new" : (contactState === "contact-detail" || contactState === "contact-edit") && contactId ? `${tenant}:${contactOrigin}:${contactId}` : null;
  const [routeContact, setRouteContact] = useState<{ key: string; contact: ContactDto } | null>(null);
  const [routeFailure, setRouteFailure] = useState<string | null>(null);
  const returnContactKey = useRef<string | null>(null);
  const [editor, setEditor] = useState<ContactDto | null>(null);
  const [busy, setBusyState] = useState(false), [error, setError] = useState(""), lock = useRef(false);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState<ContactDto | null>(null), [reason, setReason] = useState(""), [menu, setMenu] = useState<string | null>(null), [composing, setComposing] = useState(false);
  const queryString = query.toString();
  const [previousSearch, setPreviousSearch] = useState(search);
  if (previousSearch !== search) { setPreviousSearch(search); setText(search); }
  const setBusy = (value: boolean) => { setBusyState(value); props.setSaving?.(value); };
  useEffect(() => {
    if (composing || text === search) return;
    const timer = setTimeout(() => { const params = new URLSearchParams(queryString); params.set("query", text); params.delete("cursor"); params.delete("trail"); params.delete("page"); router.replace(`/admin/zaad?${params}`, { scroll: false }); }, 200);
    return () => clearTimeout(timer);
  }, [text, search, composing, router, queryString]);
  useEffect(() => { const controller = new AbortController(); outreachRequest<ListResult<ContactDto>>(tenant, `contacts?query=${encodeURIComponent(search)}&cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData({ ...result, queryKey: `${tenant}:${search}:${cursor}` }); }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [tenant, search, cursor, reload]);
  useEffect(() => {
    if (!contactRoute || contactRoute === "new") return;
    const controller = new AbortController();
    outreachRequest<{ contact: ContactDto }>(tenant, `contacts/${encodeURIComponent(contactId!)}?origin=${encodeURIComponent(contactOrigin ?? "")}`, { signal: controller.signal })
      .then(({ contact }) => { if (!controller.signal.aborted) setRouteContact({ key: contactRoute, contact }); })
      .catch(() => { if (!controller.signal.aborted) setRouteFailure(contactRoute); });
    return () => controller.abort();
  }, [contactRoute, contactId, contactOrigin, tenant, reload]);
  useEffect(() => {
    if (!editor && !contactRoute && returnContactKey.current) document.querySelector<HTMLButtonElement>(`[data-contact-key="${CSS.escape(returnContactKey.current)}"]`)?.focus();
  }, [editor, contactRoute, data]);
  function contactHref(state: "contact-detail" | "contact-edit" | "contact-add" | null, row?: ContactDto) {
    const params = new URLSearchParams(queryString);
    params.delete("state"); params.delete("detail"); params.delete("origin");
    if (state) params.set("state", state);
    if (row) { params.set("detail", row.reference.id); params.set("origin", row.reference.origin); }
    return `/admin/zaad?${params}`;
  }
  function closeContact() { setEditor(null); router.replace(contactHref(null), { scroll: false }); }
  function openContact(row: ContactDto, mode: "detail" | "edit") {
    returnContactKey.current = referenceKey(row.reference);
    if (row.reference.origin === "DISASTER_RADIO") { setEditor(row); return; }
    setRouteContact({ key: `${tenant}:${row.reference.origin}:${row.reference.id}`, contact: row });
    setRouteFailure(null);
    router.push(contactHref(mode === "edit" ? "contact-edit" : "contact-detail", row), { scroll: false });
  }
  const refresh = () => { setFailed(false); setReload(value => value + 1); };
  const page = Math.max(1, Number(query.get("page")) || 1), trail = query.getAll("trail");
  function pageHref(next: boolean) { const params = new URLSearchParams(queryString); params.delete("trail"); const history = next ? [...trail, cursor] : trail.slice(0, -1); history.forEach(value => params.append("trail", value)); const nextCursor = next ? data?.nextCursor : trail.at(-1); if (nextCursor) params.set("cursor", nextCursor); else params.delete("cursor"); params.set("page", String(next ? page + 1 : Math.max(1, page - 1))); return `/admin/zaad?${params}`; }
  function settings(open: boolean) { const params = new URLSearchParams(queryString); if (open) params.set("state", "registration-settings"); else params.delete("state"); router.push(`/admin/zaad?${params}`, { scroll: false }); }
  async function remove() {
    if (!deleting || lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await outreachMutation(tenant, `contacts/${encodeURIComponent(deleting.reference.id)}?origin=${deleting.reference.origin}`, { version: deleting.version, reason }, "DELETE"); setDeleting(null); refresh(); }
    catch { setError(z.common.failure); } finally { lock.current = false; setBusy(false); }
  }
  function importPage(open: boolean) { const params = new URLSearchParams(queryString); params.delete("importJob"); if (open) params.set("state", "csv-upload"); else params.delete("state"); router.push(`/admin/zaad?${params}`, { scroll: false }); }
  if (["csv-upload", "csv-preview", "csv-error"].includes(contactState ?? "")) return <OutreachCsvImport {...props} close={() => importPage(false)} saved={refresh} />;
  if (query.get("state") === "registration-settings") return <OutreachRegistrationSettings {...props} close={() => settings(false)} />;
  const loading = !data || data.queryKey !== `${tenant}:${search}:${cursor}` || text !== search;
  const status = (value: string) => value === "ACTIVE" ? d.active : value === "WITHDRAWN" ? d.withdrawn : value === "IMPORTED" ? d.imported : value === "PENDING_REVIEW" ? d.pending : value === "CONSENTED" ? z.residents.consentedValue : value === "NOT_CONSENTED" ? z.residents.notConsentedValue : d.unknown;
  if (contactRoute) {
    const selectedContact = routeContact?.key === contactRoute ? routeContact.contact : null;
    if (contactRoute !== "new" && (!selectedContact || routeFailure === contactRoute)) return <div className="space-y-4"><button className={secondary} onClick={closeContact}>{d.backToContacts}</button>{routeFailure === contactRoute ? <OutreachFailure retry={() => { setRouteFailure(null); refresh(); }} /> : <OutreachLoading />}</div>;
    if (selectedContact?.reference.origin === "DISASTER_RADIO") return <OutreachLegacyContactEditor {...props} contact={selectedContact} close={closeContact} saved={() => { closeContact(); props.setDirty(false); refresh(); }} />;
    return <OutreachContactEditor key={contactRoute} {...props} initialMode={contactState === "contact-edit" ? "edit" : "detail"} contact={selectedContact} edit={() => router.replace(contactHref("contact-edit", selectedContact!), { scroll: false })} close={closeContact} saved={() => { closeContact(); props.setDirty(false); refresh(); }} />;
  }
  return <div className="space-y-5"><button className={secondary} disabled={busy} onClick={() => router.push(`/admin/zaad?tenant=${tenant}&view=contact-lists`)}>{d.defaultGroups.back}</button><div data-contact-list-toolbar className="flex min-w-0 flex-col items-start gap-4 lg:flex-row lg:items-center lg:gap-3"><h2 className="shrink-0 whitespace-nowrap text-lg font-bold">{d.defaultGroups.manageContacts} <span className="text-sm font-normal text-fg-muted">({loading ? "—" : data?.total ?? "—"})</span></h2><SearchInput label={z.common.search} placeholder={z.common.search} autoComplete="off" containerClassName="w-full md:max-w-md lg:w-auto lg:flex-1 lg:max-w-xs" value={text} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setText(event.currentTarget.value); setComposing(false); }} onChange={event => setText(event.target.value)} /><div data-contact-list-actions className="flex flex-wrap gap-3 lg:ml-auto lg:shrink-0 lg:flex-nowrap lg:gap-2 lg:[&>button]:whitespace-nowrap lg:[&>button]:px-3"><button className={secondary} disabled={busy} onClick={refresh}>{d.reload}</button><button className={secondary} disabled={busy} onClick={() => settings(true)}>{d.registrationSettings}</button>{permissions.create && <><button className={secondary} disabled={busy} onClick={() => importPage(true)}>{d.csvRegister}</button><button className={primary} disabled={busy} onClick={() => { returnContactKey.current = null; router.push(contactHref("contact-add"), { scroll: false }); }}>{tenant === "lg" ? d.residentRegister : d.studentRegister}</button></>}</div></div>
    {failed ? <OutreachFailure retry={refresh} /> : loading ? <OutreachLoading /> : !data!.items.length ? <p className="rounded-lg border border-line p-8 text-center">{z.common.empty}</p> : <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full text-left text-sm"><thead className="border-b border-line bg-surface-hover"><tr>{[z.residents.name, z.residents.phone, ...(tenant === "univ" ? [t.universityOutreach.studentNumber] : []), d.topic, d.registrationStatus, d.department, d.source, z.residents.actions].map(label => <th key={label} className={`whitespace-nowrap px-4 py-3 font-semibold ${label === z.residents.actions ? "text-center" : ""}`}>{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{data!.items.map(row => <tr key={referenceKey(row.reference)}><td className="px-4 py-3 font-medium"><button className="cursor-pointer text-left text-accent hover:underline" data-contact-key={referenceKey(row.reference)} onClick={() => openContact(row, "detail")}>{row.name}</button></td><td className="whitespace-nowrap px-4 py-3">{row.phone}</td>{tenant === "univ" && <td className="px-4 py-3">{row.studentNumber}</td>}<td className="px-4 py-3">{row.requestedTopics.map(topic => tenant === "lg" ? t.municipalOutreach.topics[topic as keyof typeof t.municipalOutreach.topics] : t.universityOutreach.topicLabels[["scholarship", "class-change", "facility", "group", "continuity"].indexOf(topic)]).filter(Boolean).join(" / ") || "—"}</td><td className="whitespace-nowrap px-4 py-3">{status(row.status)}</td><td className="px-4 py-3">{d.departments[row.departmentKey] ?? d.unknown}</td><td className="px-4 py-3">{row.source === "MANUAL" ? d.manual : row.source === "UNKNOWN" ? d.unknown : row.source}</td><td className="px-4 py-3"><div className="flex justify-center"><TableRowActions label={`${row.name}: ${z.residents.actions}`} open={menu === referenceKey(row.reference)} onOpenChange={value => setMenu(value ? referenceKey(row.reference) : null)} items={[{ id: "edit", label: permissions.update ? z.common.edit : d.select, onSelect: () => openContact(row, permissions.update ? "edit" : "detail") }, ...(permissions.delete && row.reference.origin !== "DISASTER_RADIO" ? [{ id: "delete", label: z.common.delete, tone: "danger" as const, onSelect: () => { setDeleting(row); setReason(""); setError(""); } }] : [])]} /></div></td></tr>)}</tbody></table></div>}
    {!loading && data && (page > 1 || data.nextCursor) && <Pagination page={page} totalPages={Math.max(page, Math.ceil((data.total ?? 0) / 25), data.nextCursor ? page + 1 : page)} previousHref={pageHref(false)} nextHref={pageHref(true)} ariaLabel={d.defaultGroups.manageContacts} previousLabel={z.common.previous} nextLabel={z.common.next} />}
    {deleting && <ModalDialog initialFocusRef={deleteCancelRef} title={d.deleteContact} description={deleting.name} locked={busy} onRequestClose={() => { if (!lock.current) setDeleting(null); }}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void remove(); }}><p className="text-sm text-fg-muted">{d.deleteContactHelp}</p>{error && <p role="alert">{error}</p>}<label className="block">{d.deleteReason}<textarea required maxLength={1000} className={input} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex justify-end gap-3"><button ref={deleteCancelRef} type="button" className={secondary} disabled={busy} onClick={() => setDeleting(null)}>{z.common.cancel}</button><button className={primary} disabled={busy}>{z.common.delete}</button></div></form></ModalDialog>}
    {editor && editor.reference.origin === "DISASTER_RADIO" ? <OutreachLegacyContactEditor {...props} contact={editor} close={() => setEditor(null)} saved={() => { setEditor(null); props.setDirty(false); refresh(); }} /> : null}

  </div>;
}
