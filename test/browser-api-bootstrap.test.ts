import assert from "node:assert/strict";
import test from "node:test";
import {
  beginBrowserBootstrap, publishBrowserDocumentation, acknowledgeBrowserDocumentation,
  requireBrowserDocumentation, invalidateBrowserDocumentation, classifyBrowserError,
} from "../.agents/skills/plan/scripts/browser-api-bootstrap.mjs";
import { createInAppBrowserParityAdapter } from "../.agents/skills/plan/scripts/in-app-browser-parity-adapter.mjs";

const code = (expected: string) => (error: unknown) => {
  assert.equal((error as { code?: string }).code, expected);
  return true;
};
const docs = [{ id: "browser", text: "Complete Browser API instructions", complete: true }];
const begin = (runtime: object, generation = "one") => beginBrowserBootstrap(runtime, {
  sessionId: "fixture", generation, requiredDocumentIds: ["browser"],
});
async function publish(runtime: object) {
  return publishBrowserDocumentation(runtime, { invocationId: "read-call", documents: docs, publish: (value: unknown) => assert.deepEqual(value, docs.map(({ id, text }) => ({ id, text }))) });
}
async function authorize(runtime: object) {
  begin(runtime);
  const receipt = await publish(runtime);
  acknowledgeBrowserDocumentation(runtime, { receipt, invocationId: "next-call", displayedDocumentDigests: receipt.documents });
}

test("BOOT-01: no operation before complete publication and a later acknowledgement", async () => {
  let operations = 0;
  const runtime = { tabs: { selected: async () => { operations++; return { id: "owned" }; } } };
  const adapter = createInAppBrowserParityAdapter({ browser: runtime, tab: { id: "owned" } });
  await assert.rejects(adapter.activeTabId(), code("BROWSER_DOCUMENTATION_REQUIRED"));
  begin(runtime);
  for (const documents of [[], [{ ...docs[0], complete: false }], [{ ...docs[0], text: "" }]]) {
    await assert.rejects(publishBrowserDocumentation(runtime, { invocationId: "read-call", documents, publish: () => {} }), code("BROWSER_DOCUMENTATION_REQUIRED"));
  }
  await assert.rejects(publishBrowserDocumentation(runtime, { invocationId: "read-call", documents: docs, publish: () => { throw new Error("truncated output"); } }));
  const receipt = await publish(runtime);
  assert.throws(() => acknowledgeBrowserDocumentation(runtime, { receipt, invocationId: "read-call", displayedDocumentDigests: receipt.documents }), code("BROWSER_DOCUMENTATION_REQUIRED"));
  assert.throws(() => acknowledgeBrowserDocumentation(runtime, { receipt, invocationId: "next-call", displayedDocumentDigests: [] }), code("BROWSER_DOCUMENTATION_REQUIRED"));
  await assert.rejects(adapter.activeTabId(), code("BROWSER_DOCUMENTATION_REQUIRED"));
  assert.equal(operations, 0);
  acknowledgeBrowserDocumentation(runtime, { receipt, invocationId: "next-call", displayedDocumentDigests: receipt.documents });
  assert.equal(await adapter.activeTabId(), "owned");
  assert.equal(operations, 1);
});

test("BOOT-02: runtime reset, replacement publication and foreign/serialized receipts are rejected", async () => {
  const first = {}, second = {};
  begin(first); begin(second);
  const receipt = await publish(first);
  for (const [runtime, candidate] of [[second, receipt], [first, JSON.parse(JSON.stringify(receipt))]] as const) {
    assert.throws(() => acknowledgeBrowserDocumentation(runtime, { receipt: candidate, invocationId: "next", displayedDocumentDigests: receipt.documents }), code("BROWSER_DOCUMENTATION_REQUIRED"));
  }
  begin(first, "two");
  assert.throws(() => acknowledgeBrowserDocumentation(first, { receipt, invocationId: "next", displayedDocumentDigests: receipt.documents }), code("BROWSER_DOCUMENTATION_REQUIRED"));
  await authorize(first);
  assert.equal(requireBrowserDocumentation(first).status, "ready");
  invalidateBrowserDocumentation(first);
  assert.throws(() => requireBrowserDocumentation(first), code("BROWSER_DOCUMENTATION_REQUIRED"));
});

test("ERR-01: capability and DPR boundaries preserve documentation and permission errors without secrets", async () => {
  for (const underlying of [new Error('Required documentation has not been read: "confirmations"'), Object.assign(new Error("password=private"), { code: "PERMISSION_DENIED" })]) {
    const tab = { id: "owned", capabilities: { list: async () => { throw underlying; } } };
    const runtime = { tabs: { get: async () => tab, selected: async () => ({ id: "other" }) } };
    await authorize(runtime);
    const adapter = createInAppBrowserParityAdapter({ browser: runtime, tab });
    await assert.rejects(adapter.activateOwnedTab("owned"), (error: unknown) => {
      assert.equal((error as { code: string }).code, underlying.message.startsWith("Required") ? "BROWSER_DOCUMENTATION_REQUIRED" : "BROWSER_PERMISSION_DENIED");
      assert.doesNotMatch(JSON.stringify(error), /private|password/u);
      return true;
    });
  }
  assert.equal(classifyBrowserError(new Error("unknown private information")).category, "unknown");
  assert.equal(classifyBrowserError(Object.assign(new Error('Required documentation has not been read: "confirmations"'), { code: "OTHER" })).category, "unknown");
});
