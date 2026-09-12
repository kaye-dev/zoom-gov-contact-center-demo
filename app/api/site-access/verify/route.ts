import { verifySiteAccess } from "@/lib/server/site-access-verification";

export const runtime = "nodejs";
export async function POST(request: Request) { return verifySiteAccess(request); }
