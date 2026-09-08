"use client";
import { useRef } from "react";
import {
  settingsTenantOptions,
  type AdminSettingsResource,
} from "@/lib/admin-settings-tenant";
import { isTenantKey, type TenantKey } from "@/lib/tenants";
import type { IndustrySettingsDictionary } from "@/app/i18n/dictionaries";
import { ModalDialog } from "./ModalDialog";
import { AdminFieldHelp } from "./AdminFieldHelp";
import { Select } from "../Select";
import { InvalidSettingsTenant } from "@/app/admin/InvalidSettingsTenant";
type Control = {
  tenantKey: TenantKey;
  isSubmitting: boolean;
  tenantName: string;
  copy: IndustrySettingsDictionary;
  pending: { tenant?: TenantKey; label: string } | null;
  select: (tenant: TenantKey) => void;
  cancel: () => void;
  discard: () => void;
};
export function AdminSettingsTenantSelect({
  control: c,
  resource,
}: {
  control: Control;
  resource: AdminSettingsResource;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div
        id="tenant-control"
        className="flex w-full min-w-0 items-center gap-3 md:ml-auto md:w-auto md:shrink-0"
      >
        <div className="flex shrink-0 items-center gap-1">
          <label htmlFor="tenant" className="block text-sm font-semibold">
            {c.copy.label}
          </label>
          <AdminFieldHelp
            id="tenant-help"
            label={c.copy.label}
            description={c.copy.help}
          />
        </div>
        <Select
          id="tenant"
          aria-describedby="tenant-help"
          disabled={c.isSubmitting}
          value={c.tenantKey}
          onChange={(e) => {
            if (isTenantKey(e.target.value)) c.select(e.target.value);
          }}
          containerClassName="min-w-0 flex-1 md:w-64 md:flex-none"
        >
          {settingsTenantOptions(resource).map((key) => (
            <option key={key} value={key}>
              {c.copy.names[key]}
            </option>
          ))}
        </Select>
      </div>
      {c.pending && (
        <ModalDialog
          title={c.copy.confirmTitle}
          description={(c.pending.tenant
            ? c.copy.confirmTenant
            : c.copy.confirmPage
          )
            .replace("{tenant}", c.tenantName)
            .replace("{destination}", c.pending.label)}
          onRequestClose={c.cancel}
          initialFocusRef={cancel}
        >
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              ref={cancel}
              onClick={c.cancel}
              className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2.5 font-semibold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {c.copy.continue}
            </button>
            <button
              onClick={c.discard}
              className="cursor-pointer rounded-md bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {c.copy.discard}
            </button>
          </div>
        </ModalDialog>
      )}
    </>
  );
}
export function AdminSettingsLoadState({
  control: c,
}: {
  control: {
    invalid?: boolean;
    loading: boolean;
    loadError: boolean;
    tenantName: string;
    copy: IndustrySettingsDictionary;
    retry: () => void;
  };
}) {
  return c.invalid ? (
    <InvalidSettingsTenant />
  ) : c.loading ? (
    <p role="status" aria-busy="true">
      {c.copy.loading.replace("{tenant}", c.tenantName)}
    </p>
  ) : c.loadError ? (
    <div role="alert" className="space-y-4">
      <p>{c.copy.loadError.replace("{tenant}", c.tenantName)}</p>
      <button
        onClick={c.retry}
        className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2.5 font-semibold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {c.copy.retry}
      </button>
    </div>
  ) : null;
}
