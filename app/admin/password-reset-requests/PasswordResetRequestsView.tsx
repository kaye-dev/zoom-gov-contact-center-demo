"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { TableRowActions } from "@/app/components/admin/TableRowActions";
import { captureRowActionFocus, createRowActionSubmissionGuard } from "@/app/components/admin/table-row-actions";

import { formatAdminDateTime } from "../date-format";
import { useI18n } from "../../i18n/LanguageProvider";
import { AdminSectionNavigation } from "../AdminSectionNavigation";

type ResetStatus = "PENDING" | "APPROVED" | "REJECTED" | "CONSUMED";

type ResetRequest = {
  id: string;
  email: string;
  status: ResetStatus;
  requestedAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type IssuedPassword = {
  email: string;
  temporaryPassword: string;
};

export function PasswordResetRequestsView({
  requests,
  canUpdate,
}: {
  requests: ResetRequest[];
  canUpdate: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [issuedPassword, setIssuedPassword] = useState<IssuedPassword | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const reviewingRef = useRef(createRowActionSubmissionGuard());

  const review = async (request: ResetRequest, action: "approve" | "reject", trigger: HTMLButtonElement) => {
    if (!canUpdate || request.status !== "PENDING" || !reviewingRef.current.begin(request.id)) return;
    let success = false;
    const restoreFocus = captureRowActionFocus(trigger);
    try {
      setError(null);
      setIssuedPassword(null);
      setPendingId(request.id);

      const response = await fetch(
        `/api/admin/password-reset-requests/${request.id}/${action}`,
        {
          method: "POST",
        },
      );

      const body = (await response.json().catch(() => null)) as
        | { temporaryPassword?: string; error?: string }
        | null;

      if (!response.ok) {
        setError(body?.error ?? t.auth.error);
        return;
      }

      if (action === "approve" && body?.temporaryPassword) {
        setIssuedPassword({
          email: request.user?.email ?? request.email,
          temporaryPassword: body.temporaryPassword,
        });
      }

      router.refresh();
      success = true;
      restoreFocus(true);
    } catch {
      setError(t.auth.error);
    } finally {
      reviewingRef.current.end(request.id, success);
      setPendingId((current) => current === request.id ? null : current);
    }
  };

  return (
    <section data-row-action-region className="min-w-0">
      <div data-admin-page-chrome className="space-y-4">
        <div data-admin-page-header>
          <h1 data-row-action-heading tabIndex={-1} className="text-2xl font-bold">{t.admin.passwordResets}</h1>
          <p className="text-sm text-fg-muted">
            {t.auth.forgotPasswordDescription}
          </p>
        </div>
        <AdminSectionNavigation />
      </div>

      <div data-admin-page-body className="mt-6 space-y-6">
      {issuedPassword ? (
        <div className="rounded-lg border border-accent/40 bg-surface-accent-subtle p-4 text-fg">
          <h2 className="text-lg font-bold">{t.admin.issuedPasswordTitle}</h2>
          <p className="mt-1 text-sm">{t.admin.issuedPasswordDescription}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="font-semibold">{t.auth.email}</dt>
              <dd>{issuedPassword.email}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.auth.temporaryPassword}</dt>
              <dd className="mt-1 rounded-md bg-surface-raised px-3 py-2 font-mono text-base text-fg">
                {issuedPassword.temporaryPassword}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[880px] divide-y divide-line-subtle text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.email}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.name}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.status}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.requestedAt}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {t.admin.reviewedAt}
              </th>
              <th className="px-4 py-3 text-center font-semibold">{t.admin.userManagement.settings}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {requests.map((request) => (
              <tr key={request.id}>
                <td className="whitespace-nowrap px-4 py-3">{request.email}</td>
                <td className="whitespace-nowrap px-4 py-3">{request.user?.name ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-3">{getStatusLabel(request.status, t)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatAdminDateTime(request.requestedAt, locale)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {request.reviewedAt
                    ? formatAdminDateTime(request.reviewedAt, locale)
                    : "-"}
                </td>
                <td className="px-4 py-3 text-center">
                  <TableRowActions
                    label={`${t.admin.userManagement.actionsFor}: ${request.user?.name ?? request.email}`}
                    open={openRowId === request.id}
                    onOpenChange={(open) => setOpenRowId(open ? request.id : null)}
                    items={request.status === "PENDING" && canUpdate ? [
                      { id: "approve", label: t.admin.approve, disabled: pendingId === request.id,
                        disabledReason: pendingId === request.id ? t.admin.settings.saving : undefined,
                        onSelect: (trigger) => void review(request, "approve", trigger) },
                      { id: "reject", label: t.admin.reject, disabled: pendingId === request.id,
                        disabledReason: pendingId === request.id ? t.admin.settings.saving : undefined,
                        onSelect: (trigger) => void review(request, "reject", trigger) },
                    ] : []}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {requests.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">
            {t.admin.noResetRequests}
          </p>
        ) : null}
      </div>
      </div>
    </section>
  );
}

function getStatusLabel(
  status: ResetStatus,
  t: ReturnType<typeof useI18n>["t"],
) {
  const labels = {
    PENDING: t.admin.pending,
    APPROVED: t.admin.approved,
    REJECTED: t.admin.rejected,
    CONSUMED: t.admin.consumed,
  };

  return labels[status];
}
