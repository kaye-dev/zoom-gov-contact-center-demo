"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AdminUserField } from "@/lib/admin-users";

import { useI18n } from "../../../i18n/LanguageProvider";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { getLocalizedError } from "../UsersView";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
};

type UserDetailsViewProps = {
  initialUser: ManagedUser;
  currentUserId: string;
  initialActiveAdminCount: number;
};

export function UserDetailsView({
  initialUser,
  currentUserId,
  initialActiveAdminCount,
}: UserDetailsViewProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [activeAdminCount, setActiveAdminCount] = useState(
    initialActiveAdminCount,
  );
  const [editingField, setEditingField] = useState<AdminUserField | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingEmail, setConfirmingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const protectedRoleReason = getRoleProtectionReason({
    user,
    currentUserId,
    activeAdminCount,
    selfProtected: t.admin.userManagement.selfProtected,
    lastAdminProtected: t.admin.userManagement.lastAdminProtected,
  });

  const beginEdit = (field: AdminUserField) => {
    setEditingField(field);
    setDraftValue(getFieldValue(user, field));
    setError(null);
    setSaved(false);
  };

  const cancelEdit = () => {
    if (isSubmitting) return;
    setEditingField(null);
    setDraftValue("");
    setConfirmingEmail(false);
    setError(null);
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingField || isSubmitting) return;

    if (draftValue === getFieldValue(user, editingField)) {
      cancelEdit();
      return;
    }

    if (editingField === "email") {
      setError(null);
      setConfirmingEmail(true);
      return;
    }

    void updateField(editingField, draftValue);
  };

  const updateField = async (field: AdminUserField, value: string) => {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(
      `/api/admin/users/${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | { user?: Partial<ManagedUser>; error?: string }
      | null;

    if (!response.ok || !body?.user) {
      setError(getLocalizedError(body?.error, t.admin.userManagement.errors));
      setIsSubmitting(false);
      return;
    }

    const previousIsActiveAdmin = isActiveAdmin(user);
    const updatedUser = { ...user, ...body.user };
    const nextIsActiveAdmin = isActiveAdmin(updatedUser);
    setUser(updatedUser);
    if (previousIsActiveAdmin !== nextIsActiveAdmin) {
      setActiveAdminCount((count) =>
        Math.max(0, count + (nextIsActiveAdmin ? 1 : -1)),
      );
    }
    setIsSubmitting(false);
    setConfirmingEmail(false);
    setEditingField(null);
    setDraftValue("");
    setSaved(true);
    router.refresh();
  };

  const fields: Array<{
    field: AdminUserField;
    label: string;
    value: string;
  }> = [
    { field: "name", label: t.admin.name, value: user.name },
    { field: "email", label: t.admin.email, value: user.email },
    {
      field: "role",
      label: t.admin.role,
      value: user.role === "admin" ? t.auth.roleAdmin : t.auth.roleUser,
    },
  ];

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex text-sm font-semibold text-accent transition-colors hover:text-primary-700 dark:hover:text-primary-300"
      >
        ← {t.admin.userManagement.backToUsers}
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t.admin.userManagement.detailsTitle}</h1>
          <p className="mt-1 text-sm leading-6 text-fg-muted">
            {t.admin.userManagement.detailsDescription}
          </p>
        </div>
        <StatusBadge banned={user.banned} />
      </div>

      {saved ? (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          {t.admin.userManagement.saved}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-sm">
        {fields.map(({ field, label, value }) => {
          const isEditing = editingField === field;
          const roleEditProtected = field === "role" && protectedRoleReason !== null;
          const editDisabled = editingField !== null || roleEditProtected;

          return (
            <div
              key={field}
              className="grid gap-3 border-b border-line-subtle px-5 py-6 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start sm:gap-6"
            >
              <p className="text-sm font-semibold text-fg-muted">{label}</p>
              {isEditing ? (
                <form
                  onSubmit={submitEdit}
                  className="space-y-3 sm:col-span-2"
                >
                  {field === "role" ? (
                    <select
                      value={draftValue}
                      onChange={(event) => setDraftValue(event.target.value)}
                      disabled={isSubmitting}
                      autoFocus
                      className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent disabled:opacity-60"
                    >
                      <option value="user">{t.auth.roleUser}</option>
                      <option value="admin">{t.auth.roleAdmin}</option>
                    </select>
                  ) : (
                    <input
                      type={field === "email" ? "email" : "text"}
                      value={draftValue}
                      onChange={(event) => setDraftValue(event.target.value)}
                      required
                      autoFocus
                      autoComplete={field === "email" ? "email" : "name"}
                      disabled={isSubmitting}
                      className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent disabled:opacity-60"
                    />
                  )}
                  {error ? (
                    <p
                      role="alert"
                      className="max-w-md rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200"
                    >
                      {error}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting
                        ? t.admin.userManagement.saving
                        : t.admin.userManagement.save}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={isSubmitting}
                      className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.admin.userManagement.cancel}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="break-words font-medium">{value}</p>
                    {roleEditProtected ? (
                      <p className="mt-2 text-xs leading-5 text-fg-muted">
                        {protectedRoleReason}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => beginEdit(field)}
                    disabled={editDisabled}
                    title={roleEditProtected ? protectedRoleReason ?? undefined : undefined}
                    className="cursor-pointer justify-self-start rounded-md px-2 py-1 text-sm font-semibold text-accent transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 sm:justify-self-end"
                  >
                    {t.admin.userManagement.edit}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {confirmingEmail ? (
        <ConfirmationDialog
          title={t.admin.userManagement.emailDialogTitle}
          description={t.admin.userManagement.emailDialogDescription}
          confirmLabel={
            isSubmitting
              ? t.admin.userManagement.saving
              : t.admin.userManagement.changeEmail
          }
          cancelLabel={t.admin.userManagement.cancel}
          isSubmitting={isSubmitting}
          error={error}
          onClose={() => {
            if (isSubmitting) return;
            setConfirmingEmail(false);
            setError(null);
          }}
          onConfirm={() => void updateField("email", draftValue)}
        >
          <dl className="mt-4 space-y-3 rounded-lg bg-surface px-4 py-3 text-sm">
            <div>
              <dt className="font-semibold text-fg-muted">
                {t.admin.userManagement.currentEmail}
              </dt>
              <dd className="mt-1 break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="font-semibold text-fg-muted">
                {t.admin.userManagement.newEmail}
              </dt>
              <dd className="mt-1 break-all font-semibold">{draftValue}</dd>
            </div>
          </dl>
        </ConfirmationDialog>
      ) : null}
    </section>
  );
}

function StatusBadge({ banned }: { banned: boolean | null }) {
  const { t } = useI18n();
  const suspended = banned === true;

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold sm:ml-auto ${
        suspended
          ? "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200"
      }`}
    >
      {suspended
        ? t.admin.userManagement.suspended
        : t.admin.userManagement.active}
    </span>
  );
}

function getFieldValue(user: ManagedUser, field: AdminUserField) {
  if (field === "role") return user.role === "admin" ? "admin" : "user";
  return user[field];
}

function isActiveAdmin(user: Pick<ManagedUser, "role" | "banned">) {
  return user.role === "admin" && user.banned !== true;
}

function getRoleProtectionReason({
  user,
  currentUserId,
  activeAdminCount,
  selfProtected,
  lastAdminProtected,
}: {
  user: ManagedUser;
  currentUserId: string;
  activeAdminCount: number;
  selfProtected: string;
  lastAdminProtected: string;
}) {
  if (user.role !== "admin") return null;
  if (user.id === currentUserId) return selfProtected;
  if (user.banned !== true && activeAdminCount <= 1) return lastAdminProtected;
  return null;
}
