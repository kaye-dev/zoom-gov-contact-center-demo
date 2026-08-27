"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatAdminDateTime } from "../date-format";
import { useI18n } from "../../i18n/LanguageProvider";

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
}: {
  requests: ResetRequest[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [issuedPassword, setIssuedPassword] = useState<IssuedPassword | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const review = async (request: ResetRequest, action: "approve" | "reject") => {
    setError(null);
    setIssuedPassword(null);
    setPendingId(request.id);

    const response = await fetch(
      `/api/admin/password-reset-requests/${request.id}/${action}`,
      {
        method: "POST",
      },
    );

    setPendingId(null);

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
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.admin.passwordResets}</h1>
        <p className="text-sm text-fg-muted">{t.auth.forgotPasswordDescription}</p>
      </div>

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
        <table className="min-w-full divide-y divide-line-subtle text-sm">
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
              <th className="px-4 py-3 text-left font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {requests.map((request) => (
              <tr key={request.id}>
                <td className="px-4 py-3">{request.email}</td>
                <td className="px-4 py-3">{request.user?.name ?? "-"}</td>
                <td className="px-4 py-3">{getStatusLabel(request.status, t)}</td>
                <td className="px-4 py-3">
                  {formatAdminDateTime(request.requestedAt, locale)}
                </td>
                <td className="px-4 py-3">
                  {request.reviewedAt
                    ? formatAdminDateTime(request.reviewedAt, locale)
                    : "-"}
                </td>
                <td className="px-4 py-3">
                  {request.status === "PENDING" ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => review(request, "approve")}
                        disabled={pendingId === request.id}
                        className="cursor-pointer rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.admin.approve}
                      </button>
                      <button
                        type="button"
                        onClick={() => review(request, "reject")}
                        disabled={pendingId === request.id}
                        className="cursor-pointer rounded-md border border-line px-3 py-2 text-xs font-semibold transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.admin.reject}
                      </button>
                    </div>
                  ) : null}
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
