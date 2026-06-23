"use client";

import Link from "next/link";

import { useI18n } from "../../i18n/LanguageProvider";
import { formatAdminDateTime } from "../date-format";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  mustChangePassword: boolean;
  createdAt: string;
};

type UsersViewProps = {
  users: UserRow[];
  search: string;
  page: number;
  totalPages: number;
};

export function UsersView({ users, search, page, totalPages }: UsersViewProps) {
  const { t, locale } = useI18n();
  const previousHref = getPageHref(search, page - 1);
  const nextHref = getPageHref(search, page + 1);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.admin.userListTitle}</h1>
          <p className="text-sm text-fg-muted">
            {t.admin.page} {page} / {totalPages}
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-900"
        >
          {t.admin.newUser}
        </Link>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row" action="/admin/users">
        <input
          name="search"
          defaultValue={search}
          placeholder={t.admin.searchPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-md border border-line bg-surface-raised px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover"
        >
          {t.admin.search}
        </button>
        <Link
          href="/admin/users"
          className="rounded-md border border-line px-4 py-2 text-center text-sm font-semibold transition-colors hover:bg-surface-hover"
        >
          {t.admin.clear}
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="min-w-full divide-y divide-line-subtle text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.name}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.email}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.role}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.mustChangePassword}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.createdAt}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {users.map((user) => (
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
                  {formatAdminDateTime(user.createdAt, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">
            {t.admin.noUsers}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        {page > 1 ? (
          <Link
            href={previousHref}
            className="rounded-md border border-line px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover"
          >
            {t.admin.previous}
          </Link>
        ) : (
          <span />
        )}
        {page < totalPages ? (
          <Link
            href={nextHref}
            className="rounded-md border border-line px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover"
          >
            {t.admin.next}
          </Link>
        ) : (
          <span />
        )}
      </div>
    </section>
  );
}

function getPageHref(search: string, page: number) {
  const params = new URLSearchParams();

  if (search) {
    params.set("search", search);
  }

  params.set("page", String(page));

  return `/admin/users?${params.toString()}`;
}
