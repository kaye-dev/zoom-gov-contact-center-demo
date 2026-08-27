"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { ModalDialog } from "@/app/components/admin/ModalDialog";
import {
  getAdminRoleDisplayDescription,
  getAdminRoleDisplayName,
} from "@/app/components/admin/role-display";
import { DeleteIcon } from "@/app/components/svg/DeleteIcon";
import { EditSquareIcon } from "@/app/components/svg/EditSquareIcon";
import { useI18n } from "@/app/i18n/LanguageProvider";

import { ConfirmationDialog } from "../users/ConfirmationDialog";

type RoleSummary = {
  id: string;
  name: string;
  description: string | null;
  systemKey: "FULL_ACCESS" | "NO_ACCESS" | null;
  revision: number;
  memberCount: number;
};

export function RolesView({
  roles,
  total,
  page,
  totalPages,
  pageSize,
  search,
  canCreate,
  canUpdate,
  canDelete,
  canViewMembers,
}: {
  roles: RoleSummary[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  search: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canViewMembers: boolean;
}) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const removeRole = async () => {
    if (!roleToDelete || roleToDelete.systemKey) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(
        `/api/admin/roles/${encodeURIComponent(roleToDelete.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: roleToDelete.revision }),
        },
      );
      if (!response.ok) {
        setDeleteError(
          response.status === 409 ? copy.conflictError : copy.genericError,
        );
        return;
      }
      setRoleToDelete(null);
      if (roles.length === 1 && page > 1) {
        router.push(buildRoleListHref(search, page - 1, pageSize));
      }
      router.refresh();
    } catch {
      setDeleteError(copy.genericError);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            {total} {copy.roleCount}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-fg-muted">
            {copy.listDescription}
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="cursor-pointer rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-primary-900 sm:ml-auto"
          >
            + {copy.addRole}
          </button>
        ) : null}
      </div>

      <form method="get" action="/admin/roles" className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1 sm:max-w-md">
          <span className="sr-only">{t.admin.search}</span>
          <input
            name="query"
            defaultValue={search}
            maxLength={100}
            placeholder={copy.listSearchPlaceholder}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <input type="hidden" name="pageSize" value={pageSize} />
        <button
          type="submit"
          className="cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-900"
        >
          {t.admin.search}
        </button>
        {search ? (
          <Link
            href={buildRoleListHref("", 1, pageSize)}
            className="rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover"
          >
            {t.admin.clear}
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto border-y border-line bg-surface-raised">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-sm text-fg-muted">
              <th scope="col" className="px-4 py-3 font-semibold">{copy.roleName}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{copy.roleDescription}</th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">{copy.memberCount}</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">{copy.actions}</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const displayName = getAdminRoleDisplayName(role, copy);
              const displayDescription = getAdminRoleDisplayDescription(role, copy);
              const deleteDisabledReason = !canDelete
                ? copy.readOnlyRoleAction
                : role.memberCount > 0
                  ? copy.roleInUse
                  : null;
              return (
                <tr key={role.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/roles/${encodeURIComponent(role.id)}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        {displayName}
                      </Link>
                      {role.systemKey ? (
                        <span className="rounded-full bg-surface-accent-subtle px-2 py-0.5 text-xs font-semibold text-accent">
                          {copy.systemRole}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-xl px-4 py-4 text-sm leading-6 text-fg-muted">
                    {displayDescription ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-center font-semibold text-accent">
                    {canViewMembers ? (
                      <Link
                        href={`/admin/roles/${encodeURIComponent(role.id)}#members`}
                        className="hover:underline"
                        aria-label={`${displayName}: ${copy.memberCount} ${role.memberCount}`}
                      >
                        {role.memberCount}
                      </Link>
                    ) : (
                      role.memberCount
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {role.systemKey ? (
                      <span aria-label={copy.readOnlyRoleAction}>—</span>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        {canUpdate ? (
                          <Link
                            href={`/admin/roles/${encodeURIComponent(role.id)}`}
                            aria-label={`${copy.edit}: ${displayName}`}
                            className="inline-flex rounded-md p-2 text-fg-muted transition-colors hover:bg-surface-hover hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            <EditSquareIcon className="h-5 w-5" />
                          </Link>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="inline-flex cursor-not-allowed rounded-md p-2 text-fg-muted opacity-45"
                          >
                            <EditSquareIcon className="h-5 w-5" />
                            <span className="sr-only">
                              {copy.edit}: {displayName}. {copy.readOnlyRoleAction}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setRoleToDelete(role);
                          }}
                          disabled={deleteDisabledReason !== null || isDeleting}
                          title={deleteDisabledReason ?? undefined}
                          className="inline-flex cursor-pointer rounded-md p-2 text-fg-muted transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                        >
                          <DeleteIcon className="h-5 w-5" />
                          <span className="sr-only">
                            {copy.deleteRole}: {displayName}
                            {deleteDisabledReason ? `. ${deleteDisabledReason}` : ""}
                          </span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {roles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-fg-muted">
                  {copy.noRoles}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <nav aria-label={t.admin.page} className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link
              href={buildRoleListHref(search, page - 1, pageSize)}
              className="rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover"
            >
              {t.admin.previous}
            </Link>
          ) : (
            <span className="rounded-md border border-line px-4 py-2 font-semibold text-fg-muted opacity-50">
              {t.admin.previous}
            </span>
          )}
          <span className="text-sm text-fg-muted">
            {t.admin.page} {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildRoleListHref(search, page + 1, pageSize)}
              className="rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover"
            >
              {t.admin.next}
            </Link>
          ) : (
            <span className="rounded-md border border-line px-4 py-2 font-semibold text-fg-muted opacity-50">
              {t.admin.next}
            </span>
          )}
        </nav>
      ) : null}

      {isCreateOpen ? (
        <CreateRoleDialog onClose={() => setIsCreateOpen(false)} />
      ) : null}

      {roleToDelete ? (
        <ConfirmationDialog
          title={copy.deleteRoleTitle}
          description={copy.deleteRoleDescription}
          confirmLabel={copy.deleteRole}
          cancelLabel={copy.cancel}
          isSubmitting={isDeleting}
          error={deleteError}
          danger
          onClose={() => {
            if (isDeleting) return;
            setRoleToDelete(null);
            setDeleteError(null);
          }}
          onConfirm={() => void removeRole()}
        />
      ) : null}
    </section>
  );
}

