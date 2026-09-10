import type { PurposeCandidates } from "@/lib/zaad/purpose-campaigns";
import type { TenantKey } from "@/lib/tenants";
import { outreachRequest, OutreachApiError } from "./outreach-client";
export async function loadPurposeCampaignCandidates(tenant: TenantKey, path: string, signal: AbortSignal, request = outreachRequest): Promise<PurposeCandidates> {
  const all: PurposeCandidates["items"] = [], seen = new Set<string>();
  let first: PurposeCandidates | null = null, cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const result: PurposeCandidates = await request(tenant, `${path}/candidates${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });
    if (result.incomplete || (first && (result.accountId !== first.accountId || result.revision !== first.revision))) throw new OutreachApiError("INCOMPLETE_CANDIDATES", 409);
    first ??= result; all.push(...result.items); cursor = result.nextCursor;
    if (!cursor) return { ...first, items: [...new Map(all.map(item => [item.id, item])).values()], nextCursor: null };
    if (seen.has(cursor)) throw new OutreachApiError("PAGINATION_LOOP", 502);
    seen.add(cursor);
  }
  throw new OutreachApiError("PAGINATION_LIMIT", 502);
}
