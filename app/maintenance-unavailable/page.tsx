import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { MaintenancePage } from "@/app/components/MaintenancePage";
import {
  MAINTENANCE_REWRITE_HEADER,
  MAINTENANCE_REWRITE_HEADER_VALUE,
} from "@/lib/maintenance-request";

export const metadata: Metadata = {
  title: "Web サイト メンテナンス中 | 未来市",
};

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