function buildRoleListHref(query: string, page: number, pageSize: number) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (page > 1) params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `/admin/roles?${params.toString()}`;
}

function CreateRoleDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const body = (await response.json().catch(() => null)) as
        | { role?: { id: string }; error?: string }
        | null;
      if (!response.ok || !body?.role?.id) {
        setError(
          body?.error === "ROLE_NAME_CONFLICT"
            ? copy.duplicateError
            : copy.genericError,
        );
        return;
      }
      router.push(`/admin/roles/${encodeURIComponent(body.role.id)}`);
      router.refresh();
    } catch {
      setError(copy.genericError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalDialog
      title={copy.createTitle}
      description={copy.createDescription}
      locked={isSaving}
      initialFocusRef={nameRef}
      onRequestClose={onClose}
    >
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-2">
          <label htmlFor="create-role-name" className="block text-sm font-semibold">
            {copy.roleName} <span aria-hidden="true" className="text-red-700">*</span>
          </label>
          <input
            ref={nameRef}
            id="create-role-name"
            required
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSaving}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="create-role-description" className="block text-sm font-semibold">
            {copy.descriptionOptional}
          </label>
          <textarea
            id="create-role-description"
            rows={3}
            maxLength={100}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSaving}
            className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={isSaving} className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">
            {copy.cancel}
          </button>
          <button type="submit" disabled={isSaving} className="cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? copy.saving : copy.add}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
