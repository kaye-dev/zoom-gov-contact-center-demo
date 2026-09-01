import { randomBytes } from "node:crypto";

import { decryptDeveloperApiSecret } from "../../lib/server/developer-api-crypto";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
} from "../../lib/server/prisma";

const API_BASE_URL = "https://api.zoom.us/v2";
const TOKEN_URL = "https://zoom.us/oauth/token";
const REQUEST_TIMEOUT_MS = 10_000;
const SAFE_PREFIX_PATTERN = /^ZAAD-LIVE-CONTRACT-[A-Za-z0-9-]{1,28}$/u;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const LIVE_ACKNOWLEDGEMENT = "I_UNDERSTAND_THIS_CREATES_AND_DELETES_ZOOM_RESOURCES";
const RETRYABLE_READ_STATUSES = new Set([429, 502, 503, 504]);
export const ZAAD_LIVE_SYNTHETIC_TTS_CONTENT = {
  created: "これはZAADの接続確認用に生成された合成音声です。実際の防災情報ではありません。",
  updated: "これは更新後のZAAD接続確認用合成音声です。実際の防災情報ではありません。",
} as const;
const SYNTHETIC_TTS_BOUNDARY_PREFIX =
  "これはZAADの500文字境界接続確認用に生成された合成音声です。実際の防災情報ではありません。";
export const ZAAD_LIVE_SYNTHETIC_TTS_500_CHARACTER_CONTENT =
  `${SYNTHETIC_TTS_BOUNDARY_PREFIX}${"テ".repeat(500 - SYNTHETIC_TTS_BOUNDARY_PREFIX.length)}`;

type JsonRecord = Record<string, unknown>;
type ResourceKind = "asset" | "campaign" | "contact" | "contact-list";
type LiveWriteFeature = "campaign" | "contact" | "tts";
type RequestMethod = "DELETE" | "GET" | "PATCH" | "POST";

type RequestResult = {
  payload: unknown;
  status: number;
};

export type LiveAssetSnapshot = {
  archived: boolean;
  content: string | null;
  id: string;
  itemId: string;
  name: string;
  type: string;
  voice: string | null;
};

export type LiveContactListSnapshot = {
  contactCount: number | null;
  id: string;
  name: string;
  type: string;
};

export type LiveContactSnapshot = {
  displayName: string;
  id: string;
};

export type LiveCampaignSnapshot = {
  agentlessAmdOffAction: "hang_up" | "play_media" | "use_flow" | null;
  alwaysRunning: boolean;
  assetId: string | null;
  contactListIds: string[];
  dialingMethod: string;
  id: string;
  name: string;
  status: string;
};

export class LiveZoomContractError extends Error {
  constructor(
    operation: string,
    readonly status: number | null,
    readonly resultUnknown: boolean,
  ) {
    super(
      `Zoom live contract operation failed: ${operation}`
        + (status === null ? "" : ` (HTTP ${status})`)
        + (resultUnknown ? " [result unknown; write was not retried]" : ""),
    );
    this.name = "LiveZoomContractError";
  }
}

export class LiveZoomContractMismatchError extends Error {
  constructor(contract: string, readonly status: number) {
    super(`Zoom tenant contract mismatch: ${contract} (HTTP ${status})`);
    this.name = "LiveZoomContractMismatchError";
  }
}

class OwnedResourceRegistry {
  private readonly resources = new Map<string, { kind: ResourceKind; name: string }>();

  claim(kind: ResourceKind, id: string, name: string) {
    assertSafeId(`${kind} ID`, id);
    this.assertSyntheticName(name);
    const key = this.key(kind, id);
    if (this.resources.has(key)) {
      throw new Error(`Refusing to claim the same ${kind} twice.`);
    }
    this.resources.set(key, { kind, name });
  }

  release(kind: ResourceKind, id: string) {
    this.assertOwned(kind, id);
    this.resources.delete(this.key(kind, id));
  }

  assertOwned(kind: ResourceKind, id: string) {
    if (!this.resources.has(this.key(kind, id))) {
      throw new Error(`Refusing to mutate an unclaimed ${kind} ID.`);
    }
  }

  owns(kind: ResourceKind, id: string) {
    return this.resources.has(this.key(kind, id));
  }

  assertSyntheticName(name: string) {
    if (!name.startsWith(`${this.prefix}-`) || name.length > 150) {
      throw new Error("Refusing to send a resource name outside the synthetic prefix.");
    }
  }

  constructor(private readonly prefix: string) {}

  private key(kind: ResourceKind, id: string) {
    return `${kind}:${id}`;
  }
}

export class LiveZoomContractContext {
  readonly names: {
    asset: string;
    assetUpdated: string;
    campaign: string;
    campaignUpdated: string;
    contact: string;
    contactUpdated: string;
    contactList: string;
    contactListUpdated: string;
  };

