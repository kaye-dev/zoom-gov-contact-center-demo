"use client";

import Link from "next/link";

import { AccessDecisionInfo } from "@/app/components/admin/AccessDecisionInfo";
import {
  getAdminRoleDisplayDescription,
  getAdminRoleDisplayName,
} from "@/app/components/admin/role-display";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type {
  AdminAccessDecision,
  AdminResourceKey,
} from "@/lib/admin-access/types";

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

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <Link href={`/admin/users/${encodeURIComponent(summary.user.id)}`} className="font-semibold text-accent hover:underline">
        ← {t.admin.userManagement.detailsTitle}
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {copy.userAccessHeading.replace("{name}", summary.user.name)}
        </h1>
        <p className="text-sm leading-6 text-fg-muted">{copy.userAccessDescription}</p>
      </div>

      <dl className="grid gap-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-fg-muted">{t.admin.email}</dt>
          <dd className="mt-1 break-all font-medium">{summary.user.email}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-fg-muted">{t.admin.role}</dt>
          <dd className="mt-1 font-medium">
            {summary.user.adminAttribute === "admin"
              ? t.auth.roleAdmin
              : t.auth.roleUser}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-fg-muted">{copy.assignedRoles}</dt>
          <dd className="mt-1">
            <ul className="flex flex-wrap gap-x-2 gap-y-1">
            {summary.assignedRoles.map((role) => {
              const description = getAdminRoleDisplayDescription(role, copy);
              return (
                <li key={role.id}>
                  <Link
                    href={`/admin/roles/${encodeURIComponent(role.id)}`}
                    title={description ?? undefined}
                    className="font-semibold text-accent hover:underline"
                  >
                    {getAdminRoleDisplayName(role, copy)}
                  </Link>
                </li>
              );
            })}
            </ul>
            {summary.assignedRoles.length === 0 ? <span className="text-sm text-fg-muted">{copy.noAssignedRoles}</span> : null}
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto border-y border-line bg-surface-raised">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-fg-muted">
              <th scope="col" className="w-[38%] px-4 py-3 font-semibold">
                {copy.adminPageColumn}
              </th>
              {(["VIEW", "CREATE", "UPDATE", "DELETE"] as const).map(
                (action) => (
                  <th key={action} scope="col" className="w-[15.5%] px-3 py-3 text-center font-semibold">
                    {copy.actionLabels[action]}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {summary.resources.map((resource) => (
              <tr key={resource.resourceKey} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-4 align-top font-normal">
                  <span className="block font-semibold text-fg">{copy.resourceTitles[resource.resourceKey]}</span>
                  <span className="mt-1 block text-xs leading-5 text-fg-muted">{copy.resourceDescriptions[resource.resourceKey]}</span>
                  <span className="mt-1 block break-all text-xs text-fg-muted"><span className="font-semibold">{copy.path}:</span> {resource.displayPaths.join(", ")}</span>
                </th>
                {resource.actions.map((decision) => {
                  const actionLabel = copy.actionLabels[decision.action];
                  const resultLabel = decision.allowed ? copy.allowed : copy.denied;
                  return (
                    <td key={decision.action} className="px-3 py-4 align-top text-center">
                      <div className="inline-flex items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          checked={decision.supported && decision.allowed}
                          disabled
                          aria-label={`${copy.resourceTitles[resource.resourceKey]} / ${actionLabel}: ${decision.supported ? resultLabel : copy.unsupported}`}
                          className="h-4 w-4 shrink-0 cursor-not-allowed accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                        {decision.supported ? (
                          <AccessDecisionInfo decision={decision} resourceLabel={copy.resourceTitles[resource.resourceKey]} actionLabel={actionLabel} />
                        ) : null}
                      </div>
                      <span className={`mt-1 block text-xs font-semibold ${decision.supported && decision.allowed ? "text-green-700 dark:text-green-300" : "text-fg-muted"}`}>
                        {decision.supported ? resultLabel : copy.unsupported}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
