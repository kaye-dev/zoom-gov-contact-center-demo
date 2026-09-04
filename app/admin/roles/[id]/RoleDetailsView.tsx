"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Checkbox } from "@/app/components/Checkbox";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import {
  getAdminRoleDisplayDescription,
  getAdminRoleDisplayName,
} from "@/app/components/admin/role-display";
import { EditSquareIcon } from "@/app/components/svg/EditSquareIcon";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type {
  AdminAccessAction,
  AdminAccessEffect,
  AdminResourceKey,
} from "@/lib/admin-access/types";

import { AdminSectionNavigation } from "../../AdminSectionNavigation";

const DIRECTORY_PAGE_SIZE = 20;

type RoleMatrixAction = {
  action: AdminAccessAction;
  supported: boolean;
  effect: AdminAccessEffect | null;
};

type RoleDetails = {
  id: string;
  name: string;
  description: string | null;
  systemKey: "FULL_ACCESS" | "NO_ACCESS" | null;
  revision: number;
  memberCount: number;
  matrix: Array<{
    resourceKey: AdminResourceKey;
    displayPaths: string[];
    actions: RoleMatrixAction[];
  }>;
};

type RoleMember = {
  id: string;
  name: string;
  email: string;
  adminAttribute: "admin" | "user";
  banned: boolean;
  assignedAt: string;
  assignmentRevision: number;
  assignedRoleIds: string[];
};

type RoleCandidate = Omit<RoleMember, "assignedAt">;

