import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  MAINTENANCE_REWRITE_HEADER,
  shouldEvaluateMaintenance,
} from "@/lib/maintenance-request";

import { createMaintenanceRewriteResponse } from "./maintenance-proxy";
import {
  getMaintenanceSettingsSnapshot,
  type MaintenanceSettingsOptions,
  type MaintenanceSettingsSnapshot,
} from "./maintenance-settings-read";

export type MaintenanceSnapshotLoader = (
  options: MaintenanceSettingsOptions,
) => Promise<MaintenanceSettingsSnapshot>;

export async function handleMaintenanceRequest(
  request: NextRequest,
  loadSnapshot: MaintenanceSnapshotLoader = getMaintenanceSettingsSnapshot,
): Promise<NextResponse> {
  if (!shouldEvaluateMaintenance(request)) {
    return createMaintenancePassThroughResponse(request);
  }

  try {
    const snapshot = await loadSnapshot({
      requestHostname: request.nextUrl.hostname,
    });
    if (!snapshot.effective.active) {
      return createMaintenancePassThroughResponse(request);
    }

    return createMaintenanceRewriteResponse(
      request,
      snapshot.effective.retryAfter,
    );
  } catch {
    // Availability must fail closed. Do not log request/configuration details
    // here because database errors can contain connection metadata.
    return createMaintenanceRewriteResponse(request, null);
  }
}

function createMaintenancePassThroughResponse(
  request: NextRequest,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(MAINTENANCE_REWRITE_HEADER);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
