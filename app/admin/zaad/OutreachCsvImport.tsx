"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { Checkbox } from "@/app/components/Checkbox";
import { Select } from "@/app/components/Select";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { DownloadIcon } from "@/app/components/svg/DownloadIcon";
import { UploadIcon } from "@/app/components/svg/UploadIcon";
import { CRM_CSV_MAX_BYTES, crmCsvFilename, crmCsvHeaders, crmCsvSample, csvSafeCell } from "@/lib/zaad/crm-csv-schema";
import { outreachMutation, outreachRequest } from "./outreach-client";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

type ImportRow = { rowKey: string; rowNumber: number; name?: string; phone?: string; studentNumber?: string; status: string; errorCode?: string; errorField?: "name" | "phone" | "studentNumber" };
type ImportResult = { id: string; departmentKey: string; previewDigest: string; status: string; expiresAt: string; rows: ImportRow[] };
export function OutreachCsvImport({ tenant, departments, permissions, setDirty, setSaving, close, saved }: OutreachPanelProps & { close: () => void; saved: () => void }) {
  const { t } = useI18n(), d = t.outreachCommon, z = t.admin.zaad, router = useRouter(), query = useSearchParams();
  const jobId = query.get("importJob"), [preview, setPreview] = useState<ImportResult | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string[]>([]), [department, setDepartment] = useState(departments[0]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false);
  const file = useRef<HTMLInputElement>(null), lock = useRef(false), dirty = useRef(false), cancel = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Date.parse(preview.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    outreachRequest<ImportResult>(tenant, `contacts/imports/${encodeURIComponent(jobId)}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setPreview(result); setSelected(result.rows.filter(row => ["NEW", "FAILED"].includes(row.status)).map(row => row.rowKey)); setDepartment(result.departmentKey); setFailed(false); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [tenant, jobId, reload]);
  function changed() { dirty.current = true; setDirty(true); }
  function finish() { dirty.current = false; setDirty(false); close(); }
  function requestClose() { if (lock.current) return; if (dirty.current) setDiscard(true); else finish(); }
  function working(value: boolean) { lock.current = value; setBusy(value); setSaving?.(value); }
  async function upload() {
    if (!permissions.create || lock.current) return;
    const selectedFile = file.current?.files?.[0];
    if (!selectedFile || !selectedFile.name.toLowerCase().endsWith(".csv") || selectedFile.size > CRM_CSV_MAX_BYTES) { setError(z.residents.csvFileRequired); return; }
    working(true); setError("");
    try {
      const result = await outreachRequest<ImportResult>(tenant, "contacts/imports/preview", { method: "POST", headers: { "Content-Type": "text/csv", "x-operation-key": crypto.randomUUID(), "x-department-key": department }, body: selectedFile });
      setPreview(result); setSelected(result.rows.filter(row => row.status === "NEW").map(row => row.rowKey)); dirty.current = false; setDirty(false);
      const params = new URLSearchParams(query.toString()); params.set("state", "csv-preview"); params.set("importJob", result.id); router.replace(`/admin/zaad?${params}`, { scroll: false });
    } catch { setError(z.residents.formInvalid); }
    finally { working(false); }
  }
  async function apply() {
    if (!permissions.create || !preview || lock.current) return;
    working(true); setError("");
    try { const result = await outreachMutation<ImportResult>(tenant, "contacts/imports", { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: selected }); setPreview(result); setSelected(result.rows.filter(row => row.status === "FAILED").map(row => row.rowKey)); dirty.current = false; setDirty(false); saved(); }
    catch { setError(z.common.failure); }
    finally { working(false); }
  }
  const loading = Boolean(jobId && preview?.id !== jobId), expired = preview?.status === "EXPIRED" || Boolean(preview && Date.parse(preview.expiresAt) <= now);
  const errorRows = preview?.rows.filter(row => ["INVALID", "FAILED"].includes(row.status)) ?? [];
  const errorCsv = "\ufeff" + [["row", "field", "code", "name", "phone", ...(tenant === "univ" ? ["studentNumber"] : [])], ...errorRows.map(row => [String(row.rowNumber), row.errorField ?? "", row.errorCode ?? row.status, row.name ?? "", row.phone ?? "", ...(tenant === "univ" ? [row.studentNumber ?? ""] : [])])].map(row => row.map(csvSafeCell).join(",")).join("\r\n") + "\r\n";
  function rowError(row: ImportRow) {
    if (!row.errorField) return z.residents.csvReasonInvalidValue;
    const label = row.errorField === "name" ? z.residents.name : row.errorField === "phone" ? z.residents.phone : t.universityOutreach.studentNumber;
    const raw = row[row.errorField] ?? "", reason = !raw.trim() ? z.residents.csvReasonRequired : row.errorField === "name" && raw.length > 100 ? z.residents.csvReasonTooLong : z.residents.csvReasonInvalidFormat;
    return `${label}: ${reason}`;
  }
  return <section className="max-w-4xl space-y-6" aria-labelledby="csv-page-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="csv-page-title" className="text-lg font-bold">{d.csvRegister}</h2><button className={secondary} disabled={busy} onClick={requestClose}>{d.backToContacts}</button></div>
    <p className="text-sm leading-7">{d.consentRequired}</p>
    {loading ? failed ? <OutreachFailure retry={() => { setFailed(false); setReload(value => value + 1); }} /> : <OutreachLoading /> : <>
      {error && <p role="alert">{error}</p>}
      {expired && <p role="alert">{d.importStates.EXPIRED}</p>}
      <section className="space-y-3" aria-labelledby="csv-requirements-title"><div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between"><h3 id="csv-requirements-title" className="text-lg font-bold">{d.csvRequirements}</h3><a className="inline-flex w-fit items-center gap-1 border-b border-current pb-0.5 text-accent no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href={`data:text/csv;charset=utf-8,${encodeURIComponent(crmCsvSample(tenant))}`} download={crmCsvFilename(tenant)}><DownloadIcon className="h-6 w-6 shrink-0" />{d.sampleDownload}</a></div><p className="text-sm leading-7">{d.csvHelp}</p><code className="block break-all text-sm">{crmCsvHeaders(tenant).join(",")}</code></section>
      <label className="block">{d.department}<Select disabled={busy || Boolean(preview) || !permissions.create} value={department} onChange={event => { setDepartment(event.target.value); changed(); }}>{departments.map(key => <option key={key} value={key}>{d.departments[key] ?? d.unknown}</option>)}</Select></label>
      {permissions.create && <><label className="block">{z.residents.chooseFile}<span className="relative mt-1 block"><input ref={file} type="file" accept=".csv,text/csv" disabled={busy} onChange={changed} className={input + " pr-12"} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><UploadIcon className="h-6 w-6" /></span></span></label><button className={secondary} disabled={busy} onClick={() => void upload()}>{busy ? t.admin.industrySettings.saving : z.common.confirm}</button></>}
      {preview && <section className="space-y-4" aria-label={d.csvPreview}>
        {errorRows.length > 0 && <a className="inline-flex text-accent underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(errorCsv)}`} download="outreach-import-errors.csv">{z.residents.csvErrorHeading} (.csv)</a>}
        <p role="status">{d.selected}: {selected.length}</p>
        <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-line bg-surface-hover"><tr>{[d.select, z.residents.csvErrorRow, z.residents.name, z.residents.phone, ...(tenant === "univ" ? [t.universityOutreach.studentNumber] : []), d.registrationStatus].map(label => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{preview.rows.map(row => <tr key={row.rowKey}><td className="px-4 py-3"><Checkbox aria-label={`${d.select}: ${row.rowNumber}`} disabled={busy || expired || !permissions.create || !["NEW", "FAILED"].includes(row.status)} checked={selected.includes(row.rowKey)} onChange={event => { setSelected(current => event.target.checked ? [...current, row.rowKey] : current.filter(key => key !== row.rowKey)); changed(); }} /></td><td className="px-4 py-3">{row.rowNumber}</td><td className="max-w-sm break-all px-4 py-3">{row.name}</td><td className="whitespace-nowrap px-4 py-3">{row.phone}</td>{tenant === "univ" && <td className="px-4 py-3">{row.studentNumber}</td>}<td className="px-4 py-3">{d.importStates[row.status] ?? d.unknown}{row.errorCode && <span className="block text-xs text-fg-muted">{rowError(row)}</span>}</td></tr>)}</tbody></table></div>
        {permissions.create && <button className={primary} disabled={busy || expired || !selected.length || !preview.rows.some(row => selected.includes(row.rowKey) && ["NEW", "FAILED"].includes(row.status))} onClick={() => void apply()}>{busy ? t.admin.industrySettings.saving : z.residents.import}</button>}
      </section>}
    </>}
    {discard && <ModalDialog title={d.confirmDiscard} description={d.csvRegister} initialFocusRef={cancel} onRequestClose={() => setDiscard(false)}><div className="flex justify-end gap-3"><button ref={cancel} className={secondary} onClick={() => setDiscard(false)}>{z.common.cancel}</button><button className={primary} onClick={finish}>{d.discard}</button></div></ModalDialog>}
  </section>;
}
