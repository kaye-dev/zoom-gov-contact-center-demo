import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CHAT_MEMO_LENGTH,
  parseChatSettings,
  resolveActiveZoomWebChatTag,
  type ChatSettings,
} from "../lib/chat-settings";
import { SETTINGS_ERROR_CODES } from "../lib/site-settings";

const campaignTag =
  '<script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js" data-apikey="public-api-key" data-env="us01"></script>';
const entryIdTag =
  '<script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js" data-chat-entry-id="entry-id-value" data-env="us01" data-apikey="public-api-key"></script>';

const validSettings: ChatSettings = {
  activeMode: "CAMPAIGN",
  campaignWebTag: campaignTag,
  campaignMemo: "Campaign configuration",
  contactCenterEntryIdWebTag: entryIdTag,
  contactCenterEntryIdMemo: "Contact Center configuration",
};

test("chat settings preserve both canonical tags and memo formatting", () => {
  const input = structuredClone(validSettings);
  input.campaignWebTag = ` \n${campaignTag}\n `;
  input.campaignMemo = "\n  Campaign configuration  \n";
  input.contactCenterEntryIdMemo = "  ";

  const result = parseChatSettings(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value, {
    ...validSettings,
    campaignMemo: "\n  Campaign configuration  \n",
    contactCenterEntryIdMemo: null,
  });
});

test("non-selected non-empty Web Tags are still validated", () => {
  const invalidEntryTag = structuredClone(validSettings);
  invalidEntryTag.contactCenterEntryIdWebTag = campaignTag;
  assert.deepEqual(parseChatSettings(invalidEntryTag), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidZoomContactCenterWebTag,
  });

  const invalidCampaignTag = structuredClone(validSettings);
  invalidCampaignTag.activeMode = "CONTACT_CENTER_ENTRY_ID";
  invalidCampaignTag.campaignWebTag = entryIdTag;
  assert.deepEqual(parseChatSettings(invalidCampaignTag), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidZoomCampaignWebTag,
  });
});

test("the selected Zoom chat mode requires its corresponding Web Tag", () => {
  const missingCampaignTag = structuredClone(validSettings);
  missingCampaignTag.campaignWebTag = "  ";
  assert.deepEqual(parseChatSettings(missingCampaignTag), {
    ok: false,
    code: SETTINGS_ERROR_CODES.activeZoomChatTagRequired,
  });

  const missingEntryTag = structuredClone(validSettings);
  missingEntryTag.activeMode = "CONTACT_CENTER_ENTRY_ID";
  missingEntryTag.contactCenterEntryIdWebTag = null;
  assert.deepEqual(parseChatSettings(missingEntryTag), {
    ok: false,
    code: SETTINGS_ERROR_CODES.activeZoomChatTagRequired,
  });
});

test("DISABLED mode keeps optional saved values but does not resolve a tag", () => {
  const disabled = { ...validSettings, activeMode: "DISABLED" as const };
  const result = parseChatSettings(disabled);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.campaignWebTag, campaignTag);
  assert.equal(result.value.contactCenterEntryIdWebTag, entryIdTag);
  assert.equal(resolveActiveZoomWebChatTag(result.value), null);

  const emptyResult = parseChatSettings({
    activeMode: "DISABLED",
    campaignWebTag: null,
    campaignMemo: null,
    contactCenterEntryIdWebTag: null,
    contactCenterEntryIdMemo: null,
  });
  assert.equal(emptyResult.ok, true);
});

test("only the selected Web Tag is resolved for public rendering", () => {
  const campaign = resolveActiveZoomWebChatTag(validSettings);
  assert.equal(campaign?.mode, "CAMPAIGN");
  assert.equal("chatEntryId" in campaign!, false);

  const entry = resolveActiveZoomWebChatTag({
    ...validSettings,
    activeMode: "CONTACT_CENTER_ENTRY_ID",
  });
  assert.equal(entry?.mode, "CONTACT_CENTER_ENTRY_ID");
  assert.equal(
    entry?.mode === "CONTACT_CENTER_ENTRY_ID" ? entry.chatEntryId : null,
    "entry-id-value",
  );
});

test("chat memos allow 4,000 characters and reject longer values", () => {
  const maximumMemo = structuredClone(validSettings);
  maximumMemo.campaignMemo = "😀".repeat(MAX_CHAT_MEMO_LENGTH);
  const validResult = parseChatSettings(maximumMemo);
  assert.equal(validResult.ok, true);

  const tooLongMemo = structuredClone(validSettings);
  tooLongMemo.contactCenterEntryIdMemo = "a".repeat(
    MAX_CHAT_MEMO_LENGTH + 1,
  );
  assert.deepEqual(parseChatSettings(tooLongMemo), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidChatMemo,
  });
});

test("chat settings reject unknown modes and malformed payloads", () => {
  assert.deepEqual(
    parseChatSettings({ ...validSettings, activeMode: "UNKNOWN" }),
    { ok: false, code: SETTINGS_ERROR_CODES.invalidRequest },
  );
  assert.deepEqual(
    parseChatSettings({ ...validSettings, campaignMemo: 123 }),
    { ok: false, code: SETTINGS_ERROR_CODES.invalidRequest },
  );
});
