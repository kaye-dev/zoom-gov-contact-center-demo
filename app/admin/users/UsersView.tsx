"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { Pagination } from "@/app/components/admin/Pagination";
import { SearchInput } from "@/app/components/admin/SearchInput";
import { MoreHorizIcon } from "@/app/components/svg/MoreHorizIcon";
import type { AdminUserErrorCode } from "@/lib/admin-users";

import { useI18n } from "../../i18n/LanguageProvider";
import { AdminSectionNavigation } from "../AdminSectionNavigation";
import { formatAdminDateTime } from "../date-format";
import { ConfirmationDialog } from "./ConfirmationDialog";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  mustChangePassword: boolean;
  createdAt: string;
};

type UsersViewProps = {
  users: UserRow[];
  search: string;
  page: number;
  total: number;
  totalPages: number;
  currentUserId: string;
  activeAdminCount: number;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

type UserAction = "suspend" | "reactivate" | "delete";

type PendingAction = {
  action: UserAction;
  user: UserRow;
};

export function UsersView({
  users,
  search,
  page,
  total,
  totalPages,
  currentUserId,
  activeAdminCount,
  canCreate,
  canUpdate,
  canDelete,
}: UsersViewProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const previousHref = getPageHref(search, page - 1);
  const nextHref = getPageHref(search, page + 1);
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [queryState, setQueryState] = useState(() => ({
    source: search,
    value: search,
  }));
  const [isComposing, setIsComposing] = useState(false);
  if (queryState.source !== search) {
    setQueryState({
      source: search,
      value:
        queryState.value === queryState.source || queryState.value === search
          ? search
          : queryState.value,
    });
  }
  const query = queryState.value;
  const normalizedQuery = query.trim();
  const isFiltering = !isComposing && normalizedQuery !== search;

  useEffect(() => {
    if (isComposing || normalizedQuery === search) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete("page");
      if (normalizedQuery) params.set("search", normalizedQuery);
      else params.delete("search");
      const nextQuery = params.toString();
      router.replace(nextQuery ? `/admin/users?${nextQuery}` : "/admin/users");
    }, 200);

    return () => window.clearTimeout(timer);
  }, [isComposing, normalizedQuery, router, search]);

  const closeDialog = useCallback(() => {
    if (isSubmitting) return;
    setPendingAction(null);
    setDialogError(null);
  }, [isSubmitting]);

  const confirmAction = async () => {
    if (!pendingAction || isSubmitting) return;

    setIsSubmitting(true);
    setDialogError(null);
    const { action, user } = pendingAction;
    const response = await fetch(getActionEndpoint(user.id, action), {
      method: action === "delete" ? "DELETE" : "POST",
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setDialogError(getLocalizedError(body?.error, t.admin.userManagement.errors));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setPendingAction(null);
    if (action === "delete" && users.length === 1 && page > 1) {
      router.push(previousHref);
      return;
    }
    router.refresh();
  };

  const confirmation = pendingAction
    ? getConfirmationCopy(pendingAction.action, t.admin.userManagement)
    : null;

  return (
    <section>
      <div data-admin-page-chrome className="space-y-4">
        <div
          data-admin-page-header
          className="flex flex-wrap items-start gap-3"
        >
          <h1
            id="users-heading"
            className="whitespace-nowrap text-xl font-bold leading-7"
          >
            {t.admin.userListTitle}
          </h1>
          {canCreate ? (
            <Link
              href="/admin/users/new"
              className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-900"
            >
              {t.admin.createUserAction}
            </Link>
          ) : null}
        </div>
        <AdminSectionNavigation />
      </div>

      <div data-admin-page-body className="mt-6 space-y-6">
        <div role="search">
          <SearchInput
            id="admin-user-search"
            name="search"
            label={t.admin.searchPlaceholder}
            placeholder={t.admin.searchPlaceholder}
            value={query}
            aria-describedby="admin-user-filter-status"
            autoComplete="off"
            onChange={(event) =>
              setQueryState((current) => ({
                ...current,
                value: event.target.value,
              }))
            }
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(event) => {
              setQueryState((current) => ({
                ...current,
                value: event.currentTarget.value,
              }));
              setIsComposing(false);
            }}
          />
        </div>
        <p
          id="admin-user-filter-status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {t.admin.userListTitle}: {total}
        </p>

        <div
          data-admin-user-results
          aria-busy={isFiltering}
          className="space-y-6"
        >
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[960px] divide-y divide-line-subtle text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                {t.admin.name}
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                {t.admin.email}
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                {t.admin.role}
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                {t.admin.mustChangePassword}
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                {t.admin.status}
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                {t.admin.createdAt}
              </th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">
                {t.admin.userManagement.settings}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {users.map((user) => {
              const protectionReason = getProtectionReason({
                user,
                currentUserId,
                activeAdminCount,
                selfProtected: t.admin.userManagement.selfProtected,
                lastAdminProtected: t.admin.userManagement.lastAdminProtected,
              });

              return (
                <tr key={user.id}>
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.role === "admin" ? t.auth.roleAdmin : t.auth.roleUser}
                  </td>
                  <td className="px-4 py-3">
                    {user.mustChangePassword ? t.auth.required : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <UserStatusBadge banned={user.banned} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatAdminDateTime(user.createdAt, locale)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <UserActionsMenu
                      user={user}
                      isOpen={openMenuUserId === user.id}
                      protectionReason={protectionReason}
                      canUpdate={canUpdate}
                      canDelete={canDelete}
                      onOpenChange={(open) =>
                        setOpenMenuUserId(open ? user.id : null)
                      }
                      onAction={(action) => {
                        setOpenMenuUserId(null);
                        setDialogError(null);
                        setPendingAction({ action, user });
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">
            {t.admin.noUsers}
          </p>
        ) : null}
      </div>

        {totalPages > 1 ? (
          <div id="admin-user-pagination">
            <Pagination
              page={page}
              totalPages={totalPages}
              previousHref={previousHref}
              nextHref={nextHref}
              ariaLabel={t.admin.paginationLabel}
              previousLabel={t.admin.previous}
              nextLabel={t.admin.next}
            />
          </div>
        ) : null}
        </div>

        {pendingAction && confirmation ? (
        <ConfirmationDialog
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={
            isSubmitting ? t.admin.userManagement.saving : confirmation.confirm
          }
          cancelLabel={t.admin.userManagement.cancel}
          isSubmitting={isSubmitting}
          error={dialogError}
          danger={pendingAction.action !== "reactivate"}
          onClose={closeDialog}
          onConfirm={confirmAction}
        >
          <dl className="mt-4 rounded-lg bg-surface px-4 py-3 text-sm">
            <dt className="font-semibold text-fg-muted">
              {t.admin.userManagement.targetUser}
            </dt>
            <dd className="mt-1 font-semibold">{pendingAction.user.name}</dd>
            <dd className="break-all text-fg-muted">{pendingAction.user.email}</dd>
          </dl>
        </ConfirmationDialog>
        ) : null}
      </div>
    </section>
  );
}

function UserStatusBadge({ banned }: { banned: boolean | null }) {
  const { t } = useI18n();
  const suspended = banned === true;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
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

function UserActionsMenu({
  user,
  isOpen,
  protectionReason,
  canUpdate,
  canDelete,
  onOpenChange,
  onAction,
}: {
  user: UserRow;
  isOpen: boolean;
  protectionReason: string | null;
  canUpdate: boolean;
  canDelete: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: UserAction) => void;
}) {
  const { t } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const focusFirstItem = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });
    const close = () => onOpenChange(false);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.cancelAnimationFrame(focusFirstItem);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [isOpen, onOpenChange]);

  const toggleMenu = () => {
    if (isOpen) {
      onOpenChange(false);
      return;
    }

    const trigger = buttonRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 132;
    const margin = 8;
    const openAbove = window.innerHeight - rect.bottom < menuHeight + margin;
    setMenuStyle({
      left: Math.min(
        window.innerWidth - menuWidth - margin,
        Math.max(margin, rect.right - menuWidth),
      ),
      top: openAbove ? rect.top - menuHeight - 4 : rect.bottom + 4,
      width: menuWidth,
    });
    onOpenChange(true);
  };

  const menu = isOpen && menuStyle ? (
    <ul
      ref={menuRef}
      role="menu"
      aria-label={`${t.admin.userManagement.actionsFor}: ${user.name}`}
      style={menuStyle}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (
          !menuRef.current?.contains(next) &&
          !buttonRef.current?.contains(next)
        ) {
          onOpenChange(false);
        }
      }}
      className="fixed z-[70] overflow-hidden rounded-lg border border-line bg-surface-raised py-1 text-left shadow-xl"
    >
      <li role="none">
        <Link
          href={`/admin/users/${encodeURIComponent(user.id)}`}
          role="menuitem"
          onClick={() => onOpenChange(false)}
          className="block px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover hover:text-accent focus:bg-surface-hover focus:outline-none"
        >
          {t.admin.userManagement.edit}
        </Link>
      </li>
      {canUpdate ? (
        <li role="none">
          <button
          type="button"
          role="menuitem"
          disabled={user.banned !== true && protectionReason !== null}
          title={user.banned !== true ? protectionReason ?? undefined : undefined}
          onClick={() =>
            onAction(user.banned === true ? "reactivate" : "suspend")
          }
          className="w-full cursor-pointer px-4 py-2 text-left text-sm font-semibold text-fg transition-colors hover:bg-surface-hover hover:text-accent focus:bg-surface-hover focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-fg"
        >
          {user.banned === true
            ? t.admin.userManagement.reactivate
            : t.admin.userManagement.suspend}
          </button>
        </li>
      ) : null}
      {canDelete ? (
        <li role="none">
          <button
          type="button"
          role="menuitem"
          disabled={protectionReason !== null}
          title={protectionReason ?? undefined}
          onClick={() => onAction("delete")}
          className="w-full cursor-pointer px-4 py-2 text-left text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-red-300 dark:hover:bg-red-950/50 dark:focus:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          {t.admin.userManagement.delete}
          </button>
        </li>
      ) : null}
    </ul>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${t.admin.userManagement.actionsFor}: ${user.name}`}
        onClick={toggleMenu}
        className="inline-flex cursor-pointer items-center justify-center rounded-md p-2 text-fg transition-colors hover:bg-surface-hover hover:text-accent"
      >
        <MoreHorizIcon className="h-6 w-6" />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function getProtectionReason({
  user,
  currentUserId,
  activeAdminCount,
  selfProtected,
  lastAdminProtected,
}: {
  user: UserRow;
  currentUserId: string;
  activeAdminCount: number;
  selfProtected: string;
  lastAdminProtected: string;
}) {
  if (user.id === currentUserId) return selfProtected;
  if (
    user.role === "admin" &&
    user.banned !== true &&
    activeAdminCount <= 1
  ) {
    return lastAdminProtected;
  }
  return null;
}

function getActionEndpoint(userId: string, action: UserAction) {
  const base = `/api/admin/users/${encodeURIComponent(userId)}`;
  return action === "delete" ? base : `${base}/${action}`;
}

function getConfirmationCopy(
  action: UserAction,
  copy: {
    suspendDialogTitle: string;
    suspendDialogDescription: string;
    reactivateDialogTitle: string;
    reactivateDialogDescription: string;
    deleteDialogTitle: string;
    deleteDialogDescription: string;
    suspend: string;
    reactivate: string;
    delete: string;
  },
) {
  if (action === "suspend") {
    return {
      title: copy.suspendDialogTitle,
      description: copy.suspendDialogDescription,
      confirm: copy.suspend,
    };
  }
  if (action === "reactivate") {
    return {
      title: copy.reactivateDialogTitle,
      description: copy.reactivateDialogDescription,
      confirm: copy.reactivate,
    };
  }
  return {
    title: copy.deleteDialogTitle,
    description: copy.deleteDialogDescription,
    confirm: copy.delete,
  };
}

export function getLocalizedError(
  code: string | undefined,
  errors: Record<AdminUserErrorCode, string>,
) {
  if (!code || !(code in errors)) {
    return errors.UPDATE_FAILED;
  }
  return errors[code as AdminUserErrorCode];
}

function getPageHref(search: string, page: number) {
  const params = new URLSearchParams();

  if (search) {
    params.set("search", search);
  }

  params.set("page", String(page));

  return `/admin/users?${params.toString()}`;
}