type RoleMemberPage = {
  members: RoleMember[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type RoleCandidatePage = {
  candidates: RoleCandidate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function RoleDetailsView({
  initialRole,
  currentUserId,
  canUpdate,
  canViewMembers,
  canManageMembers,
}: {
  initialRole: RoleDetails;
  currentUserId: string;
  canUpdate: boolean;
  canViewMembers: boolean;
  canManageMembers: boolean;
}) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  const router = useRouter();
  const metadataNameRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState(initialRole);
  const [section, setSection] = useState<"settings" | "members">("settings");
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [matrix, setMatrix] = useState(role.matrix);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataNameError, setMetadataNameError] = useState<string | null>(
    null,
  );
  const editable = canUpdate && role.systemKey === null;
  const displayName = getAdminRoleDisplayName(role, copy);
  const displayDescription = getAdminRoleDisplayDescription(role, copy);
  const changed = useMemo(
    () => JSON.stringify(matrix) !== JSON.stringify(role.matrix),
    [matrix, role.matrix],
  );
  const handleMemberCountChange = useCallback((memberCount: number) => {
    setRole((current) =>
      current.memberCount === memberCount
        ? current
        : { ...current, memberCount },
    );
  }, []);

  useEffect(() => {
    const syncSectionFromHash = () => {
      setSection(
        canViewMembers && window.location.hash === "#members"
          ? "members"
          : "settings",
      );
    };
    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, [canViewMembers]);

  const selectSection = (nextSection: "settings" | "members") => {
    setSection(nextSection);
    const url = new URL(window.location.href);
    url.hash = nextSection === "members" ? "members" : "";
    window.history.replaceState(null, "", url);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!canViewMembers) return;
    let nextSection: "settings" | "members" | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextSection = section === "settings" ? "members" : "settings";
    } else if (event.key === "Home") {
      nextSection = "settings";
    } else if (event.key === "End") {
      nextSection = "members";
    }
    if (!nextSection) return;
    event.preventDefault();
    selectSection(nextSection);
    document.getElementById(`role-${nextSection}-tab`)?.focus();
  };

  const setAllowed = (
    resourceKey: AdminResourceKey,
    action: AdminAccessAction,
    checked: boolean,
  ) => {
    setMatrix((current) =>
      current.map((resource) =>
        resource.resourceKey !== resourceKey
          ? resource
          : {
              ...resource,
              actions: resource.actions.map((cell) => {
                if (!cell.supported) return cell;
                if (cell.action === action) {
                  return { ...cell, effect: checked ? "ALLOW" : null };
                }
                if (action === "VIEW" && !checked) {
                  return { ...cell, effect: null };
                }
                return cell;
              }),
            },
      ),
    );
    setFeedback(null);
  };

  const savePermissions = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const permissions = matrix.flatMap((resource) =>
        resource.actions
          .filter((cell) => cell.supported)
          .map((cell) => ({
            resourceKey: resource.resourceKey,
            action: cell.action,
            effect: cell.effect,
          })),
      );
      const response = await fetch(
        `/api/admin/roles/${encodeURIComponent(role.id)}/permissions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: role.revision, permissions }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { role?: { revision: number } }
        | null;
      if (!response.ok || !body?.role) {
        setFeedback(response.status === 409 ? copy.conflictError : copy.genericError);
        return;
      }
      const next = { ...role, revision: body.role.revision, matrix };
      setRole(next);
      setFeedback(copy.saved);
      router.refresh();
    } catch {
      setFeedback(copy.genericError);
    } finally {
      setIsSaving(false);
    }
  };

  const saveMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMetadataError(null);
    setMetadataNameError(null);
    try {
      const response = await fetch(`/api/admin/roles/${encodeURIComponent(role.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: role.revision, name, description }),
      });
      const body = (await response.json().catch(() => null)) as
        | { role?: Pick<RoleDetails, "name" | "description" | "revision">; error?: string }
        | null;
      if (!response.ok || !body?.role) {
        if (
          body?.error === 'ROLE_NAME_REQUIRED' ||
          body?.error === 'ROLE_NAME_TOO_LONG'
        ) {
          setMetadataNameError(
            body.error === 'ROLE_NAME_REQUIRED'
              ? copy.roleNameRequired
              : copy.roleNameTooLong,
          );
          setIsSaving(false);
          window.requestAnimationFrame(() => metadataNameRef.current?.focus());
          return;
        }
        setMetadataError(
          body?.error === 'ROLE_NAME_CONFLICT'
            ? copy.duplicateError
            : response.status === 409
              ? copy.conflictError
              : copy.genericError,
        );
        return;
      }
      setRole((current) => ({ ...current, ...body.role }));
      setIsEditingMetadata(false);
      setFeedback(copy.saved);
      router.refresh();
    } catch {
      setMetadataError(copy.genericError);
    } finally {
      setIsSaving(false);
    }
  };

  const openMetadataEditor = () => {
    setName(role.name);
    setDescription(role.description ?? '');
    setMetadataError(null);
    setMetadataNameError(null);
    setIsEditingMetadata(true);
  };

  const closeMetadataEditor = () => {
    if (isSaving) return;
    setMetadataError(null);
    setMetadataNameError(null);
    setIsEditingMetadata(false);
  };

  return (
    <section className="min-w-0">
      <div data-admin-page-chrome className="space-y-4">
        <div
          data-admin-page-header
          className="mx-auto max-w-6xl"
        >
          <Link
            href="/admin/roles"
            className="inline-flex text-sm font-semibold text-accent transition-colors hover:text-primary-700 dark:hover:text-primary-300"
          >
            ← {copy.backToRoles}
          </Link>

          <div className="mt-5 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-bold">{displayName}</h1>
                {role.systemKey ? (
                  <span className="inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-100">
                    {copy.systemRole}
                  </span>
                ) : null}
                {editable ? (
                  <button
                    type="button"
                    onClick={openMetadataEditor}
                    disabled={isSaving}
                    aria-describedby={isSaving ? 'role-saving-reason' : undefined}
                    aria-label={`${copy.edit}: ${displayName}`}
                    className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <EditSquareIcon className="h-6 w-6" />
                  </button>
                ) : null}
                {isSaving ? (
                  <span id="role-saving-reason" className="sr-only">
                    {copy.saving}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-fg-muted">
                {displayDescription ?? '—'}
              </p>
            </div>
          </div>
        </div>
        <AdminSectionNavigation />
      </div>

      <div data-admin-page-body className="mx-auto mt-6 max-w-6xl">
      {!editable ? (
        <p
          role="status"
          className="mt-4 rounded-md border border-line bg-surface-accent-subtle px-4 py-3 text-sm font-semibold text-accent"
        >
          {role.systemKey ? copy.systemRoleReadOnly : copy.readOnlyRoleAction}
        </p>
      ) : null}

      <nav
        role="tablist"
        aria-label={copy.listTitle}
        className="mt-6 border-b border-line"
      >
        <button
          id="role-settings-tab"
          role="tab"
          type="button"
          tabIndex={section === 'settings' ? 0 : -1}
          onClick={() => selectSection('settings')}
          onKeyDown={handleTabKeyDown}
          aria-selected={section === 'settings'}
          aria-controls="role-settings-panel"
          className={`inline-flex cursor-pointer border-b-2 px-3 py-3 text-sm font-semibold ${section === 'settings' ? 'border-accent text-accent' : 'border-transparent text-fg-muted hover:text-accent'}`}
        >
          {copy.settingsTab}
        </button>
        {canViewMembers ? (
          <button
            id="role-members-tab"
            role="tab"
            type="button"
            tabIndex={section === 'members' ? 0 : -1}
            onClick={() => selectSection('members')}
            onKeyDown={handleTabKeyDown}
            aria-selected={section === 'members'}
            aria-controls="role-members-panel"
            className={`inline-flex cursor-pointer border-b-2 px-3 py-3 text-sm font-semibold ${section === 'members' ? 'border-accent text-accent' : 'border-transparent text-fg-muted hover:text-accent'}`}
          >
            {copy.membersTab}
          </button>
        ) : null}
      </nav>

      <div className="mt-6">
        {feedback ? (
          <div
            role={feedback === copy.saved ? 'status' : 'alert'}
            className={`mb-5 rounded-md border px-4 py-3 text-sm font-semibold ${
              feedback === copy.saved
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                : feedback === copy.conflictError
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100'
                  : 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200'
            }`}
          >
            <p>{feedback}</p>
            {feedback === copy.conflictError ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 cursor-pointer rounded-md border border-current px-3 py-2 text-sm font-semibold"
              >
                {copy.reload}
              </button>
            ) : null}
          </div>
        ) : null}

        {section === 'settings' ? (
          <div
            id="role-settings-panel"
            role="tabpanel"
            aria-labelledby="role-settings-tab"
            className="space-y-5"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-bold">{copy.adminPageAccessTitle}</h2>
              <p className="text-sm leading-6 text-fg-muted">
                {copy.adminPageAccessDescription}
              </p>
            </div>
            <PermissionMatrix
              matrix={matrix}
              editable={editable && !isSaving}
              onChange={setAllowed}
            />
            {editable ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={savePermissions}
                  disabled={!changed || isSaving}
                  className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? copy.saving : copy.save}
                </button>
              </div>
            ) : null}
          </div>
        ) : canViewMembers ? (
          <div
            id="role-members-panel"
            role="tabpanel"
            aria-labelledby="role-members-tab"
          >
            <MembersPanel
              roleId={role.id}
              memberCount={role.memberCount}
              currentUserId={currentUserId}
              canManageMembers={canManageMembers}
              onMemberCountChange={handleMemberCountChange}
            />
          </div>
        ) : null}
      </div>

      {isEditingMetadata ? (
        <ModalDialog
          title={copy.editRoleTitle}
          description={copy.editRoleDescription}
          locked={isSaving}
          initialFocusRef={metadataNameRef}
          onRequestClose={closeMetadataEditor}
        >
          <form onSubmit={saveMetadata} className="mt-5 space-y-4">
            <label htmlFor="edit-role-name" className="block space-y-2">
              <span className="text-sm font-semibold">{copy.roleName}</span>
              <input
                ref={metadataNameRef}
                id="edit-role-name"
                required
                maxLength={64}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setMetadataNameError(null);
                }}
                disabled={isSaving}
                aria-invalid={metadataNameError !== null}
                aria-describedby={
                  metadataNameError ? 'edit-role-name-error' : undefined
                }
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
              {metadataNameError ? (
                <p
                  id="edit-role-name-error"
                  role="alert"
                  className="text-sm font-semibold text-red-700 dark:text-red-200"
                >
                  {metadataNameError}
                </p>
              ) : null}
            </label>
            <label htmlFor="edit-role-description" className="block space-y-2">
              <span className="text-sm font-semibold">
                {copy.descriptionOptional}
              </span>
              <textarea
                id="edit-role-description"
                rows={4}
                maxLength={100}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSaving}
                className="h-32 min-h-24 max-h-32 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            {metadataError ? (
              <p
                role="alert"
                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200"
              >
                {metadataError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeMetadataEditor}
                disabled={isSaving}
                className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? copy.saving : copy.save}
              </button>
            </div>
          </form>
        </ModalDialog>
      ) : null}
      </div>
    </section>
  );
}