  private constructor(
    private readonly accessToken: string,
    private readonly owned: OwnedResourceRegistry,
    private readonly campaignConfiguration: {
      assignType: "customer" | "default" | "queue";
      flowId: string;
      phoneNumberId: string;
      queueId: string;
    } | null,
    prefix: string,
    runToken: string,
  ) {
    const base = `${prefix}-${runToken}`;
    this.names = {
      asset: `${base}-asset`,
      assetUpdated: `${base}-asset-updated`,
      campaign: `${base}-campaign`,
      campaignUpdated: `${base}-campaign-updated`,
      contact: `${base}-contact`,
      contactUpdated: `${base}-contact-updated`,
      contactList: `${base}-contacts`,
      contactListUpdated: `${base}-contacts-updated`,
    };
  }

  static async create(options: {
    requireCampaignConfiguration?: boolean;
    requiredWriteFeatures: readonly LiveWriteFeature[];
  }) {
    assertLiveSafetyGates(options.requiredWriteFeatures);
    const prefix = requiredEnvironment("ZAAD_ZOOM_LIVE_RESOURCE_PREFIX");
    if (!SAFE_PREFIX_PATTERN.test(prefix)) {
      throw new Error(
        "ZAAD_ZOOM_LIVE_RESOURCE_PREFIX must match ZAAD-LIVE-CONTRACT-[A-Za-z0-9-]{1,28}.",
      );
    }
    const credentials = await loadCredentials();
    const allowedAccountId = requiredEnvironment("ZAAD_ZOOM_LIVE_ACCOUNT_ID");
    if (!constantTimeTextEqual(credentials.accountId, allowedAccountId)) {
      throw new Error("The configured Zoom account does not match ZAAD_ZOOM_LIVE_ACCOUNT_ID.");
    }
    const accessToken = await fetchAccessToken(credentials);
    const campaignConfiguration = options.requireCampaignConfiguration
      ? readCampaignConfiguration()
      : null;
    const context = new LiveZoomContractContext(
      accessToken,
      new OwnedResourceRegistry(prefix),
      campaignConfiguration,
      prefix,
      randomBytes(6).toString("hex"),
    );
    await context.preflightReadScopes(Boolean(options.requireCampaignConfiguration));
    return context;
  }

  async createTtsAsset(input: { content: string; name: string; voice: "Kazuha" | "Mizuki" | "Takumi" | "Tomoko" }) {
    this.owned.assertSyntheticName(input.name);
    assertSyntheticTtsContent(input.content);
    const items = [{
      asset_item_content: input.content,
      asset_item_language: "ja-JP",
      asset_item_name: input.name,
      asset_item_voice: input.voice,
      is_default: true,
    }];
    const form = new FormData();
    form.append("asset_name", input.name);
    form.append("asset_description", "Synthetic ZAAD live contract resource");
    form.append("asset_type", "audio");
    form.append("asset_items", JSON.stringify(items));
    let response: RequestResult;
    try {
      response = await this.request("create TTS asset", "POST", "/contact_center/asset_library/assets", {
        body: form,
        expectedStatus: 201,
        mutation: true,
      });
    } catch (error) {
      if (
        input.content === ZAAD_LIVE_SYNTHETIC_TTS_500_CHARACTER_CONTENT
        && error instanceof LiveZoomContractError
        && error.status !== null
        && [400, 413, 422].includes(error.status)
      ) {
        throw new LiveZoomContractMismatchError(
          "the required 500-character Japanese TTS asset was rejected",
          error.status,
        );
      }
      throw error;
    }
    const id = requiredString(response.payload, ["asset_id"], "create TTS asset", true);
    const item = recordsAt(response.payload, "asset_items")[0];
    const itemId = requiredString(item, ["asset_item_id"], "create TTS asset item", true);
    this.owned.claim("asset", id, input.name);
    return { id, itemId };
  }

  async getAsset(id: string): Promise<LiveAssetSnapshot> {
    assertSafeId("asset ID", id);
    const response = await this.request("get asset", "GET", `/contact_center/asset_library/assets/${encodeURIComponent(id)}`, {
      expectedStatus: 200,
    });
    const item = recordsAt(response.payload, "asset_items")[0];
    return {
      archived: Boolean(asRecord(response.payload).archived),
      content: optionalString(item, ["asset_item_content"]),
      id: requiredString(response.payload, ["asset_id"], "get asset"),
      itemId: requiredString(item, ["asset_item_id"], "get asset item"),
      name: requiredString(response.payload, ["asset_name"], "get asset"),
      type: requiredString(response.payload, ["asset_type"], "get asset"),
      voice: optionalString(item, ["asset_item_voice"]),
    };
  }

