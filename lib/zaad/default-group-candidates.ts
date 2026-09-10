import type { DefaultGroupCandidatesResponse } from "./default-groups";

/** Return only a complete snapshot; callers retain their previous snapshot on failure. */
export async function loadDefaultGroupCandidates(
  request: (cursor: string | null) => Promise<DefaultGroupCandidatesResponse>,
  signal: AbortSignal,
): Promise<DefaultGroupCandidatesResponse> {
  const seen = new Set<string>();
  const items = new Map<string, DefaultGroupCandidatesResponse["items"][number]>();
  let snapshot: DefaultGroupCandidatesResponse | undefined;
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    signal.throwIfAborted();
    const result = await request(cursor);
    signal.throwIfAborted();
    if (snapshot && (result.accountId !== snapshot.accountId || result.revision !== snapshot.revision || result.tenantKey !== snapshot.tenantKey || JSON.stringify(result.current) !== JSON.stringify(snapshot.current))) throw new Error("CANDIDATES_CHANGED");
    snapshot ??= result;
    for (const item of result.items) items.set(item.id, item);
    cursor = result.nextCursor;
    if (!cursor) return { ...snapshot, items: [...items.values()], nextCursor: null };
    if (seen.has(cursor)) throw new Error("CANDIDATE_CURSOR_LOOP");
    seen.add(cursor);
  }
  throw new Error("CANDIDATE_PAGE_LIMIT");
}
