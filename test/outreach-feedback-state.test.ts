import assert from "node:assert/strict";
import test from "node:test";
import { createFeedbackQueue, syncFeedbackTone, syncFeedbackMessage, feedbackMessage, type OutreachFeedbackEvent } from "../app/admin/zaad/outreach-feedback";
import { outreachCommonDictionaries } from "../app/i18n/outreach-common";
const event: OutreachFeedbackEvent = { id: "operation-1", tenant: "lg", view: "messages", tone: "success", messageKey: "messageUi.saved", placement: "toast" };
test("T05 queue is FIFO, deduplicates completed IDs, and rejects old tenant/view callbacks", () => {
  const queue = createFeedbackQueue("lg", "messages");
  let updates = 0;
  const unsubscribe = queue.subscribe(() => updates++);
  queue.notify(event); queue.notify(event); queue.notify({ ...event, id: "operation-2" });
  assert.deepEqual(queue.getSnapshot().map(row => row.id), ["operation-1", "operation-2"]);
  queue.dismiss(event.id); queue.notify(event);
  assert.deepEqual(queue.getSnapshot().map(row => row.id), ["operation-2"]);
  queue.notify({ ...event, id: "wrong-tenant", tenant: "univ" }); queue.notify({ ...event, id: "wrong-tab", view: "campaigns" });
  assert.equal(updates, 3);
  queue.deactivate(); queue.notify({ ...event, id: "late" }); assert.equal(queue.getSnapshot().length, 0);
  queue.activate(); queue.notify(event); assert.equal(queue.getSnapshot().length, 1);
  unsubscribe();
});
test("T03 sync counts remain separate and incomplete or unknown results never succeed", () => {
  for (const status of ["COMPLETED", "PENDING", "UNKNOWN", "FAILED"]) {
    assert.equal(syncFeedbackTone({ status, counts: { failed: 1, pending: 0 } }), "warning");
    assert.equal(syncFeedbackTone({ status, counts: { failed: 0, pending: 1 } }), "warning");
  }
  assert.equal(syncFeedbackTone({ status: "COMPLETED", counts: { failed: 0, pending: 0 } }), "success");
  assert.equal(syncFeedbackTone({ status: "UNKNOWN", counts: { failed: 0, pending: 0 } }), "warning");
  assert.equal(syncFeedbackTone({ status: "PENDING", counts: { failed: 0, pending: 2 } }, true), "info");
  assert.equal(syncFeedbackMessage("{synced}/{failed}/{pending}", { synced: 3, failed: 1, pending: 2 }), "3/1/2");
});
test("T08 every supported locale resolves stored message keys and pending counts", () => {
  for (const copy of Object.values(outreachCommonDictionaries)) {
    assert.ok(copy.feedback.dismiss);
    assert.match(copy.feedback.syncCounts, /\{pending\}/u);
    assert.equal(feedbackMessage(copy, event), copy.messageUi.saved);
    assert.equal(feedbackMessage(copy, { messageKey: "purposeCampaigns.saved" }), copy.purposeCampaigns.saved);
  }
});
