import { NextResponse, type NextRequest } from "next/server";
import { isConsultationBusinessHours } from "@/lib/consultation-hours";
import { getOnlineConsultationSettings } from "@/lib/server/online-consultation-settings";
import { resolveTenantFromHost } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tenant = resolveTenantFromHost(request.headers.get("host"));
  if (!tenant.features.universityPortal) return new NextResponse(null, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const configured = await getOnlineConsultationSettings(tenant.key);
  return NextResponse.json({ open: isConsultationBusinessHours(), services: configured.map(({ serviceKey, enabled, webClientTag }) => ({ serviceKey, available: Boolean(enabled && webClientTag) })) }, { headers: { "Cache-Control": "no-store" } });
}
