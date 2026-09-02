import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveZoomContractContext,
  LiveZoomContractError,
  persistLocalCampaignWriteGate,
} from "./zaad-zoom-live-contract-helpers";

test(
  "Zoom Contact Center campaign contract creates, reads, updates, and deletes a zero-recipient Draft without starting it",
  { timeout: 180_000 },
  async () => {
    const zoom = await LiveZoomContractContext.create({
      requireCampaignConfiguration: true,
      requiredWriteFeatures: ["campaign"],
    });
    let campaignId = "";
    let cleanupAllowed = true;

    try {
      const createdCampaign = await zoom.createDraftCampaign({ name: zoom.names.campaign });
      campaignId = createdCampaign.id;

      const created = await zoom.getCampaign(campaignId);
      assert.ok(created.id === campaignId, "The created campaign ID must match its readback without logging identifiers.");
      assert.equal(created.name, zoom.names.campaign);
      assert.equal(created.dialingMethod, "agentless");
      assert.equal(created.status, "draft");
      assert.equal(created.alwaysRunning, false);
      assert.equal(created.agentlessAmdOffAction, "use_flow");
      assert.deepEqual(created.contactListIds, []);
      assert.equal(created.assetId, null);
      zoom.assertCampaignReferenceReadback(created, createdCampaign.canonicalPhoneNumberId);

      await zoom.updateDraftCampaign(campaignId, zoom.names.campaignUpdated);
      const updated = await zoom.getCampaign(campaignId);
      assert.equal(updated.name, zoom.names.campaignUpdated);
      assert.equal(updated.status, "draft");
      assert.equal(updated.alwaysRunning, false);
      assert.equal(updated.agentlessAmdOffAction, "use_flow");
      assert.deepEqual(updated.contactListIds, []);
      assert.equal(updated.assetId, null);
      zoom.assertCampaignReferenceReadback(updated, createdCampaign.canonicalPhoneNumberId);

      await zoom.deleteCampaign(campaignId);
      await zoom.assertCampaignDeleted(campaignId);
      zoom.assertCampaignOnlyMutationBoundary(3);
      await persistLocalCampaignWriteGate();
    } catch (error) {
      if (error instanceof LiveZoomContractError && error.resultUnknown) cleanupAllowed = false;
      throw error;
    } finally {
      if (cleanupAllowed && campaignId) await zoom.cleanupCampaign(campaignId);
    }
  },
);
