import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { audioFixture } from "../helpers/outreach-audio";
import { createDatabaseContext } from "../../lib/server/prisma";
import { importedMessageAudio, allowedAudioUrl, publicAudioAddress, parseAudioRange, MAX_AUDIO_BYTES } from "../../lib/server/zaad/message-audio";

test("MESSAGE-PLAY-02: exact HTTPS host and single range validation reject SSRF inputs", () => {
  for (const value of ["http://file.zoom.us/a", "https://file.zoom.us:444/a", "https://file.zoom.us.evil.invalid/a", "https://127.0.0.1/a", "https://[::1]/a", "https://user:pass@file.zoom.us/a", "https://example.invalid/a"]) assert.throws(() => allowedAudioUrl(value));
  for (const value of ["bytes=", "bytes=1-0", "bytes=0-1,4-5", "bytes=-0", "bytes=9007199254740993-", "other=0-1"]) assert.throws(() => parseAudioRange(value));
  for (const value of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.0.1", "172.16.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.equal(publicAudioAddress(value), false);
  assert.equal(publicAudioAddress("203.0.113.10"), true);
});
test("MESSAGE-PLAY-02: authorized provider stream validates ranges, signatures, expiry, size and abort", { timeout: 180_000 }, async t => {
  await withIsolatedPostgresDatabase(async url => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }), db = context.prisma;
    try {
      const f = await audioFixture(db);
      const bytes = new Uint8Array(80); bytes.set(new TextEncoder().encode("ID3"));
      const calls: { url: string; range: string | null; authorization: string | null }[] = [];
      const resolve = async () => [{ address: "203.0.113.10" }];
      const request = (range?: string, signal?: AbortSignal) => new Request("http://localhost/api/admin/zaad/imported-audio-messages/id/audio?tenant=lg", { headers: range ? { Range: range } : {}, signal });
      const fetcher: typeof fetch = async (input, init) => {
        const headers = new Headers(init?.headers), range = headers.get("range"); calls.push({ url: String(input), range, authorization: headers.get("authorization") });
        if (!range) return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Content-Length": "80" } });
        if (range === "bytes=100-120") return new Response(null, { status: 416, headers: { "Content-Range": "bytes */80" } });
        const [start, end] = range.slice(6).split("-").map(Number);
        return new Response(bytes.slice(start, end + 1), { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Range": `bytes ${start}-${end}/80`, "Content-Length": String(end - start + 1) } });
      };
      const dependencies = { reader: f.provider, fetch: fetcher, resolve };
      await t.test("same-tenant read has no secrets in response and range seek checks byte zero", async () => {
        const response = await importedMessageAudio(db, f.scope, f.id, request(), dependencies);
        assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
        assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.doesNotMatch(JSON.stringify([...response.headers]), /signature|file.zoom/);
        const seek = await importedMessageAudio(db, f.scope, f.id, request("bytes=20-39"), dependencies);
        assert.equal(seek.status, 206); assert.equal(seek.headers.get("content-range"), "bytes 20-39/80"); assert.equal((await seek.arrayBuffer()).byteLength, 20);
        assert.deepEqual(calls.slice(-2).map(call => call.range), ["bytes=20-39", "bytes=0-31"]);
        assert.ok(calls.every(call => call.authorization === null));
        const invalid = await importedMessageAudio(db, f.scope, f.id, request("bytes=100-120"), dependencies);
        assert.equal(invalid.status, 416); assert.equal(invalid.headers.get("content-range"), "bytes */80");
        const ignored = await importedMessageAudio(db, f.scope, f.id, request("bytes=20-39"), { ...dependencies, fetch: async () => new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } }) });
        assert.equal(ignored.status, 200); assert.equal((await ignored.arrayBuffer()).byteLength, 80);
      });
      await t.test("other tenant and unlinked records cannot request provider audio", async () => {
        const count = calls.length;
        await assert.rejects(importedMessageAudio(db, { ...f.scope, siteKey: "univ" }, f.id, request(), dependencies));
        await db.outreachImportedAudioMessage.update({ where: { id: f.id }, data: { unlinkedAt: new Date() } });
        await assert.rejects(importedMessageAudio(db, f.scope, f.id, request(), dependencies));
        assert.equal(calls.length, count);
        await db.outreachImportedAudioMessage.update({ where: { id: f.id }, data: { unlinkedAt: null } });
      });
      await t.test("redirect and DNS checks reject disallowed destinations before issuing a second request", async () => {
        let requests = 0;
        await assert.rejects(importedMessageAudio(db, f.scope, f.id, request(), { ...dependencies, fetch: async () => { requests++; return new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest" } }); } }));
        assert.equal(requests, 1);
        await assert.rejects(importedMessageAudio(db, f.scope, f.id, request(), { ...dependencies, resolve: async () => [{ address: "10.0.0.1" }], fetch: async () => { requests++; throw new Error("must not fetch"); } }));
        assert.equal(requests, 1);
      });
      await t.test("expired signatures refresh provider metadata once; repeated expiry remains a failure", async () => {
        let requests = 0; const reads = f.calls.filter(call => call === "GET").length;
        const response = await importedMessageAudio(db, f.scope, f.id, request(), { ...dependencies, fetch: async (...args) => ++requests === 1 ? new Response(null, { status: 403 }) : fetcher(...args) });
        await response.arrayBuffer(); assert.equal(requests, 2); assert.equal(f.calls.filter(call => call === "GET").length - reads, 2);
        requests = 0;
        await assert.rejects(importedMessageAudio(db, f.scope, f.id, request(), { ...dependencies, fetch: async () => { requests++; return new Response(null, { status: 403 }); } }));
        assert.equal(requests, 2);
      });
      await t.test("MIME spoofing, oversized bodies and truncated streams fail instead of playing error content", async () => {
        for (const response of [new Response("<html>error</html>", { headers: { "Content-Type": "audio/mpeg" } }), Response.json({ error: "not audio" }), new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(MAX_AUDIO_BYTES + 1) } })]) await assert.rejects(importedMessageAudio(db, f.scope, f.id, request(), { ...dependencies, fetch: async () => response }));
        const truncated = await importedMessageAudio(db, f.scope, f.id, request(), { ...dependencies, fetch: async () => new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Content-Length": "100" } }) });
        await assert.rejects(truncated.arrayBuffer());
        const tooLarge = new Uint8Array(MAX_AUDIO_BYTES + 1); tooLarge.set(bytes);
        await assert.rejects(importedMessageAudio(db, f.scope, f.id, request(), { ...dependencies, fetch: async () => new Response(tooLarge, { headers: { "Content-Type": "audio/mpeg" } }) }));
        const abort = new AbortController(); abort.abort();
        await assert.rejects(importedMessageAudio(db, f.scope, f.id, request(undefined, abort.signal), { ...dependencies, fetch: async (_input, init) => { init!.signal!.throwIfAborted(); return new Response(bytes); } }));
      });
    } finally { await context.close(); }
  });
});
