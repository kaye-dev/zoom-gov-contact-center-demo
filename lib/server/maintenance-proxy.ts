import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  INTERNAL_MAINTENANCE_PATH,
  MAINTENANCE_REWRITE_HEADER,
  MAINTENANCE_REWRITE_HEADER_VALUE,
} from "@/lib/maintenance-request";

export function createMaintenanceRewriteResponse(
  request: NextRequest,
  retryAfter: string | null,
): NextResponse {
  const destination = request.nextUrl.clone();
  destination.pathname = INTERNAL_MAINTENANCE_PATH;
  destination.search = "";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    MAINTENANCE_REWRITE_HEADER,
    MAINTENANCE_REWRITE_HEADER_VALUE,
  );

  const responseHeaders = new Headers({
    "Cache-Control": "no-store",
  });
  if (retryAfter) responseHeaders.set("Retry-After", retryAfter);

  return NextResponse.rewrite(destination, {
    status: 503,
    headers: responseHeaders,
    request: { headers: requestHeaders },
  });
}
