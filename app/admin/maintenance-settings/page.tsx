import { headers } from "next/headers";

import { requireAdminSession } from "@/lib/server/auth/server";
import { getMaintenanceSettingsSnapshot } from "@/lib/server/maintenance-settings-read";

import { MaintenanceSettingsForm } from "./MaintenanceSettingsForm";

export default async function MaintenanceSettingsPage() {
  await requireAdminSession("/admin/maintenance-settings");

  const requestHeaders = await headers();
  const requestHostname = requestHeaders.get("host");
  const snapshot = await getMaintenanceSettingsSnapshot({ requestHostname });

  return (
    <MaintenanceSettingsForm
      environment={snapshot.environment}
      initialConfig={
        snapshot.readStatus === "VALID" ? snapshot.config : null
      }
      initialEffective={snapshot.effective}
      initialRevision={
        snapshot.readStatus === "VALID" ? snapshot.revision : null
      }
    />
  );
}
