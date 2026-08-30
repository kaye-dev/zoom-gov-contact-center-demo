"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { Checkbox } from "@/app/components/Checkbox";
import { ChevronLeftIcon } from "@/app/components/svg/ChevronLeftIcon";
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
  const [dialog, setDialog] = useState<"issue" | "issued" | "usage" | "keyUsage" | "revoke" | null>(null);
  const [issuedRawKey, setIssuedRawKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ReservationApiKeyMetadata | null>(null);
  const [keyUsageTarget, setKeyUsageTarget] = useState<ReservationApiKeyMetadata | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [issueName, setIssueName] = useState("");
  const [issuePermissions, setIssuePermissions] = useState<ReservationApiPermission[]>([...RESERVATION_API_PERMISSIONS]);
  const [permissionError, setPermissionError] = useState(false);
  const [issueLimitMode, setIssueLimitMode] = useState<"LIMITED" | "UNLIMITED">("LIMITED");
  const [issueLimitValue, setIssueLimitValue] = useState("10000");
  const [issueLimitError, setIssueLimitError] = useState(false);
  const [usageMode, setUsageMode] = useState<"LIMITED" | "UNLIMITED">(usageLimit.mode);
  const [usageValue, setUsageValue] = useState(usageLimit.monthlyLimit ?? "10000");
  const [usageValidationError, setUsageValidationError] = useState(false);
  const [keyUsageMode, setKeyUsageMode] = useState<"LIMITED" | "UNLIMITED">("LIMITED");
  const [keyUsageValue, setKeyUsageValue] = useState("10000");
  const [keyUsageValidationError, setKeyUsageValidationError] = useState(false);
  const issueNameRef = useRef<HTMLInputElement>(null);
  const usageModeRef = useRef<HTMLInputElement>(null);
  const usageInputRef = useRef<HTMLInputElement>(null);
  const issueLimitInputRef = useRef<HTMLInputElement>(null);
  const keyUsageInputRef = useRef<HTMLInputElement>(null);
  const issuedKeyRef = useRef<HTMLInputElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  const closeDialog = () => {
    if (isSubmitting) return;
    setDialog(null);
    setError(null);
    setCopied(false);
    setPermissionError(false);
    setIssueLimitError(false);
    setUsageValidationError(false);
    setKeyUsageValidationError(false);
    if (dialog === "issued") setIssuedRawKey(null);
  };

  const openIssue = () => {
    setIssueName("");
    setIssuePermissions([...RESERVATION_API_PERMISSIONS]);
    setIssueLimitMode("LIMITED");
    setIssueLimitValue("10000");
    setIssueLimitError(false);
    setError(null);
    setDialog("issue");
  };

  const submitIssue = async (event: FormEvent) => {
    event.preventDefault();
    const permissionsValid = issuePermissions.length > 0;
    const limitValid = isMonthlyLimitValid(issueLimitMode, issueLimitValue);
    setPermissionError(!permissionsValid);
    setIssueLimitError(!limitValid);
    if (!permissionsValid || !limitValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/reservation-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: issueName,
          permissions: issuePermissions,
          usageLimit: issueLimitMode === "UNLIMITED"
            ? { mode: "UNLIMITED" }
            : { mode: "LIMITED", monthlyLimit: issueLimitValue },
        }),
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

  const openKeyUsage = (key: ReservationApiKeyMetadata) => {
    setKeyUsageTarget(key);
    setKeyUsageMode(key.usage.mode);
    setKeyUsageValue(key.usage.monthlyLimit ?? "10000");
    setKeyUsageValidationError(false);
    setError(null);
    setDialog("keyUsage");
  };

  const submitKeyUsage = async (event: FormEvent) => {
    event.preventDefault();
    if (!keyUsageTarget) return;
    if (!isMonthlyLimitValid(keyUsageMode, keyUsageValue)) {
      setKeyUsageValidationError(true);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/reservation-api-keys/${encodeURIComponent(keyUsageTarget.id)}/usage-limit`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(keyUsageMode === "UNLIMITED"
            ? { mode: "UNLIMITED", expectedRevision: keyUsageTarget.revision }
            : {
              mode: "LIMITED",
              monthlyLimit: keyUsageValue,
              expectedRevision: keyUsageTarget.revision,
            }),
        },
      );
      const body = await response.json() as { apiKey?: ReservationApiKeyMetadata };
      if (!response.ok || !body.apiKey) {
        throw new Error(response.status === 409 ? "conflict" : "generic");
      }
      setApiKeys((current) => current.map((key) => key.id === body.apiKey!.id
        ? body.apiKey!
        : key));
      setDialog(null);
      setKeyUsageTarget(null);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "conflict"
        ? copy.conflictError
        : copy.genericError);
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
    <div><section id="reservation-api-key-content" className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-2">
          <Link id="back-to-reservations" href="/admin/reservations" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"><ChevronLeftIcon className="h-5 w-5" />{copy.back}</Link>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-sm leading-6 text-fg-muted">{copy.description}</p>
        </div>
        <button id="open-issue-dialog" type="button" onClick={openIssue} disabled={!canEdit} className="cursor-pointer rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">{copy.issue}</button>
      </div>

      <p id="read-only-notice" role="status" hidden={canEdit} className="rounded-md border border-line bg-surface-accent-subtle px-4 py-3 text-sm font-semibold text-accent">{copy.readOnly}</p>

      <section id="usage-limit-card" aria-labelledby="usage-limit-heading" className="rounded-lg border border-line bg-surface-raised shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div><h2 id="usage-limit-heading" className="text-lg font-bold">{copy.usage.title}</h2><p className="mt-1 text-sm leading-6 text-fg-muted">{copy.usage.description}</p></div>
          <button id="open-usage-limit-dialog" type="button" onClick={openUsage} disabled={!canEdit} className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">{copy.usage.change}</button>
        </div>
        <dl className="grid gap-px border-t border-line bg-line-subtle sm:grid-cols-3">
          <UsageValue id="usage-limit-value" label={copy.usage.limit} value={usageLimit.monthlyLimit ? `${formatCount(usageLimit.monthlyLimit, locale)}${copy.usageDialog.unit}` : copy.usage.unlimited} />
          <UsageValue id="usage-current-value" label={copy.usage.current} value={`${formatCount(usageLimit.requestCount, locale)}${copy.usageDialog.unit}`} />
          <UsageValue id="usage-remaining-value" label={copy.usage.remaining} value={usageLimit.remaining === null ? copy.usage.unlimited : `${formatCount(usageLimit.remaining, locale)}${copy.usageDialog.unit}`} />
        </dl>
        <p id="usage-reset-copy" className="border-t border-line px-5 py-3 text-sm text-fg-muted">{formatTemplate(copy.usage.resets, { date: formatResetDateTime(usageLimit.resetsAt, locale) })}</p>
      </section>

      <section id="public-api-reference" aria-labelledby="api-reference-heading" className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
        <div className="border-b border-line px-5 py-4"><h2 id="api-reference-heading" className="text-lg font-bold">{copy.api.title}</h2><p className="mt-1 text-sm leading-6 text-fg-muted">{copy.api.description}</p></div>
        <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[760px] divide-y divide-line-subtle text-sm"><thead className="bg-surface"><tr><th className="px-5 py-3 text-left font-semibold">{copy.api.permission}</th><th className="px-5 py-3 text-left font-semibold">{copy.api.method}</th><th className="px-5 py-3 text-left font-semibold">{copy.api.endpoint}</th><th className="px-5 py-3 text-left font-semibold">{copy.api.operation}</th></tr></thead><tbody className="divide-y divide-line-subtle">{API_ROWS.map((row) => <tr key={row.permission}><td className="px-5 py-3 font-mono text-xs font-semibold">{row.permission}</td><td className={`px-5 py-3 font-mono font-semibold ${apiMethodClassName(row.method)}`}>{row.method}</td><td className="px-5 py-3 font-mono text-xs">{row.endpoint}</td><td className="px-5 py-3">{copy.api.descriptions[row.permission]}</td></tr>)}</tbody></table></div>
      </section>

      <section id="api-key-list-card" aria-labelledby="api-key-list-heading" className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
        <div className="border-b border-line px-5 py-4"><h2 id="api-key-list-heading" className="text-lg font-bold">{copy.keys.title}</h2><p className="mt-1 text-sm text-fg-muted">{copy.keys.description}</p></div>
        {apiKeys.length === 0 ? <div id="api-key-empty" className="px-5 py-12 text-center"><p className="font-semibold">{copy.keys.emptyTitle}</p><p className="mt-2 text-sm text-fg-muted">{copy.keys.emptyDescription}</p></div> : (
          <div id="api-key-table-wrap" className="max-w-full overflow-x-auto"><table className="w-full min-w-[1280px] divide-y divide-line-subtle text-sm"><thead className="bg-surface"><tr>{[copy.keys.nameKey, copy.keys.permissions, copy.keys.monthlyLimit, copy.keys.monthlyUsage, copy.keys.created, copy.keys.lastUsed, copy.keys.status, copy.keys.actions].map((label) => <th key={label} className="px-5 py-3 text-left font-semibold last:text-center">{label}</th>)}</tr></thead><tbody className="divide-y divide-line-subtle">{apiKeys.map((key, index) => <tr key={key.id} data-key-row={key.revokedAt ? "revoked" : "active"}><td className="px-5 py-4 align-top"><p className="font-semibold">{key.name}</p><code className="mt-1 block text-xs text-fg-muted">{key.keyPreview}</code></td><td className="px-5 py-4 align-top"><div className="flex max-w-md flex-wrap gap-1.5">{key.permissions.map((permission) => <PermissionBadge key={permission} permission={permission} />)}</div></td><td id={index === 0 ? "active-key-limit" : undefined} className="px-5 py-4 align-top whitespace-nowrap"><span className="font-semibold">{key.usage.monthlyLimit === null ? copy.keys.unlimited : `${formatCount(key.usage.monthlyLimit, locale)}${copy.usageDialog.unit}`}</span></td><td id={index === 0 ? "active-key-usage" : undefined} className="px-5 py-4 align-top whitespace-nowrap"><span className="font-semibold">{formatCount(key.usage.requestCount, locale)}{copy.usageDialog.unit}</span><span className="mt-1 block text-xs text-fg-muted">{copy.keys.remaining} {key.usage.remaining === null ? copy.keys.unlimited : `${formatCount(key.usage.remaining, locale)}${copy.usageDialog.unit}`}</span></td><td className="px-5 py-4 align-top whitespace-nowrap">{formatDateTime(key.createdAt, locale)}</td><td className="px-5 py-4 align-top whitespace-nowrap">{key.lastUsedAt ? formatDateTime(key.lastUsedAt, locale) : copy.keys.never}</td><td className="px-5 py-4 text-center align-top"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${key.revokedAt ? "bg-surface-accent-subtle text-fg-muted" : "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200"}`}>{key.revokedAt ? copy.keys.revoked : copy.keys.active}</span></td><td className="px-5 py-4 text-center align-top">{key.revokedAt ? "—" : <div className="flex justify-center gap-2"><button id={index === 0 ? "open-key-usage-limit-dialog" : undefined} type="button" onClick={() => openKeyUsage(key)} disabled={!canEdit} className="cursor-pointer whitespace-nowrap rounded-md border border-line bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">{copy.keys.changeLimit}</button><button id={index === 0 ? "open-revoke-dialog" : undefined} type="button" onClick={() => { setRevokeTarget(key); setError(null); setDialog("revoke"); }} disabled={!canEdit} className="cursor-pointer rounded-md border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50">{copy.keys.revoke}</button></div>}</td></tr>)}</tbody></table></div>
        )}
      </section>

      {dialog === "usage" ? <ModalDialog containerId="usage-limit-dialog" title={copy.usageDialog.title} description={copy.usageDialog.description} locked={isSubmitting} initialFocusRef={usageInputRef} onRequestClose={closeDialog}><form id="usage-limit-form" onSubmit={submitUsage} className="mt-6 space-y-5"><div id="usage-limit-options" className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input ref={usageModeRef} id="usage-mode-limited" name="usage-limit-mode" type="radio" value="LIMITED" checked={usageMode === "LIMITED"} onChange={() => setUsageMode("LIMITED")} className="mt-0.5 h-4 w-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /><span className="font-semibold">{copy.usageDialog.limited}</span></label><div id="usage-limit-input-wrap" className="ml-7 space-y-2"><div className="flex items-center gap-2"><input ref={usageInputRef} id="usage-limit-input" inputMode="numeric" autoComplete="off" value={usageValue} onChange={(event) => { setUsageValue(event.target.value); setUsageValidationError(false); }} disabled={usageMode === "UNLIMITED"} aria-describedby="usage-limit-help usage-limit-error" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50" /><span className="text-sm font-semibold">{copy.usageDialog.unit}</span></div><p id="usage-limit-help" className="text-sm leading-6 text-fg-muted">{copy.usageDialog.help}</p>{usageValidationError ? <p id="usage-limit-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{copy.usageDialog.invalid}</p> : null}</div><label className="flex cursor-pointer items-start gap-3"><input id="usage-mode-unlimited" name="usage-limit-mode" type="radio" value="UNLIMITED" checked={usageMode === "UNLIMITED"} onChange={() => setUsageMode("UNLIMITED")} className="mt-0.5 h-4 w-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /><span className="font-semibold">{copy.usageDialog.unlimited}</span></label></div><DialogError error={error} /><DialogActions cancel={copy.cancel} submit={isSubmitting ? copy.saving : copy.usageDialog.submit} submitId="save-usage-limit" isSubmitting={isSubmitting} onCancel={closeDialog} /></form></ModalDialog> : null}

      {dialog === "keyUsage" && keyUsageTarget ? <ModalDialog containerId="key-usage-limit-dialog" title={copy.keyUsageDialog.title} description={formatTemplate(copy.keyUsageDialog.description, { name: keyUsageTarget.name })} locked={isSubmitting} initialFocusRef={keyUsageInputRef} onRequestClose={closeDialog}><form id="key-usage-limit-form" onSubmit={submitKeyUsage} className="mt-6 space-y-5"><fieldset><legend className="text-sm font-semibold">{copy.keyUsageDialog.legend}</legend><div id="key-usage-limit-options" className="mt-3 space-y-3"><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4 hover:bg-surface-hover"><input id="key-usage-mode-limited" name="key-usage-limit-mode" type="radio" value="LIMITED" checked={keyUsageMode === "LIMITED"} onChange={() => setKeyUsageMode("LIMITED")} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /><span><strong className="block text-sm">{copy.usageDialog.limited}</strong><span className="mt-1 block text-sm text-fg-muted">{copy.keyUsageDialog.limitedDescription}</span></span></label><div id="key-usage-limit-input-wrap" className="ml-7 space-y-2"><div className="flex items-center gap-2"><input ref={keyUsageInputRef} id="key-usage-limit-input" inputMode="numeric" autoComplete="off" value={keyUsageValue} onChange={(event) => { setKeyUsageValue(event.target.value); setKeyUsageValidationError(false); }} disabled={keyUsageMode === "UNLIMITED"} aria-describedby="key-usage-limit-help key-usage-limit-error" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50" /><span className="text-sm font-semibold">{copy.usageDialog.unit}</span></div><p id="key-usage-limit-help" className="text-sm leading-6 text-fg-muted">{copy.usageDialog.help}</p>{keyUsageValidationError ? <p id="key-usage-limit-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{copy.usageDialog.invalid}</p> : null}</div><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4 hover:bg-surface-hover"><input id="key-usage-mode-unlimited" name="key-usage-limit-mode" type="radio" value="UNLIMITED" checked={keyUsageMode === "UNLIMITED"} onChange={() => setKeyUsageMode("UNLIMITED")} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /><span><strong className="block text-sm">{copy.keyUsageDialog.unlimited}</strong><span className="mt-1 block text-sm text-fg-muted">{copy.keyUsageDialog.unlimitedDescription}</span></span></label></div></fieldset><DialogError error={error} /><DialogActions cancel={copy.cancel} submit={isSubmitting ? copy.saving : copy.keyUsageDialog.submit} submitId="save-key-usage-limit" isSubmitting={isSubmitting} onCancel={closeDialog} /></form></ModalDialog> : null}

      {dialog === "issue" ? <ModalDialog containerId="issue-dialog" title={copy.issueDialog.title} description={copy.issueDialog.description} locked={isSubmitting} initialFocusRef={issueNameRef} onRequestClose={closeDialog} maxWidthClassName="max-w-2xl"><form id="issue-form" onSubmit={submitIssue} className="mt-6 space-y-6"><label className="block space-y-2"><span className="block text-sm font-semibold">{copy.issueDialog.name}</span><input ref={issueNameRef} id="key-name" required maxLength={100} autoComplete="off" value={issueName} onChange={(event) => setIssueName(event.target.value)} placeholder={copy.issueDialog.namePlaceholder} className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none focus:border-accent" /></label><fieldset><legend className="text-sm font-semibold">{copy.issueDialog.permissions}</legend><p className="mt-1 text-sm text-fg-muted">{copy.issueDialog.permissionsDescription}</p><div id="scope-options" className="mt-3 divide-y divide-line-subtle overflow-hidden rounded-lg border border-line">{API_ROWS.map((row) => <label key={row.permission} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-hover"><span className="-ml-1 -mr-1 -mt-0.5 flex h-6 w-6 shrink-0"><Checkbox id={`scope-${row.permission.toLowerCase()}`} name="permissions" value={row.permission} checked={issuePermissions.includes(row.permission)} onChange={(event) => { setPermissionError(false); setIssuePermissions((current) => event.target.checked ? [...current, row.permission] : current.filter((item) => item !== row.permission)); }} /></span><span><strong className="font-mono text-sm">{row.permission}</strong><span className="ml-2 text-sm">{copy.api.descriptions[row.permission]}</span><code className="mt-1 block text-xs text-fg-muted">{row.method} {row.endpoint}</code></span></label>)}</div></fieldset><fieldset><legend className="text-sm font-semibold">{copy.issueDialog.limitTitle}</legend><p className="mt-1 text-sm text-fg-muted">{copy.issueDialog.limitDescription}</p><div id="issue-key-limit-options" className="mt-3 space-y-3"><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4 hover:bg-surface-hover"><input id="issue-key-mode-limited" name="issue-key-limit-mode" type="radio" value="LIMITED" checked={issueLimitMode === "LIMITED"} onChange={() => setIssueLimitMode("LIMITED")} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /><span className="min-w-0 flex-1"><strong className="block text-sm">{copy.usageDialog.limited}</strong><span className="mt-1 block text-sm text-fg-muted">{copy.issueDialog.limitLimitedDescription}</span></span></label><div className="ml-7 space-y-2"><label htmlFor="issue-key-limit-input" className="block text-sm font-semibold">{copy.issueDialog.limitInputLabel}</label><div className="flex items-center gap-2"><input ref={issueLimitInputRef} id="issue-key-limit-input" inputMode="numeric" autoComplete="off" value={issueLimitValue} onChange={(event) => { setIssueLimitValue(event.target.value); setIssueLimitError(false); }} disabled={issueLimitMode === "UNLIMITED"} aria-describedby="issue-key-limit-help issue-key-limit-error" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50" /><span className="text-sm font-semibold">{copy.usageDialog.unit}</span></div><p id="issue-key-limit-help" className="text-sm leading-6 text-fg-muted">{copy.usageDialog.help}</p>{issueLimitError ? <p id="issue-key-limit-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{copy.usageDialog.invalid}</p> : null}</div><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4 hover:bg-surface-hover"><input id="issue-key-mode-unlimited" name="issue-key-limit-mode" type="radio" value="UNLIMITED" checked={issueLimitMode === "UNLIMITED"} onChange={() => setIssueLimitMode("UNLIMITED")} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /><span><strong className="block text-sm">{copy.keyUsageDialog.unlimited}</strong><span className="mt-1 block text-sm text-fg-muted">{copy.keyUsageDialog.issueUnlimitedDescription}</span></span></label></div></fieldset>{permissionError ? <p id="permission-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{copy.issueDialog.permissionError}</p> : null}<DialogError error={error} /><DialogActions cancel={copy.cancel} submit={isSubmitting ? copy.saving : copy.issueDialog.submit} isSubmitting={isSubmitting} onCancel={closeDialog} /></form></ModalDialog> : null}

      {dialog === "issued" && issuedRawKey ? <ModalDialog containerId="issued-dialog" descriptionId="issued-dialog-description" title={copy.issueDialog.successTitle} description={copy.issueDialog.successDescription} initialFocusRef={copyButtonRef} onRequestClose={closeDialog}><label className="mt-6 block space-y-2"><span className="block text-sm font-semibold">{copy.issueDialog.keyLabel}</span><div className="flex min-w-0 flex-wrap gap-2"><input ref={issuedKeyRef} id="issued-api-key" readOnly value={issuedRawKey} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg outline-none" /><button ref={copyButtonRef} id="copy-api-key" type="button" onClick={copyRawKey} className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover">{copy.issueDialog.copy}</button></div></label>{copied ? <p id="copy-feedback" role="status" aria-live="polite" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 dark:bg-green-950/50 dark:text-green-200">{copy.issueDialog.copied}</p> : null}<div className="mt-6 flex justify-end"><button id="close-issued" type="button" onClick={closeDialog} className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-900">{copy.issueDialog.close}</button></div></ModalDialog> : null}

      {dialog === "revoke" && revokeTarget ? <ModalDialog containerId="revoke-dialog" title={copy.revokeDialog.title} description={formatTemplate(copy.revokeDialog.description, { name: revokeTarget.name })} locked={isSubmitting} onRequestClose={closeDialog}><DialogError error={error} /><div className="mt-6 flex flex-wrap justify-end gap-3"><button id="cancel-revoke" type="button" onClick={closeDialog} disabled={isSubmitting} className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50">{copy.cancel}</button><button id="confirm-revoke" type="button" onClick={submitRevoke} disabled={isSubmitting} className="cursor-pointer rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{isSubmitting ? copy.saving : copy.revokeDialog.confirm}</button></div></ModalDialog> : null}
    </section></div>
  );
}

function UsageValue({ id, label, value }: { id: string; label: string; value: string }) {
  return <div className="bg-surface-raised px-5 py-4"><dt className="text-sm text-fg-muted">{label}</dt><dd id={id} className="mt-1 text-xl font-bold">{value}</dd></div>;
}

function PermissionBadge({ permission }: { permission: ReservationApiPermission }) {
  return <span className="rounded-full bg-surface-accent-subtle px-2 py-1 text-xs font-semibold text-accent">{permission}</span>;
}

function apiMethodClassName(method: string) {
  if (method === "GET") return "text-green-700 dark:text-green-300";
  if (method === "POST") return "text-blue-700 dark:text-blue-300";
  if (method === "PATCH") return "text-amber-700 dark:text-amber-300";
  return "text-red-700 dark:text-red-300";
}

function DialogError({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null;
}

function DialogActions({ cancel, submit, submitId, isSubmitting, onCancel }: { cancel: string; submit: string; submitId?: string; isSubmitting: boolean; onCancel: () => void }) {
  return <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={onCancel} disabled={isSubmitting} className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50">{cancel}</button><button id={submitId} type="submit" disabled={isSubmitting} className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-900 disabled:opacity-50">{submit}</button></div>;
}

function isMonthlyLimitValid(mode: "LIMITED" | "UNLIMITED", value: string) {
  if (mode === "UNLIMITED") return true;
  try {
    return /^(0|[1-9]\d*)$/u.test(value) && isValidMonthlyLimit(BigInt(value));
  } catch {
    return false;
  }
}

function formatCount(value: string, locale: string) {
  return new Intl.NumberFormat(localeTag(locale)).format(BigInt(value));
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

function formatResetDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function localeTag(locale: string) {
  return { ja: "ja-JP", en: "en-US", "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", ko: "ko-KR" }[locale] ?? "ja-JP";
}

function formatTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), template);
}
