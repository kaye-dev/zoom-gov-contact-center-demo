"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getZaadErrorMessage } from "@/app/i18n/zaad-error-messages";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { Select } from "@/app/components/Select";
import { RefreshIcon } from "@/app/components/svg/RefreshIcon";
import type { DefaultGroupCandidatesResponse, DefaultGroupDto } from "@/lib/zaad/default-groups";
import { ZAAD_ERROR_CODES } from "@/lib/zaad/contracts";
import { loadDefaultGroupCandidates } from "@/lib/zaad/default-group-candidates";
import type { TenantKey } from "@/lib/tenants";
import { outreachMutation, outreachRequest, OutreachApiError } from "./outreach-client";
import { outreachPrimary as primary, outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";

type Props = { tenant: TenantKey; group: Pick<DefaultGroupDto, "id" | "contactListId"> & { rebindCount?: number }; name: string; close: () => void; saved: () => void; setDirty: (value: boolean) => void; setSaving?: (value: boolean) => void };
export function DefaultGroupBinding({ tenant, group, name, close, saved, setDirty, setSaving }: Props) {
  const { t } = useI18n(), d = t.outreachCommon.defaultGroups, common = t.admin.zaad.common;
  const [listId, setListId] = useState(group.contactListId ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false);
  const [selectionAccount, setSelectionAccount] = useState<string | null>(null);
  const [loadCode, setLoadCode] = useState<string | null>(null);
  const [explicitChoice, setExplicitChoice] = useState(false);
  const [snapshot, setSnapshot] = useState<DefaultGroupCandidatesResponse | null>(null), [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false), [reload, setReload] = useState(0);
  const lock = useRef(false), key = useRef<string | null>(null), cancel = useRef<HTMLButtonElement>(null);
  const bindingCancel = useRef<HTMLButtonElement>(null);
  const descriptionId = useId(), errorId = useId(), selectedId = useId();
  const changed = listId !== (group.contactListId ?? "");
  useEffect(() => {
    const controller = new AbortController();
    loadDefaultGroupCandidates(cursor => outreachRequest(tenant, `default-groups/${encodeURIComponent(group.id)}/candidates${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal: controller.signal, cache: "no-store" }), controller.signal)
      .then(result => { if (!controller.signal.aborted) { if (result.current?.selectable && result.current.id === group.contactListId) setSelectionAccount(previous => previous ?? result.accountId); setSnapshot(result); setLoadFailed(false); setLoading(false); } })
      .catch(failure => { if (!controller.signal.aborted) { setLoadCode(failure instanceof OutreachApiError ? failure.code : null); setLoadFailed(true); setLoading(false); } });
    return () => controller.abort();
  }, [tenant, group.id, group.contactListId, reload]);
  function refresh() { if (loading || busy) return; bindingCancel.current?.focus(); setLoading(true); setLoadFailed(false); setLoadCode(null); setError(""); key.current = null; setReload(value => value + 1); }
  function finish() { setDirty(false); close(); }
  function requestClose() { if (lock.current) return; if (changed) setDiscard(true); else finish(); }
  const candidates = [...(snapshot?.items ?? [])];
  const current = snapshot?.current;
  if (current?.selectable && !candidates.some(row => row.id === current.id)) candidates.unshift({ id: current.id, name: current.name, selectable: true, disabledReason: null });
  const selected = candidates.find(row => row.id === listId);
  const selectable = Boolean(selected?.selectable);
  const unavailableCurrent = Boolean(current?.unavailableReason);
  const canSave = Boolean((explicitChoice || !unavailableCurrent) && snapshot && selectionAccount === snapshot.accountId && selectable && !loading && !loadFailed && !busy);
  const reasons = { ASSIGNED_DEFAULT: d.assignedDefault, OTHER_INDUSTRY: d.otherIndustry, INTERNAL_RESOURCE: d.internalResource };
  const currentReasons = { MISSING: d.currentMissing, ACCOUNT_CHANGED: d.currentAccountChanged, CONFLICT: d.currentConflict };
  async function save() {
    if (lock.current || !canSave || !snapshot) return;
    lock.current = true; setBusy(true); setSaving?.(true); setError(""); key.current ??= crypto.randomUUID();
    try {
      await outreachMutation(tenant, `default-groups/${encodeURIComponent(group.id)}`, { operationKey: key.current, revision: snapshot.revision, accountId: snapshot.accountId, contactListId: listId }, "PUT");
      setDirty(false); saved();
    } catch (failure) {
      setError(failure instanceof OutreachApiError && ["RESOURCE_OWNERSHIP_CONFLICT", "ACCOUNT_CHANGED", "VERSION_CONFLICT"].includes(failure.code) ? t.outreachCommon.bindingConflict : common.failure);
      setLoadFailed(true);
    } finally { lock.current = false; setBusy(false); setSaving?.(false); }
  }
  const candidateFailure = loadCode === ZAAD_ERROR_CODES.zoomUnavailable || loadCode === ZAAD_ERROR_CODES.zoomInvalidResponse
    ? d.candidateTransientFailure
    : [loadCode && getZaadErrorMessage(loadCode, t.admin.zaad), d.candidateFailure].filter(Boolean).join("\n");
  const candidateLabel = (row: { id: string; name: string }) => row.name ? `${row.name} — ${row.id}` : row.id;
  return <><ModalDialog title={d.configureTitle} description={name} descriptionId={descriptionId} initialFocusRef={bindingCancel} backdropClassName="bg-black/40" locked={busy || discard} onRequestClose={requestClose}>
    <form className="mt-5 space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="min-h-44" aria-busy={loading}>
      {loading ? <div role="status" className="flex min-h-44 flex-col items-center justify-center gap-3 text-sm text-fg-muted"><span aria-hidden="true" className="h-6 w-6 motion-safe:animate-spin rounded-full border-2 border-line border-t-accent" />{d.candidateLoading}</div> : <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Select required containerClassName="min-w-0 flex-1" aria-labelledby={descriptionId} aria-describedby={`${selectedId} ${errorId}`} aria-invalid={Boolean(error || loadFailed)} value={!explicitChoice && unavailableCurrent ? "__unavailable_current__" : listId} disabled={loading || busy} onChange={event => { setSelectionAccount(snapshot?.accountId ?? null); setExplicitChoice(true); setListId(event.target.value); setDirty(event.target.value !== (group.contactListId ?? "")); key.current = null; }}>
          <option value="">{snapshot && !candidates.some(row => row.selectable) ? d.candidateEmpty : d.candidateSelect}</option>
          {!explicitChoice && unavailableCurrent && current && <option value="__unavailable_current__" disabled>{candidateLabel(current)}</option>}
          {listId && !selected && !unavailableCurrent && <option value={listId} disabled>{current?.id === listId ? candidateLabel(current) : listId}</option>}
          {candidates.map(row => <option key={row.id} value={row.id} disabled={!row.selectable}>{candidateLabel(row)}{row.disabledReason ? ` (${reasons[row.disabledReason]})` : ""}</option>)}
        </Select>
        <button type="button" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50" aria-label={d.candidateRefresh} title={d.candidateRefresh} disabled={loading || busy} onClick={refresh}><RefreshIcon /></button>
      </div>
      <div id={selectedId} className="space-y-2 text-sm text-fg-muted">
        {listId && <p className="break-all">{d.listId}：{listId}</p>}
        {current?.unavailableReason && <p>{current.id !== listId && <span className="break-all">{d.listId}：{current.id} — </span>}{currentReasons[current.unavailableReason]}</p>}
        {group.contactListId && changed && <p>{d.rebindHelp}{group.rebindCount !== undefined && <> {d.rebindCount.replace("{count}", String(group.rebindCount))}</>}</p>}
      </div>
      <div id={errorId} className="whitespace-pre-line text-sm text-red-700 dark:text-red-300">{error ? <p role="alert">{error}</p> : loadFailed && <p role="alert">{candidateFailure}</p>}</div>
      </div>}
      </div>
      <div className="flex justify-end gap-3"><button ref={bindingCancel} className={secondary} type="button" disabled={busy} onClick={requestClose}>{common.cancel}</button>{!loading && <button className={primary} disabled={!canSave}>{busy ? common.loading : common.save}</button>}</div>
    </form>
  </ModalDialog>{discard && <ModalDialog title={t.outreachCommon.confirmDiscard} description={name} initialFocusRef={cancel} onRequestClose={() => setDiscard(false)}><div className="mt-5 flex justify-end gap-3"><button ref={cancel} className={secondary} onClick={() => setDiscard(false)}>{common.cancel}</button><button className={primary} onClick={finish}>{t.outreachCommon.discard}</button></div></ModalDialog>}</>;
}
