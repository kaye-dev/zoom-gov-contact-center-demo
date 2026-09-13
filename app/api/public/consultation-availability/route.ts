import { X_ROBOTS_TAG_VALUE } from "@/lib/search-indexing";
import { NextResponse, type NextRequest } from "next/server";
import { isConsultationBusinessHours } from "@/lib/consultation-hours";
import { getOnlineConsultationSettings } from "@/lib/server/online-consultation-settings";
import { resolveTenantFromHost } from "@/lib/tenants";
import { requirePublicAccess } from "@/lib/server/public-access-gate";
import { parseZoomVideoTag } from "@/lib/zoom-video-tag";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requirePublicAccess(request);
  if (access.response) return access.response;
  const tenant = resolveTenantFromHost(request.headers.get("host"));
  if (!tenant.features.universityPortal) return new NextResponse(null, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const configured = await getOnlineConsultationSettings(tenant.key);
  const open = isConsultationBusinessHours() || (process.env.NODE_ENV === "development" && process.env.CONSULTATION_DEMO_ALWAYS_OPEN === "1");
  return NextResponse.json({ open, services: configured.map(({ serviceKey, enabled, webClientTag }) => {
    const video = enabled && webClientTag ? parseZoomVideoTag(webClientTag) : null;
    return { serviceKey, available: Boolean(video), video: open ? video : null };
  }) }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": X_ROBOTS_TAG_VALUE } });
}
