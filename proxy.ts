import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  MAINTENANCE_REWRITE_HEADER,
  shouldEvaluateMaintenance,
} from "@/lib/maintenance-request";
import { getMaintenanceSettingsSnapshot } from "@/lib/server/maintenance-settings";
import { createMaintenanceRewriteResponse } from "@/lib/server/maintenance-proxy";

export async function proxy(request: NextRequest) {
  if (!shouldEvaluateMaintenance(request)) {
    return createMaintenancePassThroughResponse(request);
  }

  try {
    const snapshot = await getMaintenanceSettingsSnapshot({
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
    // here because Edge Config errors can contain connection metadata.
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

// The inexpensive path/method filter runs before any Edge Config read. Keeping
// one static matcher also ensures undefined public URLs receive the same 503
// maintenance response as known public pages.
export const config = {
  matcher: "/:path*",
};