  async assertTtsBoundaryReadback(id: string) {
    const snapshot = await this.getAsset(id);
    if (snapshot.content !== ZAAD_LIVE_SYNTHETIC_TTS_500_CHARACTER_CONTENT) {
      throw new LiveZoomContractMismatchError(
        "the required 500-character Japanese TTS content was not returned unchanged",
        200,
      );
    }
    return snapshot;
  }

  async updateTtsAssetItem(input: {
    content: string;
    id: string;
    voice: "Kazuha" | "Mizuki" | "Takumi" | "Tomoko";
  }) {
    this.owned.assertOwned("asset", input.id);
    assertSyntheticTtsContent(input.content);
    const response = await this.request(
      "update TTS asset item",
      "PATCH",
      "/contact_center/asset_library/assets/items",
      {
        body: {
          items: [{
            asset_id: input.id,
            asset_item_content: input.content,
            asset_item_language: "ja-JP",
            asset_item_voice: input.voice,
          }],
        },
        expectedStatus: 200,
        mutation: true,
      },
    );
    const root = asRecord(response.payload);
    if (!Array.isArray(root.succeeded_assets) || !Array.isArray(root.failed_assets)) {
      throw new LiveZoomContractError("validate TTS item batch result", 200, true);
    }
    const succeeded = root.succeeded_assets.map(asRecord);
    const failed = root.failed_assets.map(asRecord);
    if (
      failed.length !== 0
      || succeeded.length !== 1
      || optionalString(succeeded[0] ?? {}, ["asset_id"]) !== input.id
      || optionalString(succeeded[0] ?? {}, ["asset_item_language"]) !== "ja-JP"
    ) {
      throw new LiveZoomContractError(
        "validate TTS item batch result",
        200,
        succeeded.length !== 0 || failed.length !== 1,
      );
    }
  }

  async updateAssetName(id: string, name: string) {
    this.owned.assertOwned("asset", id);
    this.owned.assertSyntheticName(name);
    const form = new FormData();
    form.append("asset_name", name);
    await this.request("update asset name", "PATCH", `/contact_center/asset_library/assets/${encodeURIComponent(id)}`, {
      body: form,
      expectedStatus: 204,
      mutation: true,
    });
  }

  async archiveAsset(id: string) {
    this.owned.assertOwned("asset", id);
    await this.request("archive asset", "DELETE", `/contact_center/asset_library/assets/${encodeURIComponent(id)}?archive=true`, {
      expectedStatus: 204,
      mutation: true,
    });
  }

  async hardDeleteAsset(id: string) {
    this.owned.assertOwned("asset", id);
    await this.request("hard delete asset", "DELETE", `/contact_center/asset_library/assets/${encodeURIComponent(id)}?archive=false`, {
      expectedStatus: 204,
      mutation: true,
    });
    this.owned.release("asset", id);
  }

  async cleanupAsset(id: string) {
    if (!this.owned.owns("asset", id)) return;
    const snapshot = await this.tryGetAsset(id);
    if (!snapshot) {
      this.owned.release("asset", id);
      return;
    }
    if (!snapshot.archived) await this.archiveAsset(id);
    await this.hardDeleteAsset(id);
  }

  async createContactList(name: string) {
    this.owned.assertSyntheticName(name);
    const response = await this.request("create contact list", "POST", "/contact_center/outbound_campaign/contact_lists", {
      body: {
        contact_list_description: "Synthetic ZAAD live contract resource",
        contact_list_name: name,
        contact_list_type: "contact",
      },
      expectedStatus: 201,
      mutation: true,
    });
    const id = requiredString(response.payload, ["contact_list_id"], "create contact list", true);
    this.owned.claim("contact-list", id, name);
    return id;
  }

  async getContactList(id: string): Promise<LiveContactListSnapshot> {
    assertSafeId("contact list ID", id);
    const response = await this.request("get contact list", "GET", `/contact_center/outbound_campaign/contact_lists/${encodeURIComponent(id)}`, {
      expectedStatus: 200,
    });
    const payload = asRecord(response.payload);
    return {
      contactCount: optionalNumber(payload, ["contacts_count", "contact_count"]),
      id: requiredString(payload, ["contact_list_id", "id"], "get contact list"),
      name: requiredString(payload, ["contact_list_name", "name"], "get contact list"),
      type: requiredString(payload, ["contact_list_type", "type"], "get contact list"),
    };
  }

  async updateContactList(id: string, name: string) {
    this.owned.assertOwned("contact-list", id);
    this.owned.assertSyntheticName(name);
    await this.request("update contact list", "PATCH", `/contact_center/outbound_campaign/contact_lists/${encodeURIComponent(id)}`, {
      body: {
        contact_list_description: "Updated synthetic ZAAD live contract resource",
        contact_list_name: name,
      },
      expectedStatus: 204,
      mutation: true,
    });
  }

