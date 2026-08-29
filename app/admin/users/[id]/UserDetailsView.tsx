"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { PasswordInput } from "@/app/components/PasswordInput";
import {
  parseAdminUserPasswordReset,
  type AdminUserField,
  type AdminUserPasswordMode,
} from "@/lib/admin-users";
import {
  generateTemporaryPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy";

import { useI18n } from "../../../i18n/LanguageProvider";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { getLocalizedError } from "../UsersView";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  mustChangePassword: boolean;
};

type AccessRoleOption = {
  id: string;
  name: string;
  systemKey: "FULL_ACCESS" | "NO_ACCESS" | null;
};

type UserDetailsViewProps = {
  initialUser: ManagedUser;
  currentUserId: string;
  initialActiveAdminCount: number;
  accessRoles: {
    assignmentRevision: number;
    assignedRoleIds: string[];
    availableRoles: AccessRoleOption[];
    canManageAccessRoles: boolean;
  } | null;
  canUpdateUser: boolean;
};

export function UserDetailsView({
  initialUser,
  currentUserId,
  initialActiveAdminCount,
  accessRoles,
  canUpdateUser,
}: UserDetailsViewProps) {
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t.admin.userManagement.detailsPageTitle;

    return () => {
      document.title = previousTitle;
    };
  }, [t.admin.userManagement.detailsPageTitle]);

  const [user, setUser] = useState(initialUser);
  const [activeAdminCount, setActiveAdminCount] = useState(
    initialActiveAdminCount,
  );
  const [editingField, setEditingField] = useState<AdminUserField | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [passwordMode, setPasswordMode] =
    useState<AdminUserPasswordMode>("temporary");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [revokeSessions, setRevokeSessions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingEmail, setConfirmingEmail] = useState(false);
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [assignmentRevision, setAssignmentRevision] = useState(
    accessRoles?.assignmentRevision ?? 0,
  );
  const [assignedRoleIds, setAssignedRoleIds] = useState(
    accessRoles?.assignedRoleIds ?? [],
  );
  const [savedRoleIds, setSavedRoleIds] = useState(assignedRoleIds);
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [isEditingAccessRoles, setIsEditingAccessRoles] = useState(false);

  const protectedRoleReason = getRoleProtectionReason({
    user,
    currentUserId,
    activeAdminCount,
    selfProtected: t.admin.userManagement.selfProtected,
    lastAdminProtected: t.admin.userManagement.lastAdminProtected,
  });
  const passwordResetProtected = user.id === currentUserId;

  const beginEdit = (field: AdminUserField) => {
    setEditingField(field);
    setDraftValue(getFieldValue(user, field));
    setError(null);
    setSuccessMessage(null);
  };

  const cancelEdit = () => {
    if (isSubmitting) return;
    setEditingField(null);
    setDraftValue("");
    setConfirmingEmail(false);
    setError(null);
  };

  const beginPasswordReset = () => {
    setIsEditingPassword(true);
    setPasswordMode("temporary");
    setPassword("");
    setPasswordConfirmation("");
    setRevokeSessions(true);
    setConfirmingPassword(false);
    setError(null);
    setSuccessMessage(null);
  };

  const cancelPasswordReset = () => {
    if (isSubmitting) return;
    setIsEditingPassword(false);
    setPasswordMode("temporary");
    setPassword("");
    setPasswordConfirmation("");
    setRevokeSessions(true);
    setConfirmingPassword(false);
    setError(null);
  };

  const changePasswordMode = (mode: AdminUserPasswordMode) => {
    setPasswordMode(mode);
    setPassword("");
    setPasswordConfirmation("");
    setError(null);
  };

  const generatePassword = () => {
    const generated = generateTemporaryPassword();
    setPassword(generated);
    setPasswordConfirmation(generated);
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
    setSuccessMessage(t.admin.userManagement.saved);
    router.refresh();
  };

  const submitPasswordReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = parseAdminUserPasswordReset({
      mode: passwordMode,
      password,
      passwordConfirmation,
      revokeSessions,
    });

    if (!parsed.ok) {
      setError(getLocalizedError(parsed.code, t.admin.userManagement.errors));
      return;
    }

    setError(null);
    setConfirmingPassword(true);
  };

  const resetPassword = async () => {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(
      `/api/admin/users/${encodeURIComponent(user.id)}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: passwordMode,
          password,
          passwordConfirmation,
          revokeSessions,
        }),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          user?: Pick<ManagedUser, "id" | "mustChangePassword">;
          error?: string;
        }
      | null;

    if (!response.ok || !body?.ok || !body.user) {
      setError(getLocalizedError(body?.error, t.admin.userManagement.errors));
      setIsSubmitting(false);
      return;
    }

    setUser((current) => ({ ...current, ...body.user }));
    setIsSubmitting(false);
    setSuccessMessage(t.admin.userManagement.passwordResetSaved);
    cancelPasswordReset();
    router.refresh();
  };

  const passwordLengthInvalid =
    password.length > 0 &&
    (password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH);
  const passwordsMismatch =
    passwordConfirmation.length > 0 && password !== passwordConfirmation;
  const passwordsMatch =
    passwordConfirmation.length > 0 &&
    password === passwordConfirmation &&
    !passwordLengthInvalid;
  const canSubmitPassword =
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    password === passwordConfirmation;

  const fields: Array<{
    field: AdminUserField;
    label: string;
    value: string;
    description?: string;
  }> = [
    {
      field: 'name',
      label: t.admin.userManagement.name,
      value: user.name,
    },
    { field: 'email', label: t.admin.email, value: user.email },
    {
      field: "role",
      label: t.admin.role,
      value: user.role === 'admin' ? t.auth.roleAdmin : t.auth.roleUser,
      description: t.admin.accessControl.adminAttributeHelp,
    },
  ];

  const changeAccessRole = (roleId: string) => {
    setAssignedRoleIds(roleId ? [roleId] : []);
    setError(null);
    setSuccessMessage(null);
  };

  const saveAccessRoles = async () => {
    if (!accessRoles) return;
    if (assignedRoleIds.length !== 1) {
      setError(t.admin.accessControl.genericError);
      return;
    }
    setIsSavingRoles(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/access-roles`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleIds: assignedRoleIds,
            expectedAssignmentRevision: assignmentRevision,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | {
            assignment?: { roleIds: string[]; assignmentRevision: number };
            error?: string;
          }
        | null;
      if (
        !response.ok ||
        !body?.assignment ||
        body.assignment.roleIds.length !== 1
      ) {
        setError(
          response.status === 409
            ? t.admin.accessControl.conflictError
            : t.admin.accessControl.genericError,
        );
        return;
      }
      setAssignedRoleIds(body.assignment.roleIds);
      setSavedRoleIds(body.assignment.roleIds);
      setAssignmentRevision(body.assignment.assignmentRevision);
      setIsEditingAccessRoles(false);
      setSuccessMessage(t.admin.accessControl.saved);
      router.refresh();
    } catch {
      setError(t.admin.accessControl.genericError);
    } finally {
      setIsSavingRoles(false);
    }
  };

  const accessRolesChanged = assignedRoleIds[0] !== savedRoleIds[0];
  const accessRolesProtected =
    user.id === currentUserId || !accessRoles?.canManageAccessRoles;
  const selectedAccessRole =
    accessRoles?.availableRoles.find((role) => role.id === savedRoleIds[0]) ??
    null;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex text-sm font-semibold text-accent transition-colors hover:text-primary-700 dark:hover:text-primary-300"
      >
        ← {t.admin.userManagement.backToUsers}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">
          {t.admin.userManagement.detailsTitle}
        </h1>
        <p className="mt-1 text-sm leading-6 text-fg-muted">
          {t.admin.userManagement.detailsDescription}
        </p>
      </div>

      {!canUpdateUser ? (
        <div
          id="user-details-read-only"
          role="status"
          className="rounded-md border border-line bg-surface-accent-subtle px-4 py-3 text-sm font-semibold text-accent"
        >
          {t.admin.userManagement.detailsReadOnly}
        </div>
      ) : null}

      {successMessage ? (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          {successMessage}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-sm">
        {fields.map(({ field, label, value, description }) => {
          const isEditing = editingField === field;
          const roleEditProtected = field === "role" && protectedRoleReason !== null;
          const editDisabled =
            !canUpdateUser ||
            editingField !== null ||
            isEditingPassword ||
            isEditingAccessRoles ||
            roleEditProtected;

          return (
            <div
              key={field}
              className="grid gap-3 border-b border-line-subtle px-5 py-6 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start sm:gap-6"
            >
              <p
                id={`user-${field}-label`}
                className="text-sm font-semibold text-fg-muted"
              >
                {label}
              </p>
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
                      aria-labelledby={`user-${field}-label`}
                      aria-describedby={
                        description ? `user-${field}-description` : undefined
                      }
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
                      aria-labelledby={`user-${field}-label`}
                      className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent disabled:opacity-60"
                    />
                  )}
                  {description ? (
                    <p
                      id={`user-${field}-description`}
                      className="text-xs leading-5 text-fg-muted"
                    >
                      {description}
                    </p>
                  ) : null}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-medium">{value}</p>
                      {field === "name" ? (
                        <StatusBadge banned={user.banned} />
                      ) : null}
                    </div>
                    {description ? (
                      <p
                        id={`user-${field}-description`}
                        className="mt-2 text-xs leading-5 text-fg-muted"
                      >
                        {description}
                      </p>
                    ) : null}
                    {roleEditProtected ? (
                      <p
                        id="user-role-protection-reason"
                        className="mt-2 text-xs leading-5 text-fg-muted"
                      >
                        {protectedRoleReason}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => beginEdit(field)}
                    disabled={editDisabled}
                    aria-describedby={
                      !canUpdateUser
                        ? 'user-details-read-only'
                        : roleEditProtected
                          ? 'user-role-protection-reason'
                          : undefined
                    }
                    title={
                      !canUpdateUser
                        ? t.admin.userManagement.detailsReadOnly
                        : roleEditProtected
                          ? (protectedRoleReason ?? undefined)
                          : undefined
                    }
                    className="cursor-pointer justify-self-start rounded-md px-2 py-1 text-sm font-semibold text-accent transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 sm:justify-self-end"
                  >
                    {t.admin.userManagement.edit}
                  </button>
                </>
              )}
            </div>
          );
        })}
        {accessRoles ? (
          <div className="grid gap-3 border-b border-line-subtle px-5 py-6 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start sm:gap-6">
            <p
              id="user-access-roles-label"
              className="text-sm font-semibold text-fg-muted"
            >
              {t.admin.userManagement.accessRoles}
            </p>
            {isEditingAccessRoles ? (
              <div className="space-y-3 sm:col-span-2">
                <select
                  value={assignedRoleIds[0] ?? ""}
                  onChange={(event) => changeAccessRole(event.target.value)}
                  disabled={accessRolesProtected || isSavingRoles}
                  aria-labelledby="user-access-roles-label"
                  className="w-full max-w-md cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {assignedRoleIds.length === 0 ? (
                    <option value="" disabled>
                      {t.admin.accessControl.noAssignedRoles}
                    </option>
                  ) : null}
                  {accessRoles.availableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.systemKey
                        ? t.admin.accessControl.systemRoleNames[role.systemKey]
                        : role.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-fg-muted">
                  {t.admin.accessControl.replaceAccessRoleHelp}
                </p>
                {error && !editingField && !isEditingPassword ? (
                  <p
                    role="alert"
                    className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200"
                  >
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveAccessRoles()}
                    disabled={
                      accessRolesProtected || isSavingRoles || !accessRolesChanged
                    }
                    className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingRoles
                      ? t.admin.accessControl.saving
                      : t.admin.accessControl.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isSavingRoles) return;
                      setAssignedRoleIds(savedRoleIds);
                      setIsEditingAccessRoles(false);
                      setError(null);
                    }}
                    disabled={isSavingRoles}
                    className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t.admin.accessControl.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0">
                  {selectedAccessRole ? (
                    <p
                      title={
                        selectedAccessRole.systemKey
                          ? t.admin.accessControl.systemRoleDescriptions[
                              selectedAccessRole.systemKey
                            ]
                          : undefined
                      }
                      className="font-medium"
                    >
                      {selectedAccessRole.systemKey
                        ? t.admin.accessControl.systemRoleNames[
                            selectedAccessRole.systemKey
                          ]
                        : selectedAccessRole.name}
                    </p>
                  ) : (
                    <p className="text-sm text-fg-muted">
                      {t.admin.accessControl.noAssignedRoles}
                    </p>
                  )}
                  <p className="mt-2 text-xs leading-5 text-fg-muted">
                    {t.admin.accessControl.accessRoleSummaryHelp}
                  </p>
                  <Link
                    href={`/admin/users/${encodeURIComponent(user.id)}/access`}
                    className="mt-3 inline-flex text-sm font-semibold text-accent transition-colors hover:text-primary-700 dark:hover:text-primary-300"
                  >
                    {t.admin.accessControl.viewAccess}
                  </Link>
                  {accessRolesProtected ? (
                    <p
                      id="user-access-roles-protection-reason"
                      className="mt-2 text-xs leading-5 text-fg-muted"
                    >
                      {t.admin.accessControl.readOnlyRoleAction}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAssignedRoleIds(savedRoleIds);
                    setError(null);
                    setSuccessMessage(null);
                    setIsEditingAccessRoles(true);
                  }}
                  disabled={
                    accessRolesProtected ||
                    editingField !== null ||
                    isEditingPassword
                  }
                  aria-describedby={
                    accessRolesProtected
                      ? 'user-access-roles-protection-reason'
                      : undefined
                  }
                  title={
                    accessRolesProtected
                      ? t.admin.accessControl.readOnlyRoleAction
                      : undefined
                  }
                  className="cursor-pointer justify-self-start rounded-md px-2 py-1 text-sm font-semibold text-accent transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 sm:justify-self-end"
                >
                  {t.admin.userManagement.edit}
                </button>
              </>
            )}
          </div>
        ) : null}
        <div className="grid gap-3 px-5 py-6 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start sm:gap-6">
          <p className="text-sm font-semibold text-fg-muted">
            {t.admin.userManagement.password}
          </p>
          {isEditingPassword ? (
            <form
              onSubmit={submitPasswordReset}
              className="space-y-5 sm:col-span-2"
            >
              <p
                id="user-password-visibility-help"
                className="text-xs leading-5 text-fg-muted"
              >
                {t.admin.userManagement.passwordVisibilityHelp}
              </p>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">
                  {t.admin.userManagement.passwordMode}
                </legend>
                <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                  {(["temporary", "standard"] as const).map((mode) => (
                    <label
                      key={mode}
                      className="flex cursor-pointer gap-3 rounded-lg border border-line p-4 has-[:checked]:border-accent has-[:checked]:bg-surface-selected"
                    >
                      <input
                        type="radio"
                        name="passwordMode"
                        value={mode}
                        checked={passwordMode === mode}
                        onChange={() => changePasswordMode(mode)}
                        disabled={isSubmitting}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
                      />
                      <span>
                        <span className="block text-sm font-semibold">
                          {mode === "temporary"
                            ? t.admin.userManagement.temporaryPasswordMode
                            : t.admin.userManagement.standardPasswordMode}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-fg-muted">
                          {mode === "temporary"
                            ? t.admin.userManagement.temporaryPasswordModeDescription
                            : t.admin.userManagement.standardPasswordModeDescription}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                <PasswordInput
                  key={`admin-new-password-${passwordMode}`}
                  id="admin-new-password"
                  label={t.admin.userManagement.newPassword}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                  }}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  autoFocus
                  aria-describedby="admin-password-requirements"
                />
                <PasswordInput
                  key={`admin-confirm-password-${passwordMode}`}
                  id="admin-confirm-password"
                  label={t.admin.userManagement.confirmPassword}
                  value={passwordConfirmation}
                  onChange={(event) => {
                    setPasswordConfirmation(event.target.value);
                    setError(null);
                  }}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                />
              </div>
              <div className="max-w-2xl space-y-2">
                <p
                  id="admin-password-requirements"
                  className="text-xs leading-5 text-fg-muted"
                >
                  {t.admin.userManagement.passwordRequirements}
                </p>
                {passwordMode === "temporary" ? (
                  <button
                    type="button"
                    onClick={generatePassword}
                    disabled={isSubmitting}
                    className="cursor-pointer text-sm font-semibold text-accent underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t.admin.userManagement.generateTemporaryPassword}
                  </button>
                ) : null}
              </div>

              <div className="max-w-2xl rounded-lg border border-line p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {t.admin.userManagement.revokeSessions}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-fg-muted">
                      {t.admin.userManagement.revokeSessionsDescription}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={revokeSessions}
                      aria-label={t.admin.userManagement.revokeSessions}
                      onClick={() => setRevokeSessions((value) => !value)}
                      disabled={isSubmitting}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                        revokeSessions ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          revokeSessions ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {passwordLengthInvalid ? (
                <p role="alert" className="max-w-2xl text-sm text-red-700 dark:text-red-200">
                  {t.admin.userManagement.errors.INVALID_PASSWORD}
                </p>
              ) : null}
              {passwordsMismatch ? (
                <p role="alert" className="max-w-2xl text-sm text-red-700 dark:text-red-200">
                  {t.admin.userManagement.errors.PASSWORD_MISMATCH}
                </p>
              ) : null}
              {passwordsMatch ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="inline-flex max-w-2xl items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  <span aria-hidden="true">✓</span>
                  {t.admin.userManagement.passwordsMatch}
                </p>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !canSubmitPassword}
                  className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.admin.userManagement.save}
                </button>
                <button
                  type="button"
                  onClick={cancelPasswordReset}
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
                <p className="font-medium">
                  {user.mustChangePassword
                    ? t.admin.userManagement.passwordChangeRequired
                    : t.admin.userManagement.passwordConfigured}
                </p>
                <p
                  id="user-password-visibility-help"
                  className="mt-2 text-xs leading-5 text-fg-muted"
                >
                  {t.admin.userManagement.passwordVisibilityHelp}
                </p>
                {passwordResetProtected ? (
                  <p
                    id="user-password-protection-reason"
                    className="mt-2 text-xs leading-5 text-fg-muted"
                  >
                    {t.admin.userManagement.selfPasswordResetProtected}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={beginPasswordReset}
                disabled={
                  editingField !== null ||
                  isEditingPassword ||
                  isEditingAccessRoles ||
                  passwordResetProtected ||
                  !canUpdateUser
                }
                aria-describedby={
                  !canUpdateUser
                    ? 'user-details-read-only user-password-visibility-help'
                    : passwordResetProtected
                      ? 'user-password-visibility-help user-password-protection-reason'
                      : 'user-password-visibility-help'
                }
                title={
                  passwordResetProtected
                    ? t.admin.userManagement.selfPasswordResetProtected
                    : undefined
                }
                className="cursor-pointer justify-self-start rounded-md px-2 py-1 text-sm font-semibold text-accent transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 sm:justify-self-end"
              >
                {t.admin.userManagement.resetPassword}
              </button>
            </>
          )}
        </div>
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

      {confirmingPassword ? (
        <ConfirmationDialog
          title={t.admin.userManagement.passwordDialogTitle}
          description={t.admin.userManagement.passwordDialogDescription}
          confirmLabel={
            isSubmitting
              ? t.admin.userManagement.saving
              : t.admin.userManagement.confirmPasswordReset
          }
          cancelLabel={t.admin.userManagement.cancel}
          isSubmitting={isSubmitting}
          error={error}
          onClose={() => {
            if (isSubmitting) return;
            setConfirmingPassword(false);
            setError(null);
          }}
          onConfirm={() => void resetPassword()}
        >
          <dl className="mt-4 space-y-3 rounded-lg bg-surface px-4 py-3 text-sm">
            <div>
              <dt className="font-semibold text-fg-muted">
                {t.admin.userManagement.targetUser}
              </dt>
              <dd className="mt-1 font-semibold">{user.name}</dd>
              <dd className="break-all text-fg-muted">{user.email}</dd>
            </div>
            <div>
              <dt className="font-semibold text-fg-muted">
                {t.admin.userManagement.passwordMode}
              </dt>
              <dd className="mt-1 font-semibold">
                {passwordMode === "temporary"
                  ? t.admin.userManagement.temporaryPasswordMode
                  : t.admin.userManagement.standardPasswordMode}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-fg-muted">
                {t.admin.userManagement.revokeSessions}
              </dt>
              <dd className="mt-1 font-semibold">
                {revokeSessions
                  ? t.admin.userManagement.enabled
                  : t.admin.userManagement.disabled}
              </dd>
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
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        suspended
          ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-200'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200'
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
