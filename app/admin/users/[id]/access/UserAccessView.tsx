"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Checkbox } from "@/app/components/Checkbox";
import { getAdminRoleDisplayName } from "@/app/components/admin/role-display";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type {
  AdminAccessDecision,
  AdminResourceKey,
} from "@/lib/admin-access/types";

import { AdminSectionNavigation } from "../../../AdminSectionNavigation";

type UserAccessSummary = {
  user: {
    id: string;
    name: string;
    email: string;
    adminAttribute: "admin" | "user";
    banned: boolean;
    assignmentRevision: number;
  };
  assignedRoles: Array<{
    id: string;
    name: string;
    description: string | null;
    systemKey: "FULL_ACCESS" | "NO_ACCESS" | null;
    revision: number;
    memberCount: number;
  }>;
  resources: Array<{
    resourceKey: AdminResourceKey;
    displayPaths: string[];
    actions: AdminAccessDecision[];
  }>;
};

export function UserAccessView({ summary }: { summary: UserAccessSummary }) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  const assignedRole = summary.assignedRoles[0] ?? null;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = copy.userAccessPageTitle;

    return () => {
      document.title = previousTitle;
    };
  }, [copy.userAccessPageTitle]);

  return (
    <section
      className="min-w-0"
      aria-labelledby="access-heading"
    >
      <div data-admin-page-chrome className="space-y-4">
        <div
          data-admin-page-header
          className="mx-auto max-w-6xl space-y-6"
        >
          <Link
            href={`/admin/users/${encodeURIComponent(summary.user.id)}`}
            className="inline-flex text-sm font-semibold text-accent transition-colors hover:text-primary-700 dark:hover:text-primary-300"
          >
            ← {copy.backToUserDetails}
          </Link>
          <div className="space-y-2">
            <h1 id="access-heading" className="text-2xl font-bold">
              {copy.userAccessHeading.replace("{name}", summary.user.name)}
            </h1>
            <p className="text-sm leading-6 text-fg-muted">
              {copy.userAccessDescription}
            </p>
          </div>
        </div>
        <AdminSectionNavigation />
      </div>

      <div data-admin-page-body className="mx-auto mt-6 max-w-6xl space-y-6">
      <dl className="grid gap-4 rounded-lg border border-line bg-surface-raised p-5 shadow-sm sm:grid-cols-3">
        <div>
          <dt className="text-sm font-semibold text-fg-muted">{t.admin.email}</dt>
          <dd className="mt-1 break-all font-medium">{summary.user.email}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-fg-muted">{t.admin.role}</dt>
          <dd className="mt-1 font-medium">
            {summary.user.adminAttribute === "admin"
              ? t.auth.roleAdmin
              : t.auth.roleUser}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-fg-muted">
            {t.admin.userManagement.accessRoles}
          </dt>
          <dd className="mt-1 font-medium">
            {assignedRole ? getAdminRoleDisplayName(assignedRole, copy) : null}
            {!assignedRole ? (
              <span className="text-sm text-fg-muted">
                {copy.noAssignedRoles}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[980px] divide-y divide-line-subtle text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                {copy.adminPageColumn}
              </th>
              {(["VIEW", "CREATE", "UPDATE", "DELETE"] as const).map(
                (action) => (
                  <th
                    key={action}
                    scope="col"
                    className="w-28 px-3 py-3 text-center font-semibold"
                  >
                    {copy.actionLabels[action]}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {summary.resources.map((resource) => (
              <tr key={resource.resourceKey}>
                <th
                  scope="row"
                  className="px-4 py-4 text-left align-top font-normal"
                >
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
                      <code
                        key={path}
                        className="mr-2 inline-block break-all"
                      >
                        {path}
                      </code>
                    ))}
                  </div>
                </th>
                {resource.actions.map((decision) => {
                  const actionLabel = copy.actionLabels[decision.action];
                  const resultLabel = decision.allowed ? copy.allowed : copy.denied;
                  return (
                    <td
                      key={decision.action}
                      className="px-3 py-4 text-center align-top"
                    >
                      <Checkbox
                        indeterminate={!decision.supported}
                        checked={decision.supported && decision.allowed}
                        disabled
                        aria-label={`${copy.resourceTitles[resource.resourceKey]} / ${actionLabel}: ${decision.supported ? resultLabel : copy.unsupported}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </section>
  );
}