  async createContactsBatch(contactListId: string, contacts: Array<{ displayName: string; email: string; phone: string }>) {
    this.owned.assertOwned("contact-list", contactListId);
    if (contacts.length < 1 || contacts.length > 100) {
      throw new Error("The live contract batch must contain between 1 and 100 synthetic contacts.");
    }
    for (const contact of contacts) this.assertSyntheticContact(contact);
    const response = await this.request(
      "create contact batch",
      "POST",
      `/contact_center/outbound_campaign/contact_lists/${encodeURIComponent(contactListId)}/contacts/batch`,
      {
        body: {
          contacts: contacts.map((contact) => ({
            contact_display_name: contact.displayName,
            contact_emails: [contact.email],
            contact_phones: [{
              contact_phone_number: contact.phone,
              contact_phone_type: "Main",
            }],
          })),
        },
        expectedStatus: 200,
        mutation: true,
      },
    );
    const failures = recordsAt(response.payload, "failed_contacts");
    if (failures.length > 0) {
      throw new LiveZoomContractError("create contact batch returned rejected contacts", 200, true);
    }
  }

  async listContacts(contactListId: string): Promise<LiveContactSnapshot[]> {
    assertSafeId("contact list ID", contactListId);
    const contacts: LiveContactSnapshot[] = [];
    let nextPageToken: string | null = null;
    const seenTokens = new Set<string>();
    for (let page = 0; page < 100; page += 1) {
      const query = new URLSearchParams({ page_size: "100" });
      if (nextPageToken) query.set("next_page_token", nextPageToken);
      const response = await this.request(
        "list contacts",
        "GET",
        `/contact_center/outbound_campaign/contact_lists/${encodeURIComponent(contactListId)}/contacts?${query.toString()}`,
        { expectedStatus: 200 },
      );
      const root = asRecord(response.payload);
      for (const contact of recordsAt(root, "contacts")) {
        contacts.push({
          displayName: requiredString(contact, ["contact_display_name", "display_name", "name"], "list contacts"),
          id: requiredString(contact, ["contact_id", "id"], "list contacts"),
        });
      }
      const candidate = optionalString(root, ["next_page_token"]);
      if (!candidate) return contacts;
      assertSafePageToken(candidate);
      if (seenTokens.has(candidate)) throw new LiveZoomContractError("list contacts pagination", 200, false);
      seenTokens.add(candidate);
      nextPageToken = candidate;
    }
    throw new LiveZoomContractError("list contacts pagination limit", 200, false);
  }

  claimContact(id: string, name: string) {
    this.owned.claim("contact", id, name);
  }

  async updateContact(contactListId: string, contactId: string, input: { displayName: string; email: string; phone: string }) {
    this.owned.assertOwned("contact-list", contactListId);
    this.owned.assertOwned("contact", contactId);
    this.assertSyntheticContact(input);
    await this.request(
      "update contact",
      "PATCH",
      `/contact_center/outbound_campaign/contact_lists/${encodeURIComponent(contactListId)}/contacts/${encodeURIComponent(contactId)}`,
      {
        body: {
          contact_display_name: input.displayName,
          contact_emails: [input.email],
          contact_phones: [{ contact_phone_number: input.phone, contact_phone_type: "Main" }],
        },
        expectedStatus: 204,
        mutation: true,
      },
    );
  }

  async deleteContact(contactListId: string, contactId: string) {
    this.owned.assertOwned("contact-list", contactListId);
    this.owned.assertOwned("contact", contactId);
    await this.request(
      "delete contact",
      "DELETE",
      `/contact_center/outbound_campaign/contact_lists/${encodeURIComponent(contactListId)}/contacts/${encodeURIComponent(contactId)}`,
      { expectedStatus: 204, mutation: true },
    );
    this.owned.release("contact", contactId);
  }

  async deleteContactList(id: string) {
    this.owned.assertOwned("contact-list", id);
    await this.request("delete contact list", "DELETE", `/contact_center/outbound_campaign/contact_lists/${encodeURIComponent(id)}`, {
      expectedStatus: 204,
      mutation: true,
    });
    this.owned.release("contact-list", id);
  }

  async cleanupContactList(id: string, contactIds: string[] = []) {
    if (!this.owned.owns("contact-list", id)) return;
    for (const contactId of contactIds) {
      if (this.owned.owns("contact", contactId)) await this.deleteContact(id, contactId);
    }
    await this.deleteContactList(id);
  }

