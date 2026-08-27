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
  const [role, setRole] = useState(initialRole);
  const [section, setSection] = useState<"settings" | "members">("settings");
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [matrix, setMatrix] = useState(role.matrix);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
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

  const setEffect = (
    resourceKey: AdminResourceKey,
    action: AdminAccessAction,
    effect: AdminAccessEffect,
    checked: boolean,
  ) => {
    setMatrix((current) =>
      current.map((resource) =>
        resource.resourceKey !== resourceKey
          ? resource
          : {
              ...resource,
              actions: resource.actions.map((cell) =>
                cell.action !== action
                  ? cell
                  : { ...cell, effect: checked ? effect : null },
              ),
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
    setFeedback(null);
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
        setFeedback(
          body?.error === "ROLE_NAME_CONFLICT"
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
      setFeedback(copy.genericError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <Link href="/admin/roles" className="font-semibold text-accent hover:underline">
        ← {copy.backToRoles}
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        {isEditingMetadata ? (
          <form onSubmit={saveMetadata} className="grid w-full max-w-2xl gap-4">
            <label className="space-y-2 text-sm font-semibold">
              <span>{copy.roleName}</span>
              <input required maxLength={64} value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} className="w-full rounded-md border border-line bg-surface px-3 py-2 font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </label>
            <label className="space-y-2 text-sm font-semibold">
              <span>{copy.descriptionOptional}</span>
              <textarea rows={3} maxLength={100} value={description} onChange={(event) => setDescription(event.target.value)} disabled={isSaving} className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setIsEditingMetadata(false)} disabled={isSaving} className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">{copy.cancel}</button>
              <button type="submit" disabled={isSaving} className="cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? copy.saving : copy.save}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{displayName}</h1>
              {role.systemKey ? <span className="rounded-full bg-surface-accent-subtle px-2 py-1 text-xs font-semibold text-accent">{copy.systemRole}</span> : null}
              {editable ? (
                <button type="button" onClick={() => setIsEditingMetadata(true)} aria-label={`${copy.edit}: ${displayName}`} className="cursor-pointer rounded-md p-2 text-fg-muted hover:bg-surface-hover hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <EditSquareIcon className="h-5 w-5" />
                </button>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-fg-muted">{displayDescription ?? "—"}</p>
          </div>
        )}
      </div>

      <nav role="tablist" aria-label={copy.listTitle} className="flex gap-6 border-b border-line">
        <button id="role-settings-tab" role="tab" type="button" tabIndex={section === "settings" ? 0 : -1} onClick={() => selectSection("settings")} onKeyDown={handleTabKeyDown} aria-selected={section === "settings"} aria-controls="role-settings-panel" className={`cursor-pointer border-b-2 px-1 py-3 font-semibold ${section === "settings" ? "border-accent text-accent" : "border-transparent text-fg-muted"}`}>{copy.settingsTab}</button>
        {canViewMembers ? (
          <button id="role-members-tab" role="tab" type="button" tabIndex={section === "members" ? 0 : -1} onClick={() => selectSection("members")} onKeyDown={handleTabKeyDown} aria-selected={section === "members"} aria-controls="role-members-panel" className={`cursor-pointer border-b-2 px-1 py-3 font-semibold ${section === "members" ? "border-accent text-accent" : "border-transparent text-fg-muted"}`}>{copy.membersTab}</button>
        ) : null}
      </nav>

      {feedback ? <p role={feedback === copy.saved ? "status" : "alert"} className="rounded-md border border-line bg-surface-raised px-4 py-3 text-sm">{feedback}</p> : null}

      {section === "settings" ? (
        <div id="role-settings-panel" role="tabpanel" aria-labelledby="role-settings-tab" className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-xl font-bold">{copy.adminPageAccessTitle}</h2>
            <p className="max-w-4xl text-sm leading-6 text-fg-muted">{copy.adminPageAccessDescription}</p>
          </div>
          <PermissionMatrix matrix={matrix} editable={editable && !isSaving} onChange={setEffect} />
          {editable ? (
            <div className="flex justify-end">
              <button type="button" onClick={savePermissions} disabled={!changed || isSaving} className="cursor-pointer rounded-md bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? copy.saving : copy.save}</button>
            </div>
          ) : null}
        </div>
      ) : canViewMembers ? (
        <div id="role-members-panel" role="tabpanel" aria-labelledby="role-members-tab">
          <MembersPanel
            roleId={role.id}
            memberCount={role.memberCount}
            currentUserId={currentUserId}
            canManageMembers={canManageMembers}
            onMemberCountChange={handleMemberCountChange}
          />
        </div>
      ) : null}
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
  onChange: (resourceKey: AdminResourceKey, action: AdminAccessAction, effect: AdminAccessEffect, checked: boolean) => void;
}) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  return (
    <div className="overflow-x-auto border-y border-line bg-surface-raised">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line text-fg-muted">
            <th scope="col" className="w-[38%] px-4 py-3 font-semibold">
              {copy.adminPageColumn}
            </th>
            {(["VIEW", "CREATE", "UPDATE", "DELETE"] as const).map(
              (action) => (
                <th
                  key={action}
                  scope="col"
                  className="w-[15.5%] px-3 py-3 text-center font-semibold"
                >
                  {copy.actionLabels[action]}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {matrix.map((resource) => (
            <tr
              key={resource.resourceKey}
              className="border-b border-line last:border-b-0"
            >
              <th scope="row" className="px-4 py-4 align-top font-normal">
                <span className="block font-semibold text-fg">
                  {copy.resourceTitles[resource.resourceKey]}
                </span>
                <span className="mt-1 block text-xs leading-5 text-fg-muted">
                  {copy.resourceDescriptions[resource.resourceKey]}
                </span>
                <span className="mt-1 block break-all text-xs text-fg-muted">
                  <span className="font-semibold">{copy.path}:</span>{" "}
                  {resource.displayPaths.join(", ")}
                </span>
              </th>
              {resource.actions.map((cell) => {
                const unsupportedId = `${resource.resourceKey}-${cell.action}-unsupported`;
                const cellLabel = `${copy.resourceTitles[resource.resourceKey]} / ${copy.actionLabels[cell.action]}`;
                return (
                  <td key={cell.action} className="px-3 py-4 align-top">
                    <fieldset
                      disabled={!editable || !cell.supported}
                      aria-describedby={!cell.supported ? unsupportedId : undefined}
                      className="mx-auto w-fit min-w-24 space-y-2"
                    >
                      <legend className="sr-only">{cellLabel}</legend>
                      <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap has-[:disabled]:cursor-not-allowed">
                        <input
                          type="checkbox"
                          checked={cell.supported && cell.effect === "ALLOW"}
                          onChange={(event) =>
                            onChange(
                              resource.resourceKey,
                              cell.action,
                              "ALLOW",
                              event.target.checked,
                            )
                          }
                          aria-label={`${cellLabel}: ${copy.allow}`}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
                        />
                        <span>{copy.allow}</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap has-[:disabled]:cursor-not-allowed">
                        <input
                          type="checkbox"
                          checked={cell.supported && cell.effect === "DENY"}
                          onChange={(event) =>
                            onChange(
                              resource.resourceKey,
                              cell.action,
                              "DENY",
                              event.target.checked,
                            )
                          }
                          aria-label={`${cellLabel}: ${copy.deny}`}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
                        />
                        <span>{copy.deny}</span>
                      </label>
                    </fieldset>
                    {!cell.supported ? (
                      <p id={unsupportedId} className="mt-2 text-center text-xs text-fg-muted">
                        {copy.unsupported}
                      </p>
                    ) : cell.effect === null ? (
                      <p className="mt-2 text-center text-xs text-fg-muted">
                        {copy.unset}
                      </p>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
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
            roleIds: member.assignedRoleIds.filter((id) => id !== roleId),
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
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="text-xl font-bold">{copy.membersTab}</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {memberCount} {copy.memberCount}
          </p>
        </div>
        {canManageMembers ? (
          <button type="button" onClick={() => setIsCandidateOpen(true)} className="cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-900 sm:ml-auto">+ {copy.assignUsers}</button>
        ) : null}
      </div>

      <div>
        <form onSubmit={search} className="flex min-w-0 flex-wrap gap-3">
          <label className="min-w-0 flex-1 sm:max-w-md">
            <span className="sr-only">{t.admin.search}</span>
            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              maxLength={100}
              placeholder={copy.memberSearchPlaceholder}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <button type="submit" className="cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-900">{t.admin.search}</button>
          {query ? (
            <button type="button" onClick={() => { setDraftQuery(""); setQuery(""); setPage(1); }} className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover">{t.admin.clear}</button>
          ) : null}
        </form>
      </div>

      {error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null}
      {isLoading ? <p role="status" className="py-8 text-center text-fg-muted">{copy.loading}</p> : (
        <div className="overflow-x-auto border-y border-line bg-surface-raised">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead><tr className="border-b border-line text-fg-muted"><th scope="col" className="px-4 py-3">{t.admin.name}</th><th scope="col" className="px-4 py-3">{t.admin.email}</th><th scope="col" className="px-4 py-3">{t.admin.role}</th><th scope="col" className="px-4 py-3">{t.admin.status}</th><th scope="col" className="px-4 py-3 text-right">{copy.actions}</th></tr></thead>
            <tbody>
              {result?.members.map((member) => (
                <tr key={member.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/admin/users/${encodeURIComponent(member.id)}`} className="text-accent hover:underline">{member.name}</Link></td>
                  <td className="px-4 py-3 text-fg-muted">{member.email}</td>
                  <td className="px-4 py-3">{member.adminAttribute === "admin" ? t.auth.roleAdmin : t.auth.roleUser}</td>
                  <td className="px-4 py-3"><StatusBadge banned={member.banned} /></td>
                  <td className="px-4 py-3 text-right">
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
            roleIds:
              roleId === "system-no-access"
                ? [roleId]
                : [
                    ...new Set([
                      ...candidate.assignedRoleIds.filter(
                        (assignedRoleId) =>
                          assignedRoleId !== "system-no-access",
                      ),
                      roleId,
                    ]),
                  ],
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

  return (
    <ModalDialog
      title={copy.candidateDialogTitle}
      description={copy.candidateDialogDescription}
      locked={pendingUserId !== null}
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
              placeholder={copy.candidateSearchPlaceholder}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <button type="submit" disabled={pendingUserId !== null} className="cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50">{t.admin.search}</button>
          {query ? <button type="button" onClick={() => { setDraftQuery(""); setQuery(""); setPage(1); }} disabled={pendingUserId !== null} className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">{t.admin.clear}</button> : null}
        </form>

        {error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null}
        {isLoading ? <p role="status" className="py-8 text-center text-fg-muted">{copy.loading}</p> : (
          <div className="max-h-[min(50vh,30rem)] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[760px] text-left">
              <thead className="sticky top-0 bg-surface-raised"><tr className="border-b border-line text-sm text-fg-muted"><th scope="col" className="px-4 py-3">{t.admin.name}</th><th scope="col" className="px-4 py-3">{t.admin.email}</th><th scope="col" className="px-4 py-3">{t.admin.role}</th><th scope="col" className="px-4 py-3">{t.admin.status}</th><th scope="col" className="px-4 py-3 text-right">{copy.actions}</th></tr></thead>
              <tbody>
                {result?.candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-semibold">{candidate.name}</td>
                    <td className="px-4 py-3 text-sm text-fg-muted">{candidate.email}</td>
                    <td className="px-4 py-3 text-sm">{candidate.adminAttribute === "admin" ? t.auth.roleAdmin : t.auth.roleUser}</td>
                    <td className="px-4 py-3"><StatusBadge banned={candidate.banned} /></td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => void assign(candidate)} disabled={pendingUserId !== null} className="cursor-pointer rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50">{copy.assign}</button></td>
                  </tr>
                ))}
                {result?.candidates.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">{copy.noCandidates}</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
        {result && result.totalPages > 1 ? <DirectoryPagination page={result.page} totalPages={result.totalPages} onChange={setPage} /> : null}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={pendingUserId !== null} className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">{copy.cancel}</button>
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
          ? "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200"
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
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  return (
    <nav aria-label={t.admin.page} className="flex items-center justify-center gap-3">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">{t.admin.previous}</button>
      <span className="text-sm text-fg-muted">{t.admin.page} {page} / {totalPages}</span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="cursor-pointer rounded-md border border-line px-4 py-2 font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">{t.admin.next}</button>
    </nav>
  );
}
