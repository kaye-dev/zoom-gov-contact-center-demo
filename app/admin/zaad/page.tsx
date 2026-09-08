import { getSettingsReview } from "@/lib/server/admin-settings-review";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRequestTenant } from "@/lib/server/tenant";
import { withPrisma } from "@/lib/server/prisma";
import {
  outreachTenants,
  universityScope,
} from "@/lib/server/zaad/university/permissions";
import { admissionYears } from "@/lib/zaad/university/contracts";
import { UniversityZaadView } from "./UniversityZaadView";

export const metadata: Metadata = { title: "オートリーチ" };
import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";

import { ZaadView, type ZaadViewKey } from "./ZaadView";

export default async function ZaadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requireAdminAccess("zaad", "VIEW", "/admin/zaad");
  const query = await searchParams;
  const host = await getRequestTenant();
  if (
    Array.isArray(query.tenant) ||
    (query.tenant !== undefined &&
      query.tenant !== "univ" &&
      query.tenant !== "lg")
  )
    notFound();
  const tenantKey = query.tenant ?? host.key;
  const allowedTenants = await withPrisma((db) =>
    outreachTenants(db, actor),
  );
  if (!allowedTenants.includes(tenantKey)) notFound();
  const permissions = {
    create: canAdminAccess(actor, "zaad", "CREATE"),
    update: canAdminAccess(actor, "zaad", "UPDATE"),
    delete: canAdminAccess(actor, "zaad", "DELETE"),
  };
  if (tenantKey === "univ") {
    const scope = await withPrisma((db) =>
      universityScope(db, tenantKey, actor),
    );
    const now = new Date();
    const review = Boolean(await getSettingsReview("default"));
    return (
      <UniversityZaadView
        reviewState={review ? single(query.state) : undefined}
        reviewPurpose={review ? single(query.case) : undefined}
        permissions={permissions}
        departments={scope.departments}
        allowedTenants={allowedTenants}
        years={admissionYears(now)}
        serverDate={now.toISOString()}
      />
    );
  }
  const allowReview = process.env.NODE_ENV !== "production";
  const requestedView = allowReview
    ? (single(query.reviewView) ?? single(query.view))
    : single(query.view);
  const view = isZaadView(requestedView) ? requestedView : "residents";
  return (
    <ZaadView
      allowedTenants={allowedTenants}
      initialView={view}
      reviewState={allowReview ? single(query.reviewState) : undefined}
      reviewSurface={allowReview ? single(query.reviewSurface) : undefined}
      reviewDialogMode={allowReview ? single(query.reviewMode) : undefined}
      reviewActor={allowReview ? single(query.reviewActor) : undefined}
      reviewConnection={
        allowReview ? single(query.reviewConnection) : undefined
      }
      permissions={{
        create: canAdminAccess(actor, "zaad", "CREATE"),
        update: canAdminAccess(actor, "zaad", "UPDATE"),
        delete: canAdminAccess(actor, "zaad", "DELETE"),
      }}
      canViewDeveloperApi={canAdminAccess(actor, "developer-api", "VIEW")}
    />
  );
}

function isZaadView(value: unknown): value is ZaadViewKey {
  return (
    value === "residents" ||
    value === "contact-lists" ||
    value === "settings" ||
    value === "messages" ||
    value === "campaigns" ||
    value === "one-time"
  );
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