  async createDraftCampaign(input: { contactListId: string; name: string }) {
    const configuration = this.requireCampaignConfiguration();
    this.owned.assertOwned("contact-list", input.contactListId);
    this.owned.assertSyntheticName(input.name);
    const response = await this.request("create draft campaign", "POST", "/contact_center/outbound_campaign/campaigns", {
      body: {
        assign_type: configuration.assignType,
        business_hour_source: "queue",
        campaign_contact_list_ids: [input.contactListId],
        contact_timezone_source: "none",
        dialing_method: "agentless",
        dialing_method_settings: {
          agentless_amd_off_action: "useFlow",
          max_concurrent_calls: 1,
          new_flow_id: configuration.flowId,
        },
        enable_always_running: false,
        enable_diagnostics: false,
        max_attempts_per_contact: 1,
        outbound_campaign_description: "Synthetic ZAAD live contract resource; never run",
        outbound_campaign_name: input.name,
        phone_number_id: configuration.phoneNumberId,
        queue_id: configuration.queueId,
      },
      expectedStatus: 201,
      mutation: true,
    });
    const id = requiredString(response.payload, ["outbound_campaign_id"], "create draft campaign", true);
    this.owned.claim("campaign", id, input.name);
    return id;
  }

  async getCampaign(id: string): Promise<LiveCampaignSnapshot> {
    assertSafeId("campaign ID", id);
    const response = await this.request("get campaign", "GET", `/contact_center/outbound_campaign/campaigns/${encodeURIComponent(id)}`, {
      expectedStatus: 200,
    });
    const root = asRecord(response.payload);
    const dialingMethodSettings = asRecord(root.dialing_method_settings);
    const contactListIds = recordsAt(root, "campaign_contact_list")
      .map((contactList) => optionalString(contactList, ["contact_list_id", "id"]))
      .filter((contactListId): contactListId is string => contactListId !== null);
    if (contactListIds.length === 0 && Array.isArray(root.campaign_contact_list_ids)) {
      for (const contactListId of root.campaign_contact_list_ids) {
        if (typeof contactListId === "string" && contactListId.length > 0) {
          contactListIds.push(contactListId);
        }
      }
    }
    return {
      agentlessAmdOffAction: canonicalAgentlessAmdOffAction(
        optionalString(dialingMethodSettings, ["agentless_amd_off_action"]),
      ),
      alwaysRunning: Boolean(root.enable_always_running),
      assetId: optionalString(dialingMethodSettings, ["agentless_amd_off_resource_id"]),
      contactListIds,
      dialingMethod: requiredString(root, ["dialing_method"], "get campaign").toLowerCase(),
      id: requiredString(root, ["outbound_campaign_id", "campaign_id", "id"], "get campaign"),
      name: requiredString(root, ["outbound_campaign_name", "campaign_name", "name"], "get campaign"),
      status: requiredString(root, ["outbound_campaign_status", "status"], "get campaign").toLowerCase(),
    };
  }

  async updateDraftCampaign(id: string, name: string) {
    this.owned.assertOwned("campaign", id);
    this.owned.assertSyntheticName(name);
    await this.request("update draft campaign", "PATCH", `/contact_center/outbound_campaign/campaigns/${encodeURIComponent(id)}`, {
      body: {
        enable_always_running: false,
        outbound_campaign_description: "Updated synthetic ZAAD live contract resource; never run",
        outbound_campaign_name: name,
      },
      expectedStatus: 204,
      mutation: true,
    });
  }

  async configureDraftCampaignForTts(id: string, assetId: string) {
    const configuration = this.requireCampaignConfiguration();
    this.owned.assertOwned("campaign", id);
    this.owned.assertOwned("asset", assetId);
    await this.request(
      "configure draft campaign for TTS",
      "PATCH",
      `/contact_center/outbound_campaign/campaigns/${encodeURIComponent(id)}`,
      {
        body: {
          agentless_amd_off_action: "play_media",
          agentless_amd_off_resource_id: assetId,
          enable_always_running: false,
          max_concurrent_calls: 1,
          new_flow_id: configuration.flowId,
        },
        expectedStatus: 204,
        mutation: true,
      },
    );
  }

  async setCampaignDraftStatus(id: string) {
    this.owned.assertOwned("campaign", id);
    await this.request("set campaign Draft status", "PATCH", `/contact_center/outbound_campaign/campaigns/${encodeURIComponent(id)}/status`, {
      body: { status: "Draft" },
      expectedStatus: 204,
      mutation: true,
    });
  }

  async setCampaignReadyStatus(id: string) {
    this.owned.assertOwned("campaign", id);
    await this.request("set campaign Ready status", "PATCH", `/contact_center/outbound_campaign/campaigns/${encodeURIComponent(id)}/status`, {
      body: { status: "Ready" },
      expectedStatus: 204,
      mutation: true,
    });
  }

  async deleteCampaign(id: string) {
    this.owned.assertOwned("campaign", id);
    await this.request("delete campaign", "DELETE", `/contact_center/outbound_campaign/campaigns/${encodeURIComponent(id)}`, {
      expectedStatus: 204,
      mutation: true,
    });
    this.owned.release("campaign", id);
  }

  async cleanupCampaign(id: string) {
    if (this.owned.owns("campaign", id)) await this.deleteCampaign(id);
  }

  private requireCampaignConfiguration() {
    if (!this.campaignConfiguration) {
      throw new Error("Campaign configuration was not loaded for this live contract context.");
    }
    return this.campaignConfiguration;
  }

