import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { MaintenancePage } from "@/app/components/MaintenancePage";
import {
  MAINTENANCE_REWRITE_HEADER,
  MAINTENANCE_REWRITE_HEADER_VALUE,
} from "@/lib/maintenance-request";
import { getRequestTenant } from "@/lib/server/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();

  return {
    title: `Web サイト メンテナンス中 | ${tenant.metadata.shortName}`,
  };
}

export default async function MaintenanceUnavailablePage() {
  const requestHeaders = await headers();
  if (
    requestHeaders.get(MAINTENANCE_REWRITE_HEADER) !==
    MAINTENANCE_REWRITE_HEADER_VALUE
  ) {
    redirect("/");
  }

  return <MaintenancePage />;
}
