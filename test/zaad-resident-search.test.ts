import assert from "node:assert/strict";
import test from "node:test";
import { createResidentSearch, formatResidentCount } from "../app/admin/zaad/resident-search";
import { zaadDictionaries } from "../app/i18n/zaad-dictionaries";

function harness() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const requests: Array<{ query: string; cursor: string | null; resolve: (value: string) => void; reject: (error: unknown) => void }> = [];
  const results: Array<{ value: string; query: string; cursor: string | null; history: Array<string | null> }> = [];
  const errors: unknown[] = [];
  let busy = false;
  const controller = createResidentSearch<string>({
    request: (query, cursor) => new Promise((resolve, reject) => requests.push({ query, cursor, resolve, reject })),
    onPending: () => {},
    onResult: (value, page) => results.push({ value, ...page }),
    onError: (error) => errors.push(error),
    onBusy: (value) => { busy = value; },
    schedule: (callback, delay) => {
      timers.set(++id, { at: now + delay, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (timer) => { timers.delete(timer as unknown as number); },
  });
  return { controller, requests, results, errors, busy: () => busy, advance(ms: number) {
    now += ms;
    for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.callback(); }
  } };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("SEARCH-06: 199ms has no request; 200ms commits trimmed input, IME and empty input", async () => {
  const h = harness();
  h.controller.input("  管理  ", true);
  h.advance(1000);
  h.controller.refresh();
  assert.equal(h.requests.length, 0);
  h.controller.input("  管理  ");
  h.advance(199);
  assert.equal(h.requests.length, 0);
  h.advance(1);
  assert.equal(h.requests[0].query, "管理");
  h.requests[0].resolve("matching"); await flush();
  assert.equal(h.busy(), false);
  h.controller.input(""); h.advance(200);
  assert.equal(h.requests[1].query, "");
  h.controller.dispose();
});

test("SEARCH-06: changing input immediately invalidates old success/error, including during debounce", async () => {
  for (const fail of [false, true]) {
    const h = harness();
    void h.controller.start();
    h.controller.input("B");
    if (fail) h.requests[0].reject(new Error("stale")); else h.requests[0].resolve("stale");
    await flush();
    assert.equal(h.results.length, 0); assert.deepEqual(h.errors, []); assert.equal(h.busy(), true);
    h.advance(200); h.requests[1].resolve("B"); await flush();
    assert.equal(h.results[0].value, "B");
    h.controller.input("C"); h.advance(200);
    h.controller.input("D"); h.advance(200);
    h.requests[3].resolve("D"); await flush();
    h.requests[2].resolve("C"); await flush();
    assert.deepEqual(h.results.map(({ value }) => value), ["B", "D"]);
  }
});

test("SEARCH-06: paging/refresh retain committed query, edits reset history, and busy paging is ignored", async () => {
  const h = harness();
  h.controller.input("query"); h.advance(200);
  h.controller.next("ignored"); assert.equal(h.requests.length, 1);
  h.requests[0].resolve("first"); await flush();
  h.controller.next("page2");
  assert.equal(h.requests[1].query, "query"); assert.equal(h.requests[1].cursor, "page2");
  h.requests[1].resolve("second"); await flush();
  assert.deepEqual(h.results[1].history, [null]);
  h.controller.refresh();
  assert.equal(h.requests[2].cursor, "page2"); assert.equal(h.requests[2].query, "query");
  h.requests[2].resolve("refreshed"); await flush();
  h.controller.previous(); assert.equal(h.requests[3].cursor, null);
  h.requests[3].resolve("first"); await flush();
  h.controller.input("new"); h.controller.refresh(); h.advance(200);
  assert.equal(h.requests.length, 5);
  h.requests[4].resolve("new"); await flush();
  assert.deepEqual(h.results.at(-1)?.history, []); assert.equal(h.results.at(-1)?.cursor, null);
});

test("SEARCH-06: latest failure is retryable and dispose cancels timers and pending commits", async () => {
  const h = harness();
  h.controller.input("retry"); h.advance(200);
  h.requests[0].reject("failure"); await flush();
  assert.deepEqual(h.errors, ["failure"]); assert.equal(h.busy(), false);
  h.controller.refresh(); assert.equal(h.requests[1].query, "retry");
  h.controller.dispose(); h.requests[1].resolve("disposed"); await flush();
  assert.deepEqual(h.results, []);
  const next = harness(); next.controller.input("cancel"); next.controller.dispose(); next.advance(200);
  assert.equal(next.requests.length, 0);
});

test("COUNT-08: localized totals use total, including confirmed zero, rather than page length", () => {
  for (const total of [0, 1, 128]) assert.equal(formatResidentCount(zaadDictionaries.ja.residents.count, total, "ja"), `（${total}人）`);
  assert.equal(formatResidentCount(zaadDictionaries.en.residents.count, 1234, "en"), "(1,234 residents)");
  for (const dictionary of Object.values(zaadDictionaries)) {
    assert.ok(dictionary.infoLabel); assert.ok(dictionary.residents.count.includes("{count}"));
  }
});