  private async preflightReadScopes(includeCampaigns: boolean) {
    const assets = await this.request(
      "preflight asset read scope",
      "GET",
      "/contact_center/asset_library/assets?page_size=1",
      { expectedStatus: 200 },
    );
    if (!Array.isArray(asRecord(assets.payload).assets)) {
      throw new LiveZoomContractError("validate asset preflight response", 200, false);
    }

    const contactLists = await this.request(
      "preflight contact-list read scope",
      "GET",
      "/contact_center/outbound_campaign/contact_lists?page_size=1&contact_list_type=contact",
      { expectedStatus: 200 },
    );
    if (!Array.isArray(asRecord(contactLists.payload).contact_lists)) {
      throw new LiveZoomContractError("validate contact-list preflight response", 200, false);
    }

    if (!includeCampaigns) return;
    const campaigns = await this.request(
      "preflight campaign read scope",
      "GET",
      "/contact_center/outbound_campaign/campaigns?page_size=1",
      { expectedStatus: 200 },
    );
    if (!Array.isArray(asRecord(campaigns.payload).outbound_campaign_items)) {
      throw new LiveZoomContractError("validate campaign preflight response", 200, false);
    }
  }

  private assertSyntheticContact(contact: { displayName: string; email: string; phone: string }) {
    this.owned.assertSyntheticName(contact.displayName);
    if (!/^[A-Za-z0-9.+-]+@example\.invalid$/u.test(contact.email)) {
      throw new Error("Live contract contacts must use the reserved example.invalid domain.");
    }
    if (!/^\+120255501\d{2}$/u.test(contact.phone)) {
      throw new Error("Live contract contacts must use the reserved +1-202-555-0100 to 0199 range.");
    }
  }

  private async tryGetAsset(id: string) {
    try {
      return await this.getAsset(id);
    } catch (error) {
      if (error instanceof LiveZoomContractError && error.status === 404) return null;
      throw error;
    }
  }

