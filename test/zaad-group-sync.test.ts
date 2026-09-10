import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../lib/generated/prisma/client";
import { groupSyncCandidates, syncContactLists, groupSyncOperation, type ContactListReader } from "../lib/server/zaad/group-sync";
import type { OutreachScope } from "../lib/server/zaad/outreach-scope";
import type { ZoomContactListDto } from "../lib/server/zaad/zoom-client";
import { OutreachContractError } from "../lib/zaad/outreach-contracts";
import { formatGroupUpdatedAt, sortContactLists } from "../lib/zaad/group-sync";
const scope: OutreachScope = { siteKey: "lg", actorId: "fixture-admin", all: true, departments: ["resident-support"], live: false };
const list = (id: string): ZoomContactListDto => ({ id, name: id, type: "contact", description: "", contactCount: 0, updatedAt: null, revision: "fixture" });
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, error => error instanceof OutreachContractError && error.code === code);

test("group sync includes unassigned and other-site lists, disables own additions and excludes dispatch resources", async () => {
  const bindings = [
    { zoomId: "own", ownerSiteKey: "lg", purpose: "REGULAR", dispatchId: null, tombstone: false },
    { zoomId: "shared", ownerSiteKey: "univ", purpose: "REGULAR", dispatchId: null, tombstone: false },
    { zoomId: "detached", ownerSiteKey: "lg", purpose: "REGULAR", dispatchId: null, tombstone: true },
    { zoomId: "dispatch", ownerSiteKey: "univ", purpose: "ONE_TIME", dispatchId: "fixture", tombstone: false },
  ];
  const db = { outreachDefaultGroup: { findMany: async () => [] }, zoomResourceBinding: { findMany: async () => bindings } } as unknown as PrismaClient;
  const calls: unknown[] = [];
  const reader = { accountId: "fixture-account", listContactLists: async (input: unknown) => { calls.push(input); return { lists: ["new", "own", "shared", "detached", "dispatch", "new"].map(list), nextPageToken: "next" }; } } as ContactListReader;
  const result = await groupSyncCandidates(db, scope, reader, "previous");
  assert.deepEqual(result.items.map(row => [row.id, row.selectable, row.added]), [["new", true, false], ["own", false, true], ["shared", true, false], ["detached", true, false]]);
  assert.deepEqual(calls, [{ pageSize: 100, nextPageToken: "previous" }]);
  assert.equal(result.nextCursor, "next");
  assert.equal(result.items[0].contactCount, 0);
  assert.equal(result.items[0].updatedAt, null);
  assert.equal(result.accountId, reader.accountId);
});

test("sync privilege and input checks run before any provider or DB call", async () => {
  const db = {} as PrismaClient, reader = {} as ContactListReader;
  await rejects(groupSyncCandidates(db, { ...scope, all: false }, reader), "FULL_ACCESS_REQUIRED");
  await rejects(syncContactLists(db, { ...scope, all: false }, {}, reader), "FULL_ACCESS_REQUIRED");
  await rejects(groupSyncOperation(db, { ...scope, all: false }, "fixture-operation"), "FULL_ACCESS_REQUIRED");
  await rejects(groupSyncCandidates(db, scope, reader, "a".repeat(4097)), "INVALID_CURSOR");
  const payload = { operationKey: "fixture-operation", accountId: "fixture-account", contactListIds: [] };
  await rejects(syncContactLists(db, scope, payload, reader), "EMPTY_SELECTION");
  await rejects(syncContactLists(db, scope, { ...payload, contactListIds: ["one", "one"] }, reader), "DUPLICATE_SELECTION");
  await rejects(syncContactLists(db, scope, { ...payload, contactListIds: Array.from({ length: 101 }, (_, i) => String(i)) }, reader), "INVALID_REQUEST");
  await rejects(syncContactLists(db, scope, { ...payload, contactListIds: ["one"] }, { accountId: "changed" } as ContactListReader), "ACCOUNT_CHANGED");
});

test("provider read failure is surfaced and never returned as an empty success", async () => {
  const db = {} as PrismaClient, reader = { accountId: "fixture", listContactLists: async () => { throw new Error("provider unavailable"); } } as unknown as ContactListReader;
  await assert.rejects(groupSyncCandidates(db, scope, reader), /provider unavailable/);
});

test("sorting preserves zero counts, sorts dates chronologically and keeps unknown values last", () => {
  const rows = [{ ...list("ten"), name: "Group 10", contactCount: 10, updatedAt: "2026-09-09T01:00:00Z" }, { ...list("two"), name: "Group 2", contactCount: 0, updatedAt: "2026-09-08T01:00:00Z" }, { ...list("unknown"), name: "Group 20", contactCount: null, updatedAt: "invalid" }];
  assert.deepEqual(sortContactLists(rows, "name", "asc", "ja").map(row => row.id), ["two", "ten", "unknown"]);
  assert.deepEqual(sortContactLists(rows, "updatedAt", "desc", "ja").map(row => row.id), ["ten", "two", "unknown"]);
  assert.deepEqual(sortContactLists(rows, "contactCount", "asc", "ja").map(row => row.id), ["two", "ten", "unknown"]);
  assert.equal(formatGroupUpdatedAt(null, "ja"), "—");
  assert.equal(formatGroupUpdatedAt("invalid", "ja"), "—");
  assert.notEqual(formatGroupUpdatedAt(rows[0].updatedAt, "ja"), "—");
});