function PermissionMatrix({
  matrix,
  editable,
  onChange,
}: {
  matrix: RoleDetails["matrix"];
  editable: boolean;
  onChange: (
    resourceKey: AdminResourceKey,
    action: AdminAccessAction,
    checked: boolean,
  ) => void;
}) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-line [contain:paint]">
      <table className="w-full min-w-[980px] divide-y divide-line-subtle text-left text-sm">
        <thead className="bg-surface-raised">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              {copy.adminPageColumn}
            </th>
            {(['VIEW', 'CREATE', 'UPDATE', 'DELETE'] as const).map((action) => (
              <th
                key={action}
                scope="col"
                className="w-28 px-3 py-3 text-center font-semibold"
              >
                {copy.actionLabels[action]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {matrix.map((resource) => {
            const viewAllowed = resource.actions.some(
              (cell) => cell.action === "VIEW" && cell.effect === "ALLOW",
            );
            return (
              <tr key={resource.resourceKey}>
                <th scope="row" className="px-4 py-4 align-top font-normal">
                  <p className="font-semibold text-fg">
                    {copy.resourceTitles[resource.resourceKey]}
                  </p>
                  <p className="mt-1 leading-6 text-fg-muted">
                    {copy.resourceDescriptions[resource.resourceKey]}
                  </p>
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="font-semibold text-fg-muted">
                      {copy.targetPaths}
                    </p>
                    {resource.displayPaths.map((path) => (
                      <code key={path} className="mr-2 inline-block break-all">
                        {path}
                      </code>
                    ))}
                  </div>
                </th>
                {resource.actions.map((cell) => {
                  const unsupportedId = `${resource.resourceKey}-${cell.action}-unsupported`;
                  const cellLabel = `${copy.resourceTitles[resource.resourceKey]} / ${copy.actionLabels[cell.action]}`;
                  const checked = cell.supported && cell.effect === "ALLOW";
                  const dependencyDisabled =
                    cell.action !== "VIEW" && !viewAllowed;
                  return (
                    <td
                      key={cell.action}
                      className="px-3 py-4 text-center align-top"
                    >
                      <Checkbox
                        indeterminate={!cell.supported}
                        checked={checked}
                        disabled={
                          !editable || !cell.supported || dependencyDisabled
                        }
                        onChange={(event) =>
                          onChange(
                            resource.resourceKey,
                            cell.action,
                            event.target.checked,
                          )
                        }
                        aria-label={`${cellLabel}: ${
                          !cell.supported
                            ? copy.unsupported
                            : checked
                              ? copy.allow
                              : copy.unset
                        }`}
                        aria-describedby={
                          !cell.supported ? unsupportedId : undefined
                        }
                      />
                      {!cell.supported ? (
                        <span id={unsupportedId} className="sr-only">
                          {copy.unsupported}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MembersPanel({
  roleId,
  memberCount,
  currentUserId,
  canManageMembers,
  onMemberCountChange,
}: {
  roleId: string;
  memberCount: number;
  currentUserId: string;
  canManageMembers: boolean;
  onMemberCountChange: (count: number) => void;
}) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RoleMemberPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isCandidateOpen, setIsCandidateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadMembers = useCallback(async (signal: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(DIRECTORY_PAGE_SIZE),
      });
      if (query) params.set("query", query);
      const response = await fetch(
        `/api/admin/roles/${encodeURIComponent(roleId)}/members?${params}`,
        { signal },
      );
      const body = (await response.json().catch(() => null)) as RoleMemberPage | null;
      if (!response.ok || !body) {
        setError(copy.genericError);
        return;
      }
      setResult(body);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError(copy.genericError);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [copy.genericError, page, query, roleId]);

  useEffect(() => {
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
      void loadMembers(controller.signal);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [loadMembers, refreshKey]);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQuery(draftQuery.trim().normalize("NFKC"));
  };

  const removeAssignment = async (member: RoleMember) => {
    setPendingUserId(member.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(member.id)}/access-roles`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleIds: [],
            expectedAssignmentRevision: member.assignmentRevision,
          }),
        },
      );
      if (!response.ok) {
        setError(response.status === 409 ? copy.conflictError : copy.genericError);
        return;
      }
      onMemberCountChange(Math.max(0, memberCount - 1));
      if (result?.members.length === 1 && page > 1) setPage(page - 1);
      else setRefreshKey((current) => current + 1);
    } catch {
      setError(copy.genericError);
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div className="space-y-5">
      {!canManageMembers ? (
        <p
          id="member-read-only-reason"
          role="status"
          className="rounded-md border border-line bg-surface-accent-subtle px-4 py-3 text-sm font-semibold text-accent"
        >
          {copy.readOnlyRoleAction}
        </p>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-bold">{copy.membersTab}</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {memberCount} {copy.memberCount}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCandidateOpen(true)}
          disabled={!canManageMembers}
          aria-describedby={
            !canManageMembers ? 'member-read-only-reason' : undefined
          }
          className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto"
        >
          {copy.assignUsers}
        </button>
      </div>

      <div>
        <form
          onSubmit={search}
          className="flex min-w-0 flex-col gap-3 sm:flex-row"
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t.admin.search}</span>
            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              maxLength={100}
              placeholder={copy.memberSearchPlaceholder}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            className="cursor-pointer rounded-md border border-line bg-surface-raised px-4 py-2 text-sm font-semibold hover:bg-surface-hover"
          >
            {t.admin.search}
          </button>
          {query ? (
            <button
              type="button"
              onClick={() => {
                setDraftQuery('');
                setQuery('');
                setPage(1);
              }}
              className="cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-hover"
            >
              {t.admin.clear}
            </button>
          ) : null}
        </form>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <p role="status" className="py-8 text-center text-fg-muted">
          {copy.loading}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] divide-y divide-line-subtle text-left text-sm">
            <thead className="bg-surface-raised">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t.admin.name}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t.admin.email}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t.admin.role}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t.admin.status}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  {copy.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {result?.members.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-4 font-semibold">
                    <Link
                      href={`/admin/users/${encodeURIComponent(member.id)}`}
                      className="text-accent hover:underline"
                    >
                      {member.name}
                    </Link>
                  </td>
                  <td className="px-4 py-4">{member.email}</td>
                  <td className="px-4 py-4">
                    {member.adminAttribute === 'admin'
                      ? t.auth.roleAdmin
                      : t.auth.roleUser}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge banned={member.banned} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    {canManageMembers ? (
                      <button type="button" onClick={() => void removeAssignment(member)} disabled={pendingUserId !== null || member.id === currentUserId} title={member.id === currentUserId ? t.admin.userManagement.selfProtected : undefined} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40">{copy.removeAssignment}</button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {result?.members.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">{copy.noMembers}</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      {result && result.totalPages > 1 ? (
        <DirectoryPagination page={result.page} totalPages={result.totalPages} onChange={setPage} />
      ) : null}

      {isCandidateOpen ? (
        <CandidateDialog
          roleId={roleId}
          onClose={() => setIsCandidateOpen(false)}
          onAssigned={() => {
            onMemberCountChange(memberCount + 1);
            setRefreshKey((current) => current + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function CandidateDialog({
  roleId,
  onClose,
  onAssigned,
}: {
  roleId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RoleCandidatePage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCandidates = useCallback(async (signal: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(DIRECTORY_PAGE_SIZE),
      });
      if (query) params.set("query", query);
      const response = await fetch(
        `/api/admin/roles/${encodeURIComponent(roleId)}/member-candidates?${params}`,
        { signal },
      );
      const body = (await response.json().catch(() => null)) as RoleCandidatePage | null;
      if (!response.ok || !body) {
        setError(copy.genericError);
        return;
      }
      setResult(body);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError(copy.genericError);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [copy.genericError, page, query, roleId]);

  useEffect(() => {
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
      void loadCandidates(controller.signal);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [loadCandidates, refreshKey]);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQuery(draftQuery.trim().normalize("NFKC"));
  };

  const assign = async (candidate: RoleCandidate) => {
    setPendingUserId(candidate.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(candidate.id)}/access-roles`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleIds: [roleId],
            expectedAssignmentRevision: candidate.assignmentRevision,
          }),
        },
      );
      if (!response.ok) {
        setError(response.status === 409 ? copy.conflictError : copy.genericError);
        return;
      }
      onAssigned();
      if (result?.candidates.length === 1 && page > 1) setPage(page - 1);
      else setRefreshKey((current) => current + 1);
    } catch {
      setError(copy.genericError);
    } finally {
      setPendingUserId(null);
    }
  };
  const locked = pendingUserId !== null;

  return (
    <ModalDialog
      title={copy.candidateDialogTitle}
      description={copy.candidateDialogDescription}
      locked={locked}
      initialFocusRef={inputRef}
      onRequestClose={onClose}
      maxWidthClassName="max-w-3xl"
    >
      <div className="mt-5 space-y-4">
        <form onSubmit={search} className="flex flex-wrap gap-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t.admin.search}</span>
            <input
              ref={inputRef}
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              maxLength={100}
              disabled={locked}
              placeholder={copy.candidateSearchPlaceholder}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <button
            type="submit"
            disabled={locked}
            className="cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.admin.search}
          </button>
          {query ? (
            <button
              type="button"
              onClick={() => {
                setDraftQuery('');
                setQuery('');
                setPage(1);
              }}
              disabled={locked}
              className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.admin.clear}
            </button>
          ) : null}
        </form>

        {error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null}
        {isLoading ? <p role="status" className="py-8 text-center text-fg-muted">{copy.loading}</p> : (
          <div className="max-h-[min(50vh,30rem)] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[760px] text-left">
              <thead className="sticky top-0 bg-surface-raised"><tr className="border-b border-line text-sm text-fg-muted"><th scope="col" className="px-4 py-3">{t.admin.name}</th><th scope="col" className="px-4 py-3">{t.admin.email}</th><th scope="col" className="px-4 py-3">{t.admin.role}</th><th scope="col" className="px-4 py-3">{t.admin.status}</th><th scope="col" className="px-4 py-3 text-right">{copy.actions}</th></tr></thead>
              <tbody>
                {result?.candidates.map((candidate) => (
                  <tr
                    key={candidate.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3 font-semibold">
                      {candidate.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">
                      {candidate.email}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {candidate.adminAttribute === 'admin'
                        ? t.auth.roleAdmin
                        : t.auth.roleUser}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge banned={candidate.banned} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void assign(candidate)}
                        disabled={locked}
                        className="cursor-pointer rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {copy.assign}
                      </button>
                    </td>
                  </tr>
                ))}
                {result?.candidates.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">{copy.noCandidates}</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
        {result && result.totalPages > 1 ? (
          <DirectoryPagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={setPage}
            disabled={locked}
          />
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.cancel}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

function StatusBadge({ banned }: { banned: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        banned
          ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-200'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200'
      }`}
    >
      {banned
        ? t.admin.userManagement.suspended
        : t.admin.userManagement.active}
    </span>
  );
}

function DirectoryPagination({
  page,
  totalPages,
  onChange,
  disabled = false,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t.admin.page}
      className="flex items-center justify-between gap-4"
    >
      <span className="text-sm text-fg-muted">
        {t.admin.page} {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={disabled || page <= 1}
          className="cursor-pointer rounded-md border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.admin.previous}
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className="cursor-pointer rounded-md border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.admin.next}
        </button>
      </div>
    </nav>
  );
}
