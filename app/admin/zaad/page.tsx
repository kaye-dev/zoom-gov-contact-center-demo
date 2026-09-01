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
  const allowReview = process.env.NODE_ENV !== "production";
  const requestedView = allowReview ? single(query.reviewView) ?? single(query.view) : single(query.view);
  const view = isZaadView(requestedView) ? requestedView : "residents";
  return (
    <ZaadView
      initialView={view}
      reviewState={allowReview ? single(query.reviewState) : undefined}
      reviewSurface={allowReview ? single(query.reviewSurface) : undefined}
      reviewDialogMode={allowReview ? single(query.reviewMode) : undefined}
      reviewActor={allowReview ? single(query.reviewActor) : undefined}
      reviewConnection={allowReview ? single(query.reviewConnection) : undefined}
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
  return value === "residents" || value === "contact-lists" || value === "settings" || value === "messages" || value === "campaigns" || value === "one-time";
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