  private async request(
    operation: string,
    method: RequestMethod,
    path: string,
    options: {
      body?: FormData | JsonRecord;
      expectedStatus: number;
      mutation?: boolean;
    },
  ): Promise<RequestResult> {
    assertAllowedPath(path);
    if (Boolean(options.mutation) !== (method !== "GET")) {
      throw new Error("Live Zoom request mutation classification is inconsistent.");
    }
    assertSafeCampaignMutation(method, path, options.body);
    const attempts = method === "GET" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(new URL(path.replace(/^\//u, ""), `${API_BASE_URL}/`), {
          body: options.body === undefined
            ? undefined
            : options.body instanceof FormData
              ? options.body
              : JSON.stringify(options.body),
          cache: "no-store",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.accessToken}`,
            ...(options.body === undefined || options.body instanceof FormData
              ? {}
              : { "Content-Type": "application/json" }),
          },
          method,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        if (method === "GET" && attempt + 1 < attempts) continue;
        throw new LiveZoomContractError(operation, null, method !== "GET");
      }
      if (
        method === "GET"
        && RETRYABLE_READ_STATUSES.has(response.status)
        && attempt + 1 < attempts
      ) {
        continue;
      }
      if (response.status !== options.expectedStatus) {
        throw new LiveZoomContractError(
          operation,
          response.status,
          method !== "GET" && (response.status >= 500 || response.status === 429),
        );
      }
      if (response.status === 204) return { payload: null, status: response.status };
      try {
        return { payload: await response.json(), status: response.status };
      } catch {
        throw new LiveZoomContractError(operation, response.status, method !== "GET");
      }
    }
    throw new LiveZoomContractError(operation, null, method !== "GET");
  }
}

function assertLiveSafetyGates(requiredWriteFeatures: readonly LiveWriteFeature[]) {
  if (process.env.ZAAD_ZOOM_LIVE_CONTRACT_TEST !== "1") {
    throw new Error("ZAAD_ZOOM_LIVE_CONTRACT_TEST=1 is required.");
  }
  if (requiredWriteFeatures.length < 1 || new Set(requiredWriteFeatures).size !== requiredWriteFeatures.length) {
    throw new Error("Live contract tests must declare unique feature-specific write gates.");
  }
  const gateNames = {
    campaign: "ZAAD_ZOOM_CAMPAIGN_WRITE_CONTRACT_CONFIRMED",
    contact: "ZAAD_ZOOM_CONTACT_WRITE_CONTRACT_CONFIRMED",
    tts: "ZAAD_ZOOM_TTS_WRITE_CONTRACT_CONFIRMED",
  } as const;
  for (const feature of requiredWriteFeatures) {
    const gateName = gateNames[feature];
    if (process.env[gateName] !== "1") throw new Error(`${gateName}=1 is required.`);
  }
  if (process.env.ZAAD_ZOOM_LIVE_NON_PRODUCTION_ACK !== "1") {
    throw new Error("ZAAD_ZOOM_LIVE_NON_PRODUCTION_ACK=1 is required.");
  }
  if (process.env.ZAAD_ZOOM_LIVE_CONTRACT_ACK !== LIVE_ACKNOWLEDGEMENT) {
    throw new Error("The exact ZAAD_ZOOM_LIVE_CONTRACT_ACK acknowledgement is required.");
  }
  if (
    process.env.NODE_ENV === "production"
    || process.env.VERCEL_ENV === "production"
    || process.env.ZAAD_ZOOM_LIVE_TENANT_CLASS !== "non-production"
  ) {
    throw new Error("Zoom live contract tests are restricted to an explicitly acknowledged non-production tenant.");
  }
}

async function loadCredentials() {
  const database = createDatabaseContext(process.env);
  try {
    await connectDatabaseWithRetry(database.prisma);
    const row = await database.prisma.siteDeveloperApiSetting.findUnique({
      where: { id: 1 },
      select: {
        accountId: true,
        clientId: true,
        clientSecretEncrypted: true,
      },
    });
    if (!row?.accountId.trim() || !row.clientId.trim() || !row.clientSecretEncrypted) {
      throw new Error("Local ZAAD Developer API settings are incomplete.");
    }
    let clientSecret: string;
    try {
      clientSecret = decryptDeveloperApiSecret(row.clientSecretEncrypted, "clientSecret");
    } catch {
      throw new Error("Local ZAAD Developer API credentials cannot be decrypted.");
    }
    return {
      accountId: row.accountId.trim(),
      clientId: row.clientId.trim(),
      clientSecret,
    };
  } finally {
    await database.close();
  }
}

async function fetchAccessToken(credentials: { accountId: string; clientId: string; clientSecret: string }) {
  const url = new URL(TOKEN_URL);
  url.searchParams.set("account_id", credentials.accountId);
  url.searchParams.set("grant_type", "account_credentials");
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
      },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new LiveZoomContractError("request Server-to-Server OAuth token", null, false);
  }
  if (response.status !== 200) {
    throw new LiveZoomContractError("request Server-to-Server OAuth token", response.status, false);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LiveZoomContractError("parse Server-to-Server OAuth token", response.status, false);
  }
  return requiredString(payload, ["access_token"], "request Server-to-Server OAuth token");
}

function readCampaignConfiguration(): {
  assignType: "customer" | "default" | "queue";
  flowId: string;
  phoneNumberId: string;
  queueId: string;
} {
  const assignType = requiredEnvironment("ZAAD_ZOOM_LIVE_CAMPAIGN_ASSIGN_TYPE");
  if (assignType !== "customer" && assignType !== "default" && assignType !== "queue") {
    throw new Error("ZAAD_ZOOM_LIVE_CAMPAIGN_ASSIGN_TYPE must be customer, default, or queue.");
  }
  return {
    assignType,
    flowId: requiredSafeIdEnvironment("ZAAD_ZOOM_LIVE_FLOW_ID"),
    phoneNumberId: requiredSafeIdEnvironment("ZAAD_ZOOM_LIVE_PHONE_NUMBER_ID"),
    queueId: requiredSafeIdEnvironment("ZAAD_ZOOM_LIVE_QUEUE_ID"),
  };
}

function requiredSafeIdEnvironment(name: string) {
  const value = requiredEnvironment(name);
  assertSafeId(name, value);
  return value;
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertSafeId(label: string, value: string) {
  if (!SAFE_ID_PATTERN.test(value)) throw new Error(`${label} has an unsafe format.`);
}

function assertAllowedPath(path: string) {
  const allowed = [
    /^\/contact_center\/asset_library\/assets(?:\/items|\/[A-Za-z0-9_-]{1,64})?$/u,
    /^\/contact_center\/asset_library\/assets\?page_size=1$/u,
    /^\/contact_center\/asset_library\/assets\/[A-Za-z0-9_-]{1,64}\?archive=(?:true|false)$/u,
    /^\/contact_center\/outbound_campaign\/contact_lists$/u,
    /^\/contact_center\/outbound_campaign\/contact_lists\?page_size=1&contact_list_type=contact$/u,
    /^\/contact_center\/outbound_campaign\/contact_lists\/[A-Za-z0-9_-]{1,64}$/u,
    /^\/contact_center\/outbound_campaign\/contact_lists\/[A-Za-z0-9_-]{1,64}\/contacts(?:\?page_size=100(?:&next_page_token=[A-Za-z0-9._~%+-]{1,300})?)?$/u,
    /^\/contact_center\/outbound_campaign\/contact_lists\/[A-Za-z0-9_-]{1,64}\/contacts\/(?:batch|[A-Za-z0-9_-]{1,64})$/u,
    /^\/contact_center\/outbound_campaign\/campaigns(?:\/[A-Za-z0-9_-]{1,64}(?:\/status)?|\?page_size=1)?$/u,
  ];
  if (!allowed.some((pattern) => pattern.test(path))) {
    throw new Error("Refusing to call a Zoom path outside the live contract allowlist.");
  }
}

function assertSafeCampaignMutation(
  method: RequestMethod,
  path: string,
  body: FormData | JsonRecord | undefined,
) {
  if (!path.startsWith("/contact_center/outbound_campaign/campaigns") || method === "GET") return;
  if (body instanceof FormData) {
    throw new Error("Campaign contract mutations must use a JSON body.");
  }
  const root = asRecord(body);
  if (method === "POST" && path === "/contact_center/outbound_campaign/campaigns") {
    const settings = asRecord(root.dialing_method_settings);
    if (
      root.dialing_method !== "agentless"
      || root.enable_always_running !== false
      || root.outbound_campaign_status !== undefined
      || settings.agentless_amd_off_action !== "useFlow"
      || settings.max_concurrent_calls !== 1
      || typeof settings.new_flow_id !== "string"
    ) {
      throw new Error("Refusing to create a campaign outside the safe Draft-only contract profile.");
    }
    return;
  }
  if (method === "PATCH" && /\/campaigns\/[A-Za-z0-9_-]{1,64}\/status$/u.test(path)) {
    if ((root.status !== "Draft" && root.status !== "Ready") || Object.keys(root).length !== 1) {
      throw new Error("Live contract tests may only submit Draft or Ready campaign status; Running and Paused are forbidden.");
    }
    return;
  }
  if (method === "PATCH" && /\/campaigns\/[A-Za-z0-9_-]{1,64}$/u.test(path)) {
    if (root.status !== undefined || root.enable_always_running !== false) {
      throw new Error("Refusing an unsafe live campaign update.");
    }
    if (root.agentless_amd_off_action !== undefined) {
      const allowedKeys = new Set([
        "agentless_amd_off_action",
        "agentless_amd_off_resource_id",
        "enable_always_running",
        "max_concurrent_calls",
        "new_flow_id",
      ]);
      if (
        root.agentless_amd_off_action !== "play_media"
        || typeof root.agentless_amd_off_resource_id !== "string"
        || !SAFE_ID_PATTERN.test(root.agentless_amd_off_resource_id)
        || root.max_concurrent_calls !== 1
        || typeof root.new_flow_id !== "string"
        || !SAFE_ID_PATTERN.test(root.new_flow_id)
        || Object.keys(root).some((key) => !allowedKeys.has(key))
      ) {
        throw new Error("Refusing a campaign TTS configuration outside the safe live contract profile.");
      }
      return;
    }
    const allowedKeys = new Set([
      "enable_always_running",
      "outbound_campaign_description",
      "outbound_campaign_name",
    ]);
    if (Object.keys(root).some((key) => !allowedKeys.has(key))) {
      throw new Error("Refusing an unsupported live campaign metadata update.");
    }
    return;
  }
  if (method === "DELETE" && /\/campaigns\/[A-Za-z0-9_-]{1,64}$/u.test(path) && body === undefined) return;
  throw new Error("Refusing an unsupported live campaign mutation.");
}

function assertSyntheticTtsContent(value: string) {
  if (
    value !== ZAAD_LIVE_SYNTHETIC_TTS_CONTENT.created
    && value !== ZAAD_LIVE_SYNTHETIC_TTS_CONTENT.updated
    && value !== ZAAD_LIVE_SYNTHETIC_TTS_500_CHARACTER_CONTENT
  ) {
    throw new Error("Live contract TTS content must use the fixed synthetic safety message.");
  }
}

function canonicalAgentlessAmdOffAction(
  value: string | null,
): LiveCampaignSnapshot["agentlessAmdOffAction"] {
  if (value === "useFlow" || value === "use_flow") return "use_flow";
  if (value === "hangUp" || value === "hang_up") return "hang_up";
  if (value === "playMedia" || value === "play_media") return "play_media";
  return null;
}

function assertSafePageToken(value: string) {
  if (value.length > 100 || /[\u0000-\u001F\u007F]/u.test(value)) {
    throw new LiveZoomContractError("validate contact pagination token", 200, false);
  }
}

function requiredString(value: unknown, keys: string[], operation: string, resultUnknown = false) {
  const candidate = optionalString(asRecord(value), keys);
  if (!candidate) throw new LiveZoomContractError(operation, 200, resultUnknown);
  return candidate;
}

function optionalString(value: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

function optionalNumber(value: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && /^\d+$/u.test(candidate)) return Number(candidate);
  }
  return null;
}

function recordsAt(value: unknown, key: string) {
  const candidate = asRecord(value)[key];
  return Array.isArray(candidate) ? candidate.map(asRecord) : [];
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function constantTimeTextEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}
