import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveZoomContractContext,
  LiveZoomContractError,
  ZAAD_LIVE_SYNTHETIC_TTS_CONTENT,
} from "./zaad-zoom-live-contract-helpers";

test(
  "Zoom Contact Center campaign contract prepares a non-running Agentless campaign with a synthetic TTS asset",
  { timeout: 180_000 },
  async () => {
    const zoom = await LiveZoomContractContext.create({
      requireCampaignConfiguration: true,
      requiredWriteFeatures: ["contact", "tts", "campaign"],
    });
    let assetId = "";
    let contactListId = "";
    const contactIds: string[] = [];
    let campaignId = "";
    let cleanupAllowed = true;

    try {
      const createdAsset = await zoom.createTtsAsset({
        content: ZAAD_LIVE_SYNTHETIC_TTS_CONTENT.created,
        name: zoom.names.asset,
        voice: "Tomoko",
      });
      assetId = createdAsset.id;
      contactListId = await zoom.createContactList(zoom.names.contactList);
      await zoom.createContactsBatch(contactListId, [{
        displayName: `${zoom.names.contact}-campaign`,
        email: "zaad-live-contract-campaign@example.invalid",
        phone: "+12025550104",
      }]);
      const contacts = await zoom.listContacts(contactListId);
      const contact = contacts.find((candidate) => candidate.displayName === `${zoom.names.contact}-campaign`);
      assert.ok(contact, "The synthetic campaign contact must be readable before campaign preparation.");
      zoom.claimContact(contact.id, contact.displayName);
      contactIds.push(contact.id);
      campaignId = await zoom.createDraftCampaign({
        contactListId,
        name: zoom.names.campaign,
      });

      const created = await zoom.getCampaign(campaignId);
      assert.ok(created.id === campaignId, "The created campaign ID must match its readback without logging identifiers.");
      assert.equal(created.name, zoom.names.campaign);
      assert.equal(created.dialingMethod, "agentless");
      assert.equal(created.status, "draft");
      assert.equal(created.alwaysRunning, false);
      assert.ok(
        created.contactListIds.length === 1 && created.contactListIds[0] === contactListId,
        "The Draft campaign must reference only the owned synthetic contact list.",
      );

      await zoom.updateDraftCampaign(campaignId, zoom.names.campaignUpdated);
      const updated = await zoom.getCampaign(campaignId);
      assert.equal(updated.name, zoom.names.campaignUpdated);
      assert.equal(updated.status, "draft");
      assert.equal(updated.alwaysRunning, false);

      await zoom.configureDraftCampaignForTts(campaignId, assetId);
      const configured = await zoom.getCampaign(campaignId);
      assert.equal(configured.status, "draft");
      assert.equal(configured.alwaysRunning, false);
      assert.equal(configured.agentlessAmdOffAction, "play_media");
      assert.ok(configured.assetId === assetId, "The Draft campaign must reference the owned synthetic TTS asset.");
      assert.ok(
        configured.contactListIds.length === 1 && configured.contactListIds[0] === contactListId,
        "The configured Draft campaign must reference only the owned synthetic contact list.",
      );

      await zoom.setCampaignReadyStatus(campaignId);
      const ready = await zoom.getCampaign(campaignId);
      assert.equal(ready.status, "ready");
      assert.equal(ready.alwaysRunning, false);
      assert.equal(ready.dialingMethod, "agentless");
      assert.equal(ready.agentlessAmdOffAction, "play_media");
      assert.ok(ready.assetId === assetId, "The Ready campaign must preserve the owned synthetic TTS asset.");
      assert.ok(
        ready.contactListIds.length === 1 && ready.contactListIds[0] === contactListId,
        "The Ready campaign must preserve only the owned synthetic contact list.",
      );

      await zoom.deleteCampaign(campaignId);
      for (const contactId of [...contactIds]) await zoom.deleteContact(contactListId, contactId);
      await zoom.deleteContactList(contactListId);
      await zoom.archiveAsset(assetId);
      await zoom.hardDeleteAsset(assetId);
    } catch (error) {
      if (error instanceof LiveZoomContractError && error.resultUnknown) cleanupAllowed = false;
      throw error;
    } finally {
      if (cleanupAllowed) {
        if (campaignId) await zoom.cleanupCampaign(campaignId);
        if (contactListId) await zoom.cleanupContactList(contactListId, contactIds);
        if (assetId) await zoom.cleanupAsset(assetId);
      }
    }
  },
);
