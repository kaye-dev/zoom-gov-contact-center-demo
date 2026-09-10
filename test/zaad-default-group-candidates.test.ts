import assert from "node:assert/strict";
import test from "node:test";
import { loadDefaultGroupCandidates } from "../lib/zaad/default-group-candidates";
import type { DefaultGroupCandidatesResponse } from "../lib/zaad/default-groups";
const response = (ids: string[], nextCursor: string | null = null): DefaultGroupCandidatesResponse => ({ tenantKey: "lg", accountId: "fixture", revision: 1, current: null, items: ids.map(id => ({ id, name: id, selectable: true, disabledReason: null })), nextCursor });
const signal = () => new AbortController().signal;

test("candidate pages merge by ID only after every page succeeds", async () => {
  const calls: (string | null)[] = [];
  const result = await loadDefaultGroupCandidates(async cursor => { calls.push(cursor); return cursor ? response(["b", "c"]) : response(["a", "b"], "opaque"); }, signal());
  assert.deepEqual(calls, [null, "opaque"]);
  assert.deepEqual(result.items.map(row => row.id), ["a", "b", "c"]);
  assert.equal(result.nextCursor, null);
  assert.equal((await loadDefaultGroupCandidates(async () => response([]), signal())).items.length, 0);
});
test("partial failure leaves the published snapshot intact and retry begins at page one", async () => {
  let snapshot = response(["old"]);
  const calls: (string | null)[] = [];
  let fail = true;
  const request = async (cursor: string | null) => { calls.push(cursor); if (cursor && fail) throw new Error("rate limited"); return cursor ? response(["new-b"]) : response(["new-a"], "next"); };
  await assert.rejects(async () => { snapshot = await loadDefaultGroupCandidates(request, signal()); });
  assert.deepEqual(snapshot.items.map(row => row.id), ["old"]);
  fail = false; snapshot = await loadDefaultGroupCandidates(request, signal());
  assert.deepEqual(calls, [null, "next", null, "next"]);
  assert.deepEqual(snapshot.items.map(row => row.id), ["new-a", "new-b"]);
});
test("pagination stops on repeated tokens and the 100-page limit", async () => {
  let calls = 0;
  await assert.rejects(loadDefaultGroupCandidates(async () => { calls++; return response([], "loop"); }, signal()), /CURSOR_LOOP/);
  assert.equal(calls, 2); calls = 0;
  await assert.rejects(loadDefaultGroupCandidates(async () => response([], `cursor-${++calls}`), signal()), /PAGE_LIMIT/);
  assert.equal(calls, 100);
});
test("account, tenant, revision and current changes cannot create a mixed snapshot", async () => {
  for (const change of [{ accountId: "new" }, { revision: 2 }, { tenantKey: "univ" as const }, { current: { id: "new", name: "", selectable: true, unavailableReason: null } }]) {
    await assert.rejects(loadDefaultGroupCandidates(async cursor => cursor ? { ...response([]), ...change } : response([], "next"), signal()), /CANDIDATES_CHANGED/);
  }
});
test("closing or changing targets discards a late response even when fetch ignores abort", async () => {
  const controller = new AbortController();
  let resolve!: (value: DefaultGroupCandidatesResponse) => void;
  const pending = loadDefaultGroupCandidates(() => new Promise(done => { resolve = done; }), controller.signal);
  controller.abort(); resolve(response(["stale"]));
  await assert.rejects(pending, error => error instanceof Error && error.name === "AbortError");
});
