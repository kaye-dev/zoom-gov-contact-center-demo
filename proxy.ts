import type { NextRequest } from "next/server";
import { handleMaintenanceRequest } from "@/lib/server/maintenance-request-gate";

export async function proxy(request: NextRequest) {
  return handleMaintenanceRequest(request);
}

// The inexpensive path/method filter runs before any database read. Keeping
// one static matcher also ensures undefined public URLs receive the same 503
// maintenance response as known public pages.
export const config = {
  matcher: "/:path*",
};
