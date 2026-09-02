import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveZoomContractContext,
  LiveZoomContractError,
  ZAAD_LIVE_SYNTHETIC_TTS_1_CHARACTER_CONTENT,
  ZAAD_LIVE_SYNTHETIC_TTS_500_CHARACTER_CONTENT,
  ZAAD_LIVE_SYNTHETIC_TTS_CONTENT,
} from "./zaad-zoom-live-contract-helpers";

test(
  "Zoom Contact Center TTS asset contract accepts a ZAAD synthetic resource",
  { timeout: 180_000 },
  async () => {
    const zoom = await LiveZoomContractContext.create({ requiredWriteFeatures: ["tts"] });
    let assetId = "";
    let cleanupAllowed = true;

    try {
      const minimumAsset = await zoom.createTtsAsset({
        content: ZAAD_LIVE_SYNTHETIC_TTS_1_CHARACTER_CONTENT,
        name: zoom.names.assetUpdated,
        voice: "Takumi",
      });
      assetId = minimumAsset.id;
      const minimumReadback = await zoom.getAsset(assetId);
      assert.equal(minimumReadback.content, ZAAD_LIVE_SYNTHETIC_TTS_1_CHARACTER_CONTENT);
      await zoom.archiveAsset(assetId);
      await zoom.hardDeleteAsset(assetId);
      assetId = "";

      const createdAsset = await zoom.createTtsAsset({
        content: ZAAD_LIVE_SYNTHETIC_TTS_500_CHARACTER_CONTENT,
        name: zoom.names.asset,
        voice: "Tomoko",
      });
      assetId = createdAsset.id;

      assert.equal(ZAAD_LIVE_SYNTHETIC_TTS_500_CHARACTER_CONTENT.length, 500);
      const initialAsset = await zoom.assertTtsBoundaryReadback(assetId);
      assert.ok(initialAsset.id === assetId, "The created asset ID must match its readback without logging identifiers.");
      assert.ok(
        initialAsset.itemId === createdAsset.itemId,
        "The created TTS item ID must match its readback without logging identifiers.",
      );
      assert.equal(initialAsset.name, zoom.names.asset);
      assert.equal(initialAsset.type, "audio");
      assert.equal(initialAsset.archived, false);
      assert.equal(initialAsset.voice, "Tomoko");

      await zoom.updateTtsAssetItem({
        content: ZAAD_LIVE_SYNTHETIC_TTS_CONTENT.updated,
        id: assetId,
        voice: "Mizuki",
      });
      await zoom.updateAssetName(assetId, zoom.names.assetUpdated);
      const updatedAsset = await zoom.getAsset(assetId);
      assert.equal(updatedAsset.name, zoom.names.assetUpdated);
      assert.ok(
        updatedAsset.itemId === createdAsset.itemId,
        "Updating TTS content must preserve the item identity without logging identifiers.",
      );

      await zoom.archiveAsset(assetId);
      const archivedAsset = await zoom.getAsset(assetId);
      assert.equal(archivedAsset.archived, true);
      await zoom.hardDeleteAsset(assetId);
    } catch (error) {
      if (error instanceof LiveZoomContractError && error.resultUnknown) cleanupAllowed = false;
      throw error;
    } finally {
      if (cleanupAllowed) {
        if (assetId) await zoom.cleanupAsset(assetId);
      }
    }
  },
);

test(
  "Zoom Contact Center contact-list and contact contracts accept ZAAD synthetic resources",
  { timeout: 180_000 },
  async () => {
    const zoom = await LiveZoomContractContext.create({ requiredWriteFeatures: ["contact"] });
    let contactListId = "";
    const contactIds: string[] = [];
    let cleanupAllowed = true;

    try {
      contactListId = await zoom.createContactList(zoom.names.contactList);
      const initialList = await zoom.getContactList(contactListId);
      assert.ok(
        initialList.id === contactListId,
        "The created contact-list ID must match its readback without logging identifiers.",
      );
      assert.equal(initialList.name, zoom.names.contactList);
      assert.equal(initialList.type, "contact");

      await zoom.updateContactList(contactListId, zoom.names.contactListUpdated);
      const updatedList = await zoom.getContactList(contactListId);
      assert.equal(updatedList.name, zoom.names.contactListUpdated);

      const syntheticContacts = [
        {
          displayName: `${zoom.names.contact}-01`,
          email: "zaad-live-contract-01@example.invalid",
          phone: "+12025550101",
        },
        {
          displayName: `${zoom.names.contact}-02`,
          email: "zaad-live-contract-02@example.invalid",
          phone: "+12025550102",
        },
      ];
      await zoom.createContactsBatch(contactListId, syntheticContacts);
      const createdContacts = await zoom.listContacts(contactListId);
      for (const expected of syntheticContacts) {
        const contact = createdContacts.find((candidate) => candidate.displayName === expected.displayName);
        assert.ok(contact, "The synthetic batch contact must be readable after creation.");
        zoom.claimContact(contact.id, contact.displayName);
        contactIds.push(contact.id);
      }

      const contactToUpdate = contactIds[0];
      assert.ok(contactToUpdate, "The synthetic contact ID must be available for update.");
      await zoom.updateContact(contactListId, contactToUpdate, {
        displayName: zoom.names.contactUpdated,
        email: "zaad-live-contract-updated@example.invalid",
        phone: "+12025550103",
      });
      const contactsAfterUpdate = await zoom.listContacts(contactListId);
      assert.ok(
        contactsAfterUpdate.some((contact) => contact.id === contactToUpdate && contact.displayName === zoom.names.contactUpdated),
        "The updated synthetic contact must be readable.",
      );

      for (const contactId of [...contactIds]) await zoom.deleteContact(contactListId, contactId);
      await zoom.deleteContactList(contactListId);
    } catch (error) {
      if (error instanceof LiveZoomContractError && error.resultUnknown) cleanupAllowed = false;
      throw error;
    } finally {
      if (cleanupAllowed && contactListId) await zoom.cleanupContactList(contactListId, contactIds);
    }
  },
);
