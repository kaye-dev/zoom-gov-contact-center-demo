"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { DetailPageBreadcrumb } from "./DetailPageBreadcrumb";
import { DownloadIcon } from "@/app/components/svg/DownloadIcon";
import { UploadIcon } from "@/app/components/svg/UploadIcon";
import { CRM_CSV_MAX_BYTES, crmCsvFilename, csvSafeCell } from "@/lib/zaad/crm-csv-schema";
import { outreachMutation, outreachRequest } from "./outreach-client";
import { crmCsvSample } from "@/lib/zaad/crm-csv-schema";
import { crmImportSummary, type CrmImportRow as ImportRow, type CrmImportResult as ImportResult } from "@/lib/zaad/crm-import-view";
import { OutreachFailure, OutreachLoading, type OutreachPanelProps } from "./OutreachView";
import { registrationInputClass as input, outreachPrimary as primary } from "@/app/notifications/register/StudentNotificationRegistration";

export function OutreachCsvImport({ tenant, permissions, setDirty, setSaving, saved }: OutreachPanelProps & { close: () => void; saved: () => void }) {
  const { t } = useI18n(), d = t.outreachCommon, c = d.csv, z = t.admin.zaad, router = useRouter(), query = useSearchParams();
  const jobId = query.get("importJob"), [preview, setPreview] = useState<ImportResult | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null), lock = useRef(false), generation = useRef(0), ownJob = useRef<string | null>(null), noticeRef = useRef<HTMLParagraphElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Date.parse(preview.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);
  useEffect(() => {
    if (!jobId || ownJob.current === jobId) return;
    const current = generation.current;
    const controller = new AbortController();
    outreachRequest<ImportResult>(tenant, `contacts/imports/${encodeURIComponent(jobId)}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted && current === generation.current) { setPreview(result); setFailed(false); setDirty(crmImportSummary(result, Date.now()).targets.length > 0); } }).catch(() => { if (!controller.signal.aborted && current === generation.current) setFailed(true); });
    return () => controller.abort();
  }, [tenant, jobId, reload, setDirty]);
  function changed() { setDirty(true); }
  useEffect(() => {
    const input = file.current;
    const cancel = () => {
      if (!input?.files?.length && !lock.current) {
        generation.current += 1; ownJob.current = null; setPreview(null); setError(""); setDirty(false);
        const params = new URLSearchParams(query.toString()); params.delete("importJob"); params.set("state", "csv-upload");
        router.replace(`/admin/zaad?${params}`, { scroll: false });
      }
    };
    input?.addEventListener("cancel", cancel); return () => input?.removeEventListener("cancel", cancel);
  }, [query, router, setDirty]);
  function working(value: boolean) { lock.current = value; setBusy(value); setSaving?.(value); }
  async function upload() {
    if (!permissions.create || lock.current) return;
    generation.current += 1; ownJob.current = null; setPreview(null); setFailed(false); setError("");
    const resetParams = new URLSearchParams(query.toString()); resetParams.delete("importJob"); resetParams.set("state", "csv-upload");
    router.replace(`/admin/zaad?${resetParams}`, { scroll: false });
    const selectedFile = file.current?.files?.[0];
    if (!selectedFile) { setDirty(false); return; }
    if ( !selectedFile.name.toLowerCase().endsWith(".csv") || selectedFile.size > CRM_CSV_MAX_BYTES) { setError(z.residents.csvFileRequired); return; }
    working(true);
    try {
      const result = await outreachRequest<ImportResult>(tenant, "contacts/imports/preview", { method: "POST", headers: { "Content-Type": "text/csv", "x-operation-key": crypto.randomUUID() }, body: selectedFile });
      ownJob.current = result.id; setPreview(result); setDirty(true);
      const params = new URLSearchParams(query.toString()); params.set("state", "csv-preview"); params.set("importJob", result.id); router.replace(`/admin/zaad?${params}`, { scroll: false });
    } catch { setError(z.residents.formInvalid); }
    finally { working(false); }
  }
  async function apply() {
    if (!permissions.create || !preview || lock.current || !crmImportSummary(preview, Date.now()).canSubmit) return;
    working(true); setError("");
    try { const result = await outreachMutation<ImportResult>(tenant, "contacts/imports", { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: crmImportSummary(preview, Date.now()).targets }); setPreview(result); setDirty(crmImportSummary(result, Date.now()).targets.length > 0); saved(); }
    catch { setError(z.common.failure); }
    finally { working(false); }
  }
  const loading = Boolean(jobId && preview?.id !== jobId), summary = preview ? crmImportSummary(preview, now) : null, expired = summary?.expired;
  const errorRows = summary?.errors ?? [];
  useEffect(() => { if (error) errorRef.current?.focus(); else if (preview) noticeRef.current?.focus(); }, [error, preview]);
  const errorCsv = "\ufeff" + [["row", "field", "code", "name", "phone", ...(tenant === "univ" ? ["studentNumber"] : []), "topicIds"], ...errorRows.map(row => [String(row.rowNumber), row.errorField ?? "", row.errorCode ?? row.status, row.name ?? "", row.phone ?? "", ...(tenant === "univ" ? [row.studentNumber ?? ""] : []), row.rawTopicIds ?? row.topicIds?.join(";") ?? ""])].map(row => row.map(csvSafeCell).join(",")).join("\r\n") + "\r\n";
  function rowError(row: ImportRow) {
    if (row.errorField === "topicIds") return c.invalidTopics;
    if (!row.errorField) return z.residents.csvReasonInvalidValue;
    const label = row.errorField === "name" ? z.residents.name : row.errorField === "phone" ? z.residents.phone : t.universityOutreach.studentNumber;
    const raw = row[row.errorField] ?? "", reason = !raw.trim() ? z.residents.csvReasonRequired : row.errorField === "name" && raw.length > 100 ? z.residents.csvReasonTooLong : z.residents.csvReasonInvalidFormat;
    return `${label}: ${reason}`;
  }
  return <section className="max-w-4xl space-y-6" aria-labelledby="csv-page-title" aria-busy={busy || loading}>
    <h1 id="csv-page-title" className="text-2xl font-bold">{d.csvRegister}</h1><DetailPageBreadcrumb title={d.csvRegister} parent="contacts" disabled={busy} />
    {busy && !preview && <p role="status">{c.checking}</p>}
    {loading ? failed ? <OutreachFailure retry={() => { setFailed(false); setReload(value => value + 1); }} /> : <OutreachLoading /> : <>
      {error && <p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}
      {expired && <p role="alert">{d.importStates.EXPIRED}</p>}
      <section className="space-y-3" aria-labelledby="csv-requirements-title"><div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between"><h3 id="csv-requirements-title" className="text-lg font-bold">{d.csvRequirements}</h3><a className="inline-flex w-fit items-center gap-1 border-b border-current pb-0.5 text-accent no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href={`data:text/csv;charset=utf-8,${encodeURIComponent(crmCsvSample(tenant))}`} download={crmCsvFilename(tenant)}><DownloadIcon className="h-6 w-6 shrink-0" />{d.sampleDownload}</a></div><p className="text-sm leading-7">{d.csvHelp}</p></section>
      {permissions.create && <><label className="block">{z.residents.chooseFile}<span className="relative mt-1 block"><input ref={file} type="file" accept=".csv,text/csv" disabled={busy} onChange={() => { changed(); void upload(); }} className={input + " pr-12"} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><UploadIcon className="h-6 w-6" /></span></span></label></>}
      {preview && <section className="space-y-4" aria-label={d.csvPreview}>
        {errorRows.length > 0 && <a className="inline-flex text-accent underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(errorCsv)}`} download="outreach-import-errors.csv">{z.residents.csvErrorHeading} (.csv)</a>}
        <p ref={noticeRef} tabIndex={-1} role="status">{preview.status === "COMPLETED" ? c.complete.replace("{count}", String(summary!.imported)) : c.summary.replace("{total}", String(preview.rows.length)).replace("{shown}", String(summary!.shown.length)).replace("{excluded}", String(summary!.excluded)).replace("{targets}", String(summary!.targets.length))}</p>{errorRows.length > 0 && <p role="alert">{c.errors.replace("{count}", String(errorRows.length))} {summary!.invalid ? c.correct : c.retryHelp}</p>}
        <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-surface-hover"><tr>{[z.residents.csvErrorRow, z.residents.name, z.residents.phone, ...(tenant === "univ" ? [t.universityOutreach.studentNumber] : []), c.topics, d.registrationStatus].map(label => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line [&>tr:first-child]:border-t [&>tr:first-child]:border-line">{summary!.shown.map(row => <tr key={row.rowKey}><td className="px-4 py-3">{row.rowNumber}</td><td className="min-w-[10rem] max-w-sm break-all px-4 py-3">{row.name}</td><td className="whitespace-nowrap px-4 py-3">{row.phone}</td>{tenant === "univ" && <td className="px-4 py-3">{row.studentNumber}</td>}<td className="px-4 py-3">{row.topicIds?.map(id => `${(tenant === "lg" ? t.municipalOutreach.topics : t.universityOutreach.topics)[id as never] ?? id} (${id})`).join("、") || "—"}</td><td className="px-4 py-3">{d.importStates[row.status] ?? d.unknown}{row.errorCode && <span className="block text-xs text-fg-muted">{rowError(row)}</span>}</td></tr>)}</tbody></table></div>
        {permissions.create && <button className={primary} disabled={busy || !summary?.canSubmit} onClick={() => void apply()}>{busy ? t.admin.industrySettings.saving : preview.rows.some(row => row.status === "FAILED") ? z.common.retry : c.import}</button>}
      </section>}
    </>}

  </section>;
}
