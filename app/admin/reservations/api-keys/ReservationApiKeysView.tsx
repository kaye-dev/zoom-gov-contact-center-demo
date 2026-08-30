"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { Checkbox } from "@/app/components/Checkbox";
import { useI18n } from "@/app/i18n/LanguageProvider";
import {
  RESERVATION_API_PERMISSIONS,
  isValidMonthlyLimit,
  type ReservationApiPermission,
  type ReservationApiUsageLimitDto,
} from "@/lib/reservation-api";
import type { ReservationApiKeyMetadata } from "@/lib/server/reservation-api-keys";

const API_ROWS: Array<{ permission: ReservationApiPermission; method: string; endpoint: string }> = [
  { permission: "LIST", method: "GET", endpoint: "/api/public/v1/reservations" },
  { permission: "READ", method: "GET", endpoint: "/api/public/v1/reservations/{id}" },
  { permission: "CREATE", method: "POST", endpoint: "/api/public/v1/reservations" },
  { permission: "UPDATE", method: "PATCH", endpoint: "/api/public/v1/reservations/{id}" },
  { permission: "DELETE", method: "DELETE", endpoint: "/api/public/v1/reservations/{id}" },
];

export function ReservationApiKeysView({
  initialApiKeys,
  initialUsageLimit,
  canEdit,
}: {
  initialApiKeys: ReservationApiKeyMetadata[];
  initialUsageLimit: ReservationApiUsageLimitDto;
  canEdit: boolean;
}) {
  const { locale, t } = useI18n();
  const copy = t.admin.reservationManagement.apiKeys;
  const [apiKeys, setApiKeys] = useState(initialApiKeys);
  const [usageLimit, setUsageLimit] = useState(initialUsageLimit);
  const [dialog, setDialog] = useState<"issue" | "issued" | "usage" | "revoke" | null>(null);
  const [issuedRawKey, setIssuedRawKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ReservationApiKeyMetadata | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [issueName, setIssueName] = useState("");
  const [issuePermissions, setIssuePermissions] = useState<ReservationApiPermission[]>([...RESERVATION_API_PERMISSIONS]);
  const [permissionError, setPermissionError] = useState(false);
  const [usageMode, setUsageMode] = useState<"LIMITED" | "UNLIMITED">(usageLimit.mode);
  const [usageValue, setUsageValue] = useState(usageLimit.monthlyLimit ?? "10000");
  const [usageValidationError, setUsageValidationError] = useState(false);
  const issueNameRef = useRef<HTMLInputElement>(null);
  const usageModeRef = useRef<HTMLInputElement>(null);
  const usageInputRef = useRef<HTMLInputElement>(null);
  const issuedKeyRef = useRef<HTMLInputElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  const closeDialog = () => {
    if (isSubmitting) return;
    setDialog(null);
    setError(null);
    setCopied(false);
    setPermissionError(false);
    setUsageValidationError(false);
    if (dialog === "issued") setIssuedRawKey(null);
  };

  const openIssue = () => {
    setIssueName("");
    setIssuePermissions([...RESERVATION_API_PERMISSIONS]);
    setError(null);
    setDialog("issue");
  };

  const submitIssue = async (event: FormEvent) => {
    event.preventDefault();
    if (issuePermissions.length === 0) {
      setPermissionError(true);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/reservation-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: issueName, permissions: issuePermissions }),
      });
      const body = await response.json() as { apiKey?: ReservationApiKeyMetadata; rawKey?: string };
      if (!response.ok || !body.apiKey || !body.rawKey) throw new Error("issue");
      setApiKeys((current) => [body.apiKey!, ...current]);
      setIssuedRawKey(body.rawKey);
      setDialog("issued");
    } catch {
      setError(copy.genericError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRevoke = async () => {
    if (!revokeTarget) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reservation-api-keys/${encodeURIComponent(revokeTarget.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ expectedRevision: revokeTarget.revision }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "conflict" : "generic");
      const revokedAt = new Date().toISOString();
      setApiKeys((current) => current.map((key) => key.id === revokeTarget.id
        ? { ...key, revokedAt, revision: key.revision + 1 }
        : key));
      setDialog(null);
      setRevokeTarget(null);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "conflict" ? copy.conflictError : copy.genericError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openUsage = () => {
    setUsageMode(usageLimit.mode);
    setUsageValue(usageLimit.monthlyLimit ?? "10000");
    setError(null);
    setDialog("usage");
  };

  const submitUsage = async (event: FormEvent) => {
    event.preventDefault();
    let valid = true;
    if (usageMode === "LIMITED") {
      try {
        valid = /^(0|[1-9]\d*)$/u.test(usageValue) && isValidMonthlyLimit(BigInt(usageValue));
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      setUsageValidationError(true);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/reservation-api-usage-limit", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(usageMode === "UNLIMITED"
          ? { mode: "UNLIMITED", expectedRevision: usageLimit.revision }
          : { mode: "LIMITED", monthlyLimit: usageValue, expectedRevision: usageLimit.revision }),
      });
      const body = await response.json() as { usageLimit?: ReservationApiUsageLimitDto };
      if (!response.ok || !body.usageLimit) throw new Error(response.status === 409 ? "conflict" : "generic");
      setUsageLimit(body.usageLimit);
      setDialog(null);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "conflict" ? copy.conflictError : copy.genericError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyRawKey = async () => {
    if (!issuedRawKey) return;
    try {
      await navigator.clipboard.writeText(issuedRawKey);
      setCopied(true);
    } catch {
      issuedKeyRef.current?.select();
    }
  };

  return (
    <div id="reservation-api-keys-page"><section id="reservation-api-key-content" className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl space-y-2">
          <Link id="back-to-reservations" href="/admin/reservations" className="inline-flex text-sm font-semibold text-accent hover:underline">{copy.back}</Link>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-sm leading-6 text-fg-muted">{copy.description}</p>
        </div>
        <button id="open-issue-dialog" type="button" onClick={openIssue} disabled={!canEdit} className="cursor-pointer rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:shrink-0">{copy.issue}</button>
      </div>

      <p id="read-only-notice" role="status" hidden={canEdit} className="rounded-md border border-line bg-surface-accent-subtle px-4 py-3 text-sm font-semibold text-accent">{copy.readOnly}</p>

      <section id="usage-limit-card" aria-labelledby="usage-limit-heading" className="rounded-lg border border-line bg-surface-raised shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div><h2 id="usage-limit-heading" className="text-lg font-bold">{copy.usage.title}</h2><p className="mt-1 text-sm leading-6 text-fg-muted">{copy.usage.description}</p></div>
          <button id="open-usage-limit-dialog" type="button" onClick={openUsage} disabled={!canEdit} className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">{copy.usage.change}</button>
        </div>
        <dl className="grid overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-line">
          <UsageValue id="usage-limit-value" label={copy.usage.limit} value={usageLimit.monthlyLimit ? `${formatCount(usageLimit.monthlyLimit, locale)}${copy.usageDialog.unit}` : copy.usage.unlimited} />
          <UsageValue id="usage-current-value" label={copy.usage.current} value={`${formatCount(usageLimit.requestCount, locale)}${copy.usageDialog.unit}`} />
          <UsageValue id="usage-remaining-value" label={copy.usage.remaining} value={usageLimit.remaining === null ? copy.usage.unlimited : `${formatCount(usageLimit.remaining, locale)}${copy.usageDialog.unit}`} />
        </dl>
        <p id="usage-reset-copy" className="border-t border-line px-5 py-3 text-sm text-fg-muted">{formatTemplate(copy.usage.resets, { date: formatDateTime(usageLimit.resetsAt, locale) })}</p>
      </section>

      <section id="public-api-reference" aria-labelledby="api-reference-heading" className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
        <div className="border-b border-line px-5 py-4"><h2 id="api-reference-heading" className="text-lg font-bold">{copy.api.title}</h2><p className="mt-1 text-sm leading-6 text-fg-muted">{copy.api.description}</p></div>
        <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="bg-surface-accent-subtle text-fg-muted"><tr><th className="px-5 py-3">{copy.api.permission}</th><th className="px-5 py-3">{copy.api.method}</th><th className="px-5 py-3">{copy.api.endpoint}</th><th className="px-5 py-3">{copy.api.operation}</th></tr></thead><tbody className="divide-y divide-line-subtle">{API_ROWS.map((row) => <tr key={row.permission}><td className="px-5 py-3"><PermissionBadge permission={row.permission} /></td><td className="px-5 py-3 font-semibold">{row.method}</td><td className="px-5 py-3"><code>{row.endpoint}</code></td><td className="px-5 py-3 text-fg-muted">{copy.api.descriptions[row.permission]}</td></tr>)}</tbody></table></div>
      </section>

      <section id="api-key-list-card" aria-labelledby="api-key-list-heading" className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
        <div className="border-b border-line px-5 py-4"><h2 id="api-key-list-heading" className="text-lg font-bold">{copy.keys.title}</h2></div>
        {apiKeys.length === 0 ? <div id="api-key-empty" className="px-5 py-12 text-center"><p className="font-semibold">{copy.keys.emptyTitle}</p><p className="mt-2 text-sm text-fg-muted">{copy.keys.emptyDescription}</p></div> : (
          <div id="api-key-table-wrap" className="max-w-full overflow-x-auto"><table className="w-full min-w-[64rem] text-left text-sm"><thead className="bg-surface-accent-subtle text-fg-muted"><tr>{[copy.keys.name, copy.keys.key, copy.keys.permissions, copy.keys.status, copy.keys.created, copy.keys.lastUsed, copy.keys.actions].map((label) => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line-subtle">{apiKeys.map((key, index) => <tr key={key.id}><td className="px-5 py-4 font-semibold">{key.name}</td><td className="px-5 py-4 font-mono text-xs">{key.keyPreview}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-1">{key.permissions.map((permission) => <PermissionBadge key={permission} permission={permission} />)}</div></td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${key.revokedAt ? "bg-surface-accent-subtle text-fg-muted" : "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200"}`}>{key.revokedAt ? copy.keys.revoked : copy.keys.active}</span></td><td className="px-5 py-4 whitespace-nowrap">{formatDateTime(key.createdAt, locale)}</td><td className="px-5 py-4 whitespace-nowrap">{key.lastUsedAt ? formatDateTime(key.lastUsedAt, locale) : copy.keys.never}</td><td className="px-5 py-4 text-center"><button id={index === 0 ? "open-revoke-dialog" : undefined} type="button" onClick={() => { setRevokeTarget(key); setError(null); setDialog("revoke"); }} disabled={!canEdit || Boolean(key.revokedAt)} className="cursor-pointer rounded-md border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50">{copy.keys.revoke}</button></td></tr>)}</tbody></table></div>
        )}
      </section>

      {dialog === "usage" ? <ModalDialog containerId="usage-limit-dialog" title={copy.usageDialog.title} description={copy.usageDialog.description} locked={isSubmitting} initialFocusRef={usageInputRef} onRequestClose={closeDialog}><form id="usage-limit-form" onSubmit={submitUsage} className="mt-6 space-y-5"><div id="usage-limit-options" className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input ref={usageModeRef} id="usage-mode-limited" name="usage-limit-mode" type="radio" value="LIMITED" checked={usageMode === "LIMITED"} onChange={() => setUsageMode("LIMITED")} className="mt-0.5 h-4 w-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /><span className="font-semibold">{copy.usageDialog.limited}</span></label><div id="usage-limit-input-wrap" className="ml-7 space-y-2"><div className="flex items-center gap-2"><input ref={usageInputRef} id="usage-limit-input" inputMode="numeric" autoComplete="off" value={usageValue} onChange={(event) => { setUsageValue(event.target.value); setUsageValidationError(false); }} disabled={usageMode === "UNLIMITED"} aria-describedby="usage-limit-help usage-limit-error" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50" /><span className="text-sm font-semibold">{copy.usageDialog.unit}</span></div><p id="usage-limit-help" className="text-sm leading-6 text-fg-muted">{copy.usageDialog.help}</p>{usageValidationError ? <p id="usage-limit-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{copy.usageDialog.invalid}</p> : null}</div><label className="flex cursor-pointer items-start gap-3"><input id="usage-mode-unlimited" name="usage-limit-mode" type="radio" value="UNLIMITED" checked={usageMode === "UNLIMITED"} onChange={() => setUsageMode("UNLIMITED")} className="mt-0.5 h-4 w-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /><span className="font-semibold">{copy.usageDialog.unlimited}</span></label></div><DialogError error={error} /><DialogActions cancel={copy.cancel} submit={isSubmitting ? copy.saving : copy.usageDialog.submit} submitId="save-usage-limit" isSubmitting={isSubmitting} onCancel={closeDialog} /></form></ModalDialog> : null}

      {dialog === "issue" ? <ModalDialog containerId="issue-dialog" title={copy.issueDialog.title} description={copy.issueDialog.description} locked={isSubmitting} initialFocusRef={issueNameRef} onRequestClose={closeDialog} maxWidthClassName="max-w-2xl"><form id="issue-form" onSubmit={submitIssue} className="mt-6 space-y-6"><label className="block space-y-2"><span className="block text-sm font-semibold">{copy.issueDialog.name}</span><input ref={issueNameRef} id="key-name" required maxLength={100} autoComplete="off" value={issueName} onChange={(event) => setIssueName(event.target.value)} placeholder={copy.issueDialog.namePlaceholder} className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none focus:border-accent" /></label><fieldset><legend className="text-sm font-semibold">{copy.issueDialog.permissions}</legend><div id="scope-options" className="mt-3 divide-y divide-line-subtle overflow-hidden rounded-lg border border-line">{API_ROWS.map((row) => <label key={row.permission} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-hover"><Checkbox id={`scope-${row.permission.toLowerCase()}`} name="permissions" value={row.permission} checked={issuePermissions.includes(row.permission)} onChange={(event) => { setPermissionError(false); setIssuePermissions((current) => event.target.checked ? [...current, row.permission] : current.filter((item) => item !== row.permission)); }} /><span><strong className="font-mono text-sm">{row.permission}</strong><span className="ml-2 text-sm">{copy.api.descriptions[row.permission]}</span><code className="mt-1 block text-xs text-fg-muted">{row.method} {row.endpoint}</code></span></label>)}</div></fieldset>{permissionError ? <p id="permission-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{copy.issueDialog.permissionError}</p> : null}<DialogError error={error} /><DialogActions cancel={copy.cancel} submit={isSubmitting ? copy.saving : copy.issueDialog.submit} isSubmitting={isSubmitting} onCancel={closeDialog} /></form></ModalDialog> : null}

      {dialog === "issued" && issuedRawKey ? <ModalDialog containerId="issued-dialog" descriptionId="issued-dialog-description" title={copy.issueDialog.successTitle} description={copy.issueDialog.successDescription} initialFocusRef={copyButtonRef} onRequestClose={closeDialog}><label className="mt-6 block space-y-2"><span className="block text-sm font-semibold">{copy.issueDialog.keyLabel}</span><div className="flex min-w-0 flex-wrap gap-2"><input ref={issuedKeyRef} id="issued-api-key" readOnly value={issuedRawKey} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg outline-none" /><button ref={copyButtonRef} id="copy-api-key" type="button" onClick={copyRawKey} className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover">{copy.issueDialog.copy}</button></div></label>{copied ? <p id="copy-feedback" role="status" aria-live="polite" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 dark:bg-green-950/50 dark:text-green-200">{copy.issueDialog.copied}</p> : null}<div className="mt-6 flex justify-end"><button id="close-issued" type="button" onClick={closeDialog} className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-900">{copy.issueDialog.close}</button></div></ModalDialog> : null}

      {dialog === "revoke" && revokeTarget ? <ModalDialog containerId="revoke-dialog" title={copy.revokeDialog.title} description={formatTemplate(copy.revokeDialog.description, { name: revokeTarget.name })} locked={isSubmitting} onRequestClose={closeDialog}><DialogError error={error} /><div className="mt-6 flex flex-wrap justify-end gap-3"><button id="cancel-revoke" type="button" onClick={closeDialog} disabled={isSubmitting} className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50">{copy.cancel}</button><button id="confirm-revoke" type="button" onClick={submitRevoke} disabled={isSubmitting} className="cursor-pointer rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{isSubmitting ? copy.saving : copy.revokeDialog.confirm}</button></div></ModalDialog> : null}
    </section></div>
  );
}

function UsageValue({ id, label, value }: { id: string; label: string; value: string }) {
  return <div className="bg-surface-raised px-5 py-4"><dt className="text-sm text-fg-muted">{label}</dt><dd id={id} className="mt-1 text-xl font-bold">{value}</dd></div>;
}

function PermissionBadge({ permission }: { permission: ReservationApiPermission }) {
  return <span className="inline-flex rounded-full bg-surface-accent-subtle px-2 py-1 font-mono text-xs font-semibold text-accent">{permission}</span>;
}

function DialogError({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null;
}

function DialogActions({ cancel, submit, submitId, isSubmitting, onCancel }: { cancel: string; submit: string; submitId?: string; isSubmitting: boolean; onCancel: () => void }) {
  return <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={onCancel} disabled={isSubmitting} className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50">{cancel}</button><button id={submitId} type="submit" disabled={isSubmitting} className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-900 disabled:opacity-50">{submit}</button></div>;
}

function formatCount(value: string, locale: string) {
  return new Intl.NumberFormat(localeTag(locale)).format(BigInt(value));
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

function localeTag(locale: string) {
  return { ja: "ja-JP", en: "en-US", "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", ko: "ko-KR" }[locale] ?? "ja-JP";
}

function formatTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), template);
}
