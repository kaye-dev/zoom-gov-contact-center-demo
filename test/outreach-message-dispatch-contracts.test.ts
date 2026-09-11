import assert from "node:assert/strict";
import test from "node:test";
import { audioCapabilities, parseOutreachMessage } from "../lib/zaad/message-contracts";
import { parseDispatchDraft } from "../lib/zaad/dispatch-contracts";
test("message candidate voices never imply a verified generation or playback contract", () => {
  assert.deepEqual(audioCapabilities.voices, ["Takumi", "Kazuha", "Tomoko", "Mizuki"]);
  assert.equal(audioCapabilities.generationEnabled, false); assert.equal(audioCapabilities.previewEnabled, false);
  const message = { name: "案内", body: "確認です", voiceId: "Takumi", languageCode: "ja-JP" };
  assert.equal(parseOutreachMessage(message).body, "確認です");
  for (const override of [{ body: "" }, { voiceId: "browser-tts" }, { languageCode: "en-US" }, { version: 1 }]) assert.throws(() => parseOutreachMessage({ ...message, ...override }));
});
test("dispatch target-mode changes exclude hidden selections and prevent cross-tenant references", () => {
  const draft = { operationKey: "dispatch_test_001", name: "案内", body: "確認です", voiceId: "Takumi", languageCode: "ja-JP", connectionMode: "MEDIA", targetMode: "GROUPS", groupIds: ["list-one"], people: [{ siteKey: "univ", id: "hidden", origin: "UNIVERSITY_CONTACT", kind: "student" }], topic: "elder-watch" };
  assert.deepEqual(parseDispatchDraft(draft, "lg").people, []);
  assert.throws(() => parseDispatchDraft({ ...draft, targetMode: "PEOPLE" }, "lg"));
  assert.throws(() => parseDispatchDraft({ ...draft, connectionMode: "FLOW" }, "lg"));
  assert.throws(() => parseDispatchDraft({ ...draft, groupIds: [] }, "lg"));
});

test("snapshot digests preserve dates across JSON storage and detect independent preference changes", async () => {
  const { municipalContactDigest } = await import("../lib/server/zaad/municipal/snapshots");
  const contact = { version: 1, updatedAt: new Date("2026-09-09T00:00:00Z"), preferences: [{ topic: "elder-watch", confirmedAt: new Date("2026-09-08T00:00:00Z"), enabled: true }, { topic: "fraud-alert", enabled: false }] };
  assert.equal(municipalContactDigest(contact), municipalContactDigest(JSON.parse(JSON.stringify(contact))));
  assert.equal(municipalContactDigest(contact), municipalContactDigest({ ...contact, preferences: [...contact.preferences].reverse() }));
  assert.notEqual(municipalContactDigest(contact), municipalContactDigest({ ...contact, preferences: [{ ...contact.preferences[0], confirmedAt: new Date("2026-09-09T00:00:00Z") }, contact.preferences[1]] }));
});
