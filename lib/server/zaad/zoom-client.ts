import { createHash } from "node:crypto";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import { decryptDeveloperApiSecret } from "@/lib/server/developer-api-crypto";
import { ZAAD_ERROR_CODES, ZAAD_LIMITS, type ZaadErrorCode } from "@/lib/zaad/contracts";

const DEFAULT_API_BASE = "https://api.zoom.us/v2";
const DEFAULT_TOKEN_URL = "https://zoom.us/oauth/token";
const REQUEST_TIMEOUT_MS = 8_000;
const TOKEN_SKEW_MS = 60_000;
const CONTACT_BATCH_MAX_ITEMS = 100;
const CONTACT_PAGINATION_MAX_PAGES = 100;

export type ZaadZoomConnectionState = "connected" | "missing" | "scope" | "expired" | "outage";

export type ZoomContactListDto = {
  id: string;
  name: string;
  description: string;
  type: "contact";
  contactCount: number | null;
  revision: string;
  updatedAt: string | null;
};

export type ZoomCampaignDto = {
  id: string;
  name: string;
  dialingMethod: string;
  status: string;
  contactListId: string | null;
  contactListName: string | null;
  contactCount: number | null;
  queueName: string | null;
  callerIdMasked: string | null;
  maxConcurrentCalls: number | null;
  businessHours: string | null;
  retryPolicy: string | null;
  dncPolicy: string | null;
  alwaysRunning: boolean;
  revision: string;
};

export type ZoomContactDto = {
  id: string;
  displayName: string;
  phones: Array<{ type: string; number: string }>;
  emails: string[];
};

export type ZoomBatchContactInput = {
  name: string;
  phone: string;
  email: string;
};

export type ZoomBatchContactResult =
  | { success: true }
  | { success: false; code: typeof ZAAD_ERROR_CODES.zoomContactRejected };

export type ZoomTtsAssetInput = {
  name: string;
  body: string;
  languageCode: "ja-JP";
  voiceId: "Tomoko" | "Takumi" | "Mizuki" | "Kazuha";
};

export type ZoomTtsAssetResult = {
  assetId: string;
  assetItemId: string;
};

export type ZoomOneTimeCampaignProfile = {
  queueId: string;
  phoneNumberId: string;
  assignType: "queue" | "default" | "customer" | null;
  maxConcurrentCalls: number;
  newFlowId: string;
  oldFlowId: string | null;
  outboundCampaignPriority: number | null;
  dncListIds: string[];
  exclusionLogic: "and" | "or" | null;
  maxAttemptsPerContact: number | null;
  attemptsUseSamePeriod: boolean | null;
  secondAttemptPeriod: number | null;
  thirdAttemptPeriod: number | null;
  otherAttemptPeriod: number | null;
  retryPeriod: number | null;
  retryPeriodUnit: "seconds" | "minutes" | "hours" | "days" | null;
  dialSequence: "list_dial" | "contact_dial" | "contact_with_lock" | null;
  enableMaxRingTime: boolean | null;
  maxRingTime: number | null;
  businessHourSource: "queue" | "campaign" | null;
  businessHourId: string | null;
  enableClosureHour: boolean | null;
  closureSetId: string | null;
  contactTimezoneSource: "none" | "timezone" | "area_code" | null;
  contactPhoneOrder: string | null;
  enableDiagnostics: boolean | null;
  localCallingWindows: Array<{ start: string; end: string }>;
};

export type ZoomOneTimeCampaignReadback = {
  id: string;
  dialingMethod: string;
  status: string;
  contactListId: string | null;
  agentlessAmdOffAction: "use_flow" | "hang_up" | "play_media" | null;
  assetId: string | null;
  alwaysRunning: boolean;
};

export type ZaadZoomWriteGates = Readonly<{
  contact: boolean;
  tts: boolean;
  campaign: boolean;
}>;

export class ZaadZoomError extends Error {
  constructor(
    readonly code: ZaadErrorCode,
    readonly httpStatus: number,
    readonly resultUnknown = false,
  ) {
    super(code);
    this.name = "ZaadZoomError";
  }
}

type FetchLike = typeof fetch;

type TokenCacheEntry = {
  credentialFingerprint: string;
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCacheEntry | null = null;

export function clearZaadZoomTokenCache() {
  tokenCache = null;
}

export class ZaadZoomClient {
  private constructor(
    private readonly credentials: { accountId: string; clientId: string; clientSecret: string; credentialVersion?: string },
    private readonly fetchImpl: FetchLike,
    private readonly apiBase: string,
    private readonly tokenUrl: string,
    private readonly writeGates: ZaadZoomWriteGates,
  ) {}

  static async fromDatabase(
    prisma: PrismaClient,
    options: {
      fetchImpl?: FetchLike;
      apiBase?: string;
      tokenUrl?: string;
      writeGates?: ZaadZoomWriteGates;
    } = {},
  ) {
    const row = await prisma.siteDeveloperApiSetting.findUnique({
      where: { id: 1 },
      select: {
        accountId: true,
        clientId: true,
        clientSecretEncrypted: true,
        updatedAt: true,
      },
    });
    if (!row?.accountId.trim() || !row.clientId.trim() || !row.clientSecretEncrypted) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotConfigured, 503);
    }
    let clientSecret: string;
    try {
      clientSecret = decryptDeveloperApiSecret(row.clientSecretEncrypted, "clientSecret");
    } catch {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotConfigured, 503);
    }
    const apiBase = resolveEndpoint(options.apiBase, "ZAAD_ZOOM_API_BASE_URL", DEFAULT_API_BASE);
    const tokenUrl = resolveEndpoint(options.tokenUrl, "ZAAD_ZOOM_TOKEN_URL", DEFAULT_TOKEN_URL);
    const writeGates = options.writeGates ?? {
      contact: process.env.ZAAD_ZOOM_CONTACT_WRITE_CONTRACT_CONFIRMED === "1",
      tts: process.env.ZAAD_ZOOM_TTS_WRITE_CONTRACT_CONFIRMED === "1",
      campaign: process.env.ZAAD_ZOOM_CAMPAIGN_WRITE_CONTRACT_CONFIRMED === "1",
    };
    return new ZaadZoomClient(
      {
        accountId: row.accountId.trim(),
        clientId: row.clientId.trim(),
        clientSecret,
        credentialVersion: row.updatedAt.toISOString(),
      },
      options.fetchImpl ?? fetch,
      apiBase,
      tokenUrl,
      writeGates,
    );
  }

  async probe(): Promise<ZaadZoomConnectionState> {
    try {
      await this.listContactLists({ pageSize: 1 });
      return "connected";
    } catch (error) {
      if (!(error instanceof ZaadZoomError)) return "outage";
      if (error.code === ZAAD_ERROR_CODES.zoomNotConfigured) return "missing";
      if (error.code === ZAAD_ERROR_CODES.zoomScopeRequired) return "scope";
      if (error.code === ZAAD_ERROR_CODES.zoomUnavailable) return "outage";
      if (error.code === ZAAD_ERROR_CODES.zoomCredentialsInvalid) return "expired";
      return "expired";
    }
  }

  async listContactLists(input: { pageSize?: number; nextPageToken?: string } = {}) {
    const query = new URLSearchParams({
      contact_list_type: "contact",
      page_size: String(boundedPageSize(input.pageSize)),
    });
    if (input.nextPageToken) query.set("next_page_token", input.nextPageToken);
    const payload = await this.requestJson("GET", `/contact_center/outbound_campaign/contact_lists?${query.toString()}`);
    const root = asRecord(payload);
    const rows = arrayAt(root, ["contact_lists", "lists"]);
    return {
      lists: rows.map((entry) => parseContactList(asRecord(entry), "contact")).filter((value): value is ZoomContactListDto => value !== null),
      nextPageToken: stringAt(root, ["next_page_token"]) ?? null,
    };
  }

  async getContactList(id: string): Promise<ZoomContactListDto> {
    const payload = await this.requestJson("GET", `/contact_center/outbound_campaign/contact_lists/${encodeId(id)}`);
    const result = parseContactList(asRecord(payload));
    if (!result || result.type !== "contact") throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    return result;
  }

  async createContactList(input: { name: string; description: string }): Promise<ZoomContactListDto> {
    this.assertWriteEnabled("contact");
    const payload = await this.requestJson("POST", "/contact_center/outbound_campaign/contact_lists", {
      contact_list_name: input.name,
      contact_list_description: input.description,
      contact_list_type: "contact",
    });
    const result = parseContactList(asRecord(payload), "contact");
    if (!result) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    return result;
  }

  async updateContactList(id: string, input: { name: string; description: string }): Promise<ZoomContactListDto> {
    this.assertWriteEnabled("contact");
    await this.requestJson("PATCH", `/contact_center/outbound_campaign/contact_lists/${encodeId(id)}`, {
      contact_list_name: input.name,
      contact_list_description: input.description,
    }, true);
    try {
      return await this.getContactList(id);
    } catch {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    }
  }

  async deleteContactList(id: string): Promise<void> {
    this.assertWriteEnabled("contact");
    await this.requestJson("DELETE", `/contact_center/outbound_campaign/contact_lists/${encodeId(id)}`, undefined, true);
  }

  async listContacts(contactListId: string): Promise<ZoomContactDto[]> {
    const contacts: ZoomContactDto[] = [];
    let nextPageToken: string | null = null;
    const seenNextPageTokens = new Set<string>();
    for (let page = 0; page < CONTACT_PAGINATION_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ page_size: "100" });
      if (nextPageToken) query.set("next_page_token", nextPageToken);
      const payload = await this.requestJson(
        "GET",
        `/contact_center/outbound_campaign/contact_lists/${encodeId(contactListId)}/contacts?${query.toString()}`,
      );
      const root = asRecord(payload);
      for (const entry of arrayAt(root, ["contacts"])) {
        const parsed = parseContact(asRecord(entry));
        if (parsed) contacts.push(parsed);
      }
      const candidate = parseNextPageToken(root.next_page_token);
      if (!candidate) return contacts;
      if (seenNextPageTokens.has(candidate)) {
        throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
      }
      seenNextPageTokens.add(candidate);
      nextPageToken = candidate;
    }
    throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
  }

  async createContact(contactListId: string, input: { name: string; phone: string; email: string }): Promise<string> {
    this.assertWriteEnabled("contact");
    const payload = await this.requestJson(
      "POST",
      `/contact_center/outbound_campaign/contact_lists/${encodeId(contactListId)}/contacts`,
      {
        contact_display_name: input.name,
        contact_phones: [{ contact_phone_number: input.phone, contact_phone_type: "Main" }],
        ...(input.email ? { contact_emails: [input.email] } : {}),
      },
    );
    const id = stringAt(asRecord(payload), ["contact_id", "id"]);
    if (!id) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    return id;
  }

  async createContactsBatch(
    contactListId: string,
    contacts: ZoomBatchContactInput[],
  ): Promise<ZoomBatchContactResult[]> {
    this.assertWriteEnabled("contact");
    if (contacts.length < 1 || contacts.length > CONTACT_BATCH_MAX_ITEMS) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.invalidRequest, 400);
    }
    const payload = await this.requestJson(
      "POST",
      `/contact_center/outbound_campaign/contact_lists/${encodeId(contactListId)}/contacts/batch`,
      {
        contacts: contacts.map((contact) => ({
          contact_display_name: contact.name,
          contact_phones: [{ contact_phone_number: contact.phone, contact_phone_type: "Main" }],
          ...(contact.email ? { contact_emails: [contact.email] } : {}),
        })),
      },
    );
    const root = asRecord(payload);
    if (root.failed_contacts !== undefined && !Array.isArray(root.failed_contacts)) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    }
    const failedIndices = new Set<number>();
    for (const entry of arrayAt(root, ["failed_contacts"])) {
      const failed = asRecord(entry);
      const rawIndex = failed.contact_index;
      if (typeof rawIndex !== "string" || !/^(?:0|[1-9]\d*)$/u.test(rawIndex)) {
        throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
      }
      const index = Number(rawIndex);
      if (!Number.isSafeInteger(index) || index >= contacts.length || failedIndices.has(index)) {
        throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
      }
      failedIndices.add(index);
    }
    return contacts.map((_, index) => failedIndices.has(index)
      ? { success: false as const, code: ZAAD_ERROR_CODES.zoomContactRejected }
      : { success: true as const });
  }

  async updateContact(contactListId: string, contactId: string, input: { name: string; phone: string; email: string }): Promise<void> {
    this.assertWriteEnabled("contact");
    await this.requestJson(
      "PATCH",
      `/contact_center/outbound_campaign/contact_lists/${encodeId(contactListId)}/contacts/${encodeId(contactId)}`,
      {
        contact_display_name: input.name,
        contact_phones: [{ contact_phone_number: input.phone, contact_phone_type: "Main" }],
        ...(input.email ? { contact_emails: [input.email] } : {}),
      },
      true,
    );
  }

  async deleteContact(contactListId: string, contactId: string): Promise<void> {
    this.assertWriteEnabled("contact");
    await this.requestJson(
      "DELETE",
      `/contact_center/outbound_campaign/contact_lists/${encodeId(contactListId)}/contacts/${encodeId(contactId)}`,
      undefined,
      true,
      true,
    );
  }

  async listCampaigns(input: { pageSize?: number; nextPageToken?: string } = {}) {
    const query = new URLSearchParams({ page_size: String(boundedPageSize(input.pageSize)) });
    if (input.nextPageToken) query.set("next_page_token", input.nextPageToken);
    const payload = await this.requestJson("GET", `/contact_center/outbound_campaign/campaigns?${query.toString()}`);
    const root = asRecord(payload);
    return {
      campaigns: arrayAt(root, ["outbound_campaign_items", "campaigns"]).map((entry) => parseCampaign(asRecord(entry))).filter((entry): entry is ZoomCampaignDto => entry !== null),
      nextPageToken: stringAt(root, ["next_page_token"]) ?? null,
    };
  }

  async getCampaign(id: string): Promise<ZoomCampaignDto> {
    const payload = await this.requestJson("GET", `/contact_center/outbound_campaign/campaigns/${encodeId(id)}`);
    const result = parseCampaign(asRecord(payload));
    if (!result) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    return result;
  }

  async getCampaignPreparationProfile(id: string): Promise<{
    campaign: ZoomCampaignDto;
    profile: ZoomOneTimeCampaignProfile;
  }> {
    const payload = asRecord(await this.requestJson(
      "GET",
      `/contact_center/outbound_campaign/campaigns/${encodeId(id)}`,
    ));
    const campaign = parseCampaign(payload);
    if (campaign && campaign.dialingMethod !== "agentless") {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.campaignNotAgentless, 409);
    }
    const profile = parseOneTimeCampaignProfile(payload);
    if (!campaign || !profile) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    return { campaign, profile };
  }

  async setCampaignStatus(id: string, status: "Draft" | "Running" | "Paused" | "Ready"): Promise<void> {
    this.assertWriteEnabled("campaign");
    await this.requestJson(
      "PATCH",
      `/contact_center/outbound_campaign/campaigns/${encodeId(id)}/status`,
      { status },
      true,
    );
  }

  async getTtsAsset(id: string): Promise<ZoomTtsAssetResult> {
    const payload = await this.requestJson("GET", `/contact_center/asset_library/assets/${encodeId(id)}`);
    const result = parseTtsAsset(asRecord(payload));
    if (!result || result.assetId !== id) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    }
    return result;
  }

  async createTtsAsset(input: ZoomTtsAssetInput): Promise<ZoomTtsAssetResult> {
    this.assertWriteEnabled("tts");
    assertTtsInputBoundary(input);
    const payload = await this.requestJson(
      "POST",
      "/contact_center/asset_library/assets",
      ttsAssetFormData(input),
    );
    const result = parseTtsAsset(asRecord(payload));
    if (!result) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    return result;
  }

  async updateTtsAsset(
    assetId: string,
    assetItemId: string,
    input: ZoomTtsAssetInput,
  ): Promise<ZoomTtsAssetResult> {
    this.assertWriteEnabled("tts");
    assertTtsInputBoundary(input);
    const payload = await this.requestJson(
      "PATCH",
      "/contact_center/asset_library/assets/items",
      {
        items: [{
          asset_id: assetId,
          asset_item_language: input.languageCode,
          asset_item_name: input.name,
          asset_item_voice: input.voiceId,
          asset_item_content: input.body,
        }],
      },
    );
    const root = asRecord(payload);
    if (!Array.isArray(root.succeeded_assets) || !Array.isArray(root.failed_assets)) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    }
    const succeeded = root.succeeded_assets.map((entry) => asRecord(entry));
    const failed = root.failed_assets.map((entry) => asRecord(entry));
    if (succeeded.length === 0 && isKnownTtsUpdateFailure(failed, assetId, input.languageCode)) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotFound, 404);
    }
    if (
      failed.length !== 0 ||
      succeeded.length !== 1 ||
      stringAt(succeeded[0] ?? {}, ["asset_id"]) !== assetId ||
      stringAt(succeeded[0] ?? {}, ["asset_item_language"]) !== input.languageCode
    ) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    }
    const form = new FormData();
    form.set("asset_name", input.name);
    try {
      await this.requestJson(
        "PATCH",
        `/contact_center/asset_library/assets/${encodeId(assetId)}`,
        form,
        true,
      );
    } catch {
      // The item update was confirmed before the asset-name write. Any failure
      // from this point leaves a potentially partial remote update that must be
      // reconciled manually instead of being classified as a safe retry.
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    }
    return { assetId, assetItemId };
  }

  async deleteTtsAsset(id: string): Promise<void> {
    this.assertWriteEnabled("tts");
    const encodedId = encodeId(id);
    for (const archive of [true, false]) {
      await this.requestJson(
        "DELETE",
        `/contact_center/asset_library/assets/${encodedId}?archive=${archive}`,
        undefined,
        true,
        true,
      );
    }
  }

  async createDraftOneTimeCampaign(input: {
    name: string;
    profile: ZoomOneTimeCampaignProfile;
    contactListId: string;
  }): Promise<string> {
    this.assertWriteEnabled("campaign");
    const payload = await this.requestJson(
      "POST",
      "/contact_center/outbound_campaign/campaigns",
      compactObject({
        outbound_campaign_name: input.name,
        outbound_campaign_description: "ZAAD one-time dispatch",
        queue_id: input.profile.queueId,
        phone_number_id: input.profile.phoneNumberId,
        assign_type: input.profile.assignType,
        dialing_method: "agentless",
        dialing_method_settings: compactObject({
          max_concurrent_calls: input.profile.maxConcurrentCalls,
          new_flow_id: input.profile.newFlowId,
          old_flow_id: input.profile.oldFlowId,
          agentless_amd_off_action: "hangUp",
        }),
        campaign_contact_list_ids: [input.contactListId],
        outbound_campaign_priority: input.profile.outboundCampaignPriority,
        campaign_do_not_contact_list_ids: input.profile.dncListIds,
        exclusion_logic: input.profile.exclusionLogic,
        max_attempts_per_contact: input.profile.maxAttemptsPerContact,
        attempts_use_same_period: input.profile.attemptsUseSamePeriod,
        second_attempt_period: input.profile.secondAttemptPeriod,
        third_attempt_period: input.profile.thirdAttemptPeriod,
        other_attempt_period: input.profile.otherAttemptPeriod,
        retry_period: input.profile.retryPeriod,
        retry_period_unit: input.profile.retryPeriodUnit,
        dial_sequence: input.profile.dialSequence,
        enable_max_ring_time: input.profile.enableMaxRingTime,
        max_ring_time: input.profile.maxRingTime,
        business_hour_source: input.profile.businessHourSource,
        business_hour_id: input.profile.businessHourId,
        enable_closure_hour: input.profile.enableClosureHour,
        closure_set_id: input.profile.closureSetId,
        contact_timezone_source: input.profile.contactTimezoneSource,
        contact_phone_order: input.profile.contactPhoneOrder,
        enable_always_running: false,
        enable_diagnostics: input.profile.enableDiagnostics,
        local_calling_windows: input.profile.localCallingWindows.length > 0
          ? input.profile.localCallingWindows
          : null,
      }),
    );
    const campaignId = stringAt(asRecord(payload), ["outbound_campaign_id", "campaign_id", "id"]);
    if (!campaignId) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
    return campaignId;
  }

  async configureDraftOneTimeCampaign(
    id: string,
    input: { profile: ZoomOneTimeCampaignProfile; assetId: string },
  ): Promise<void> {
    this.assertWriteEnabled("campaign");
    await this.requestJson(
      "PATCH",
      `/contact_center/outbound_campaign/campaigns/${encodeId(id)}`,
      compactObject({
        max_concurrent_calls: input.profile.maxConcurrentCalls,
        new_flow_id: input.profile.newFlowId,
        old_flow_id: input.profile.oldFlowId,
        agentless_amd_off_action: "play_media",
        agentless_amd_off_resource_id: input.assetId,
        enable_always_running: false,
      }),
      true,
    );
  }

  async getOneTimeCampaignReadback(id: string): Promise<ZoomOneTimeCampaignReadback> {
    const payload = asRecord(await this.requestJson(
      "GET",
      `/contact_center/outbound_campaign/campaigns/${encodeId(id)}`,
    ));
    const campaign = parseCampaign(payload);
    if (!campaign) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    const settings = asRecord(payload.dialing_method_settings);
    return {
      id: campaign.id,
      dialingMethod: campaign.dialingMethod,
      status: campaign.status,
      contactListId: campaign.contactListId,
      agentlessAmdOffAction: canonicalAgentlessAmdOffAction(stringAt(settings, ["agentless_amd_off_action"])),
      assetId: stringAt(settings, ["agentless_amd_off_resource_id"]),
      alwaysRunning: campaign.alwaysRunning,
    };
  }

  async deleteCampaign(id: string): Promise<void> {
    this.assertWriteEnabled("campaign");
    await this.requestJson(
      "DELETE",
      `/contact_center/outbound_campaign/campaigns/${encodeId(id)}`,
      undefined,
      true,
      true,
    );
  }

  assertOneTimePreparationWritesEnabled() {
    this.assertWriteEnabled("contact");
    this.assertWriteEnabled("tts");
    this.assertWriteEnabled("campaign");
  }

  private assertWriteEnabled(feature: keyof ZaadZoomWriteGates) {
    if (!this.writeGates[feature]) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomContractUnconfirmed, 503);
    }
  }

  private async requestJson(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    allowEmpty = false,
    notFoundIsSuccess = false,
  ): Promise<unknown> {
    if (!isAllowedPath(path)) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 500);
    let transientRetries = 0;
    let unauthorizedRetries = 0;
    while (true) {
      const accessToken = await this.accessToken();
      let response: Response;
      try {
        response = await this.fetchImpl(new URL(path.replace(/^\//u, ""), `${this.apiBase}/`), {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            ...(body === undefined || body instanceof FormData ? {} : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch {
        if (method !== "GET") throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
        if (transientRetries < 1) {
          transientRetries += 1;
          continue;
        }
        throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502);
      }
      if (notFoundIsSuccess && response.status === 404) return null;
      if (response.ok) {
        if (response.status === 204 || response.headers.get("content-length") === "0") return allowEmpty ? null : {};
        try {
          return await response.json();
        } catch {
          if (allowEmpty) return null;
          throw method === "GET"
            ? new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502)
            : new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
        }
      }
      if (response.status === 401) {
        this.evictAccessToken(accessToken);
        if (method === "GET" && unauthorizedRetries < 1) {
          unauthorizedRetries += 1;
          continue;
        }
      }
      const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
      if (method === "GET" && retryable && transientRetries < 1) {
        transientRetries += 1;
        await boundedRetryDelay(response.headers.get("retry-after"));
        continue;
      }
      throw mapZoomStatus(response.status, method !== "GET");
    }
  }

  private evictAccessToken(accessToken: string) {
    if (tokenCache?.accessToken === accessToken) tokenCache = null;
  }

  private async accessToken() {
    const credentialFingerprint = createHash("sha256")
      .update(this.credentials.accountId)
      .update("\u0000")
      .update(this.credentials.clientId)
      .update("\u0000")
      .update(this.credentials.clientSecret)
      .update("\u0000")
      .update(this.credentials.credentialVersion ?? "")
      .digest("base64url");
    if (tokenCache?.credentialFingerprint === credentialFingerprint && tokenCache.expiresAt - TOKEN_SKEW_MS > Date.now()) {
      return tokenCache.accessToken;
    }
    const url = new URL(this.tokenUrl);
    url.searchParams.set("grant_type", "account_credentials");
    url.searchParams.set("account_id", this.credentials.accountId);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString("base64")}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502);
    }
    if (!response.ok) throw mapZoomStatus(response.status);
    let payload: Record<string, unknown>;
    try {
      payload = asRecord(await response.json());
    } catch {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    }
    const accessToken = stringAt(payload, ["access_token"]);
    const expiresIn = numberAt(payload, ["expires_in"]);
    if (!accessToken || !expiresIn || expiresIn <= 0) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    tokenCache = {
      credentialFingerprint,
      accessToken,
      expiresAt: Date.now() + Math.min(expiresIn, 86_400) * 1_000,
    };
    return accessToken;
  }
}

function resolveEndpoint(explicit: string | undefined, envName: string, fallback: string) {
  const candidate = explicit ?? process.env[envName];
  if (!candidate) return fallback;
  if (process.env.NODE_ENV === "production") return fallback;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotConfigured, 503);
  return url.toString().replace(/\/$/u, "");
}

function isAllowedPath(path: string) {
  return /^(?:\/contact_center\/asset_library\/assets(?:\/items|\/[^/?]+)?|\/contact_center\/outbound_campaign\/(?:contact_lists(?:\/[^/?]+(?:\/contacts(?:\/[^/?]+)?)?)?|campaigns(?:\/[^/?]+(?:\/status)?)?))(?:\?[^#]*)?$/u.test(path);
}

function ttsAssetFormData(input: ZoomTtsAssetInput) {
  const form = new FormData();
  form.set("asset_name", input.name);
  form.set("asset_type", "audio");
  form.set("asset_items", JSON.stringify([{
    asset_item_name: input.name,
    asset_item_language: input.languageCode,
    asset_item_content: input.body,
    asset_item_voice: input.voiceId,
    is_default: true,
  }]));
  return form;
}

function assertTtsInputBoundary(input: ZoomTtsAssetInput) {
  if (input.body.length < 1 || input.body.length > ZAAD_LIMITS.messageBody) {
    throw new ZaadZoomError(ZAAD_ERROR_CODES.invalidRequest, 400);
  }
}

function isKnownTtsUpdateFailure(
  failed: Record<string, unknown>[],
  assetId: string,
  languageCode: ZoomTtsAssetInput["languageCode"],
) {
  if (failed.length !== 1) return false;
  const failure = failed[0] ?? {};
  const errorCode = numberAt(failure, ["error_code"]);
  return (
    stringAt(failure, ["asset_id"]) === assetId &&
    stringAt(failure, ["asset_item_language"]) === languageCode &&
    (errorCode === 10009 || errorCode === 10026)
  );
}

function encodeId(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || /[\u0000-\u001F\u007F]/u.test(trimmed)) {
    throw new ZaadZoomError(ZAAD_ERROR_CODES.invalidRequest, 400);
  }
  return encodeURIComponent(trimmed);
}

function boundedPageSize(value: number | undefined) {
  return Number.isSafeInteger(value) ? Math.min(Math.max(value ?? 25, 1), 100) : 25;
}

function mapZoomStatus(status: number, writeResultUnknown = false) {
  if (status === 401) return new ZaadZoomError(ZAAD_ERROR_CODES.zoomCredentialsInvalid, 503);
  if (status === 403) return new ZaadZoomError(ZAAD_ERROR_CODES.zoomScopeRequired, 503);
  if (status === 404) return new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotFound, 404);
  if (status === 409) return new ZaadZoomError(ZAAD_ERROR_CODES.zoomInUse, 409);
  if (status === 429) return new ZaadZoomError(ZAAD_ERROR_CODES.zoomRateLimited, 503);
  if (status >= 500) return new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, writeResultUnknown);
  return new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
}

async function boundedRetryDelay(retryAfter: string | null) {
  const seconds = retryAfter && /^\d+$/u.test(retryAfter) ? Number(retryAfter) : 0;
  const delay = Math.min(Math.max(seconds * 1_000, 0), 1_000);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

function parseContactList(value: Record<string, unknown>, assumedType?: "contact"): ZoomContactListDto | null {
  const id = stringAt(value, ["contact_list_id", "id"]);
  const name = stringAt(value, ["contact_list_name", "name"]);
  const type = stringAt(value, ["contact_list_type", "type"]) ?? assumedType;
  if (!id || !name || type !== "contact") return null;
  const result = {
    id,
    name,
    description: stringAt(value, ["contact_list_description", "description"]) ?? "",
    type: "contact" as const,
    contactCount: numericAt(value, ["contact_count", "contacts_count"]),
    updatedAt: stringAt(value, ["updated_at", "last_modified_time"]),
  };
  return {
    ...result,
    revision: stableSnapshotRevision("contact-list", result),
  };
}

function parseCampaign(value: Record<string, unknown>): ZoomCampaignDto | null {
  const id = stringAt(value, ["outbound_campaign_id", "campaign_id", "id"]);
  const name = stringAt(value, ["outbound_campaign_name", "campaign_name", "name"]);
  if (!id || !name) return null;
  const method = stringAt(value, ["dialing_method", "dialing_mode"]) ?? "unknown";
  const status = (stringAt(value, ["outbound_campaign_status", "status"]) ?? "unknown").toLowerCase();
  const caller = stringAt(value, ["caller_id", "outbound_number"]);
  const contactList = asRecord(arrayAt(value, ["campaign_contact_list"])[0]);
  const dialingSettings = asRecord(value.dialing_method_settings);
  const retryPeriod = numericAt(value, ["retry_period"]);
  const retryUnit = stringAt(value, ["retry_period_unit"]);
  const maxAttempts = numericAt(value, ["max_attempts_per_contact"]);
  const dncCount = arrayAt(value, ["campaign_do_not_contact_list"]).length;
  return {
    id,
    name,
    dialingMethod: method.toLowerCase(),
    status,
    contactListId: stringAt(contactList, ["contact_list_id"]) ?? stringAt(value, ["contact_list_id"]),
    contactListName: stringAt(contactList, ["contact_list_name"]) ?? stringAt(value, ["contact_list_name"]),
    contactCount: numericAt(contactList, ["contacts_count"]) ?? numericAt(value, ["contact_count"]),
    queueName: stringAt(value, ["queue_name"]),
    callerIdMasked: caller ? maskPhone(caller) : null,
    maxConcurrentCalls: numericAt(dialingSettings, ["max_concurrent_calls"]) ?? numericAt(value, ["max_concurrent_calls"]),
    businessHours: stringAt(value, ["business_hour_source", "business_hours_name", "business_hours"]),
    retryPolicy: maxAttempts === null
      ? stringAt(value, ["retry_policy"])
      : `${maxAttempts} attempts${retryPeriod === null ? "" : ` / ${retryPeriod} ${retryUnit ?? ""}`.trimEnd()}`,
    dncPolicy: dncCount > 0 ? `${dncCount} list(s)` : stringAt(value, ["dnc_policy"]) ?? "none",
    alwaysRunning: Boolean(value.enable_always_running),
    revision: stringAt(value, ["updated_at", "last_modified_time"]) ?? `${id}:${status}`,
  };
}

function parseOneTimeCampaignProfile(value: Record<string, unknown>): ZoomOneTimeCampaignProfile | null {
  const queueId = stringAt(value, ["queue_id"]);
  const phoneNumberId = stringAt(value, ["phone_number_id"]);
  const settings = asRecord(value.dialing_method_settings);
  const maxConcurrentCalls = numericAt(settings, ["max_concurrent_calls"])
    ?? numericAt(value, ["max_concurrent_calls"]);
  const newFlowId = stringAt(settings, ["new_flow_id"])
    ?? stringAt(value, ["new_flow_id"]);
  if (
    !queueId ||
    !phoneNumberId ||
    !newFlowId ||
    maxConcurrentCalls === null ||
    !Number.isSafeInteger(maxConcurrentCalls) ||
    maxConcurrentCalls < 1 ||
    maxConcurrentCalls > 100
  ) {
    return null;
  }

  const dncRows = value.campaign_do_not_contact_list;
  if (dncRows !== undefined && !Array.isArray(dncRows)) return null;
  const dncListIds = (Array.isArray(dncRows) ? dncRows : [])
    .map((entry) => stringAt(asRecord(entry), ["contact_list_id"]));
  if (dncListIds.some((entry) => !entry)) return null;

  const windowRows = value.local_calling_windows;
  if (windowRows !== undefined && !Array.isArray(windowRows)) return null;
  const localCallingWindows: Array<{ start: string; end: string }> = [];
  for (const entry of Array.isArray(windowRows) ? windowRows : []) {
    const row = asRecord(entry);
    const start = stringAt(row, ["start"]);
    const end = stringAt(row, ["end"]);
    if (!start || !end || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(end)) {
      return null;
    }
    localCallingWindows.push({ start, end });
  }

  return {
    queueId,
    phoneNumberId,
    assignType: enumAt(value, "assign_type", ["queue", "default", "customer"]),
    maxConcurrentCalls,
    newFlowId,
    oldFlowId: stringAt(settings, ["old_flow_id"]) ?? stringAt(value, ["old_flow_id"]),
    outboundCampaignPriority: numericAt(value, ["outbound_campaign_priority"]),
    dncListIds: dncListIds as string[],
    exclusionLogic: enumAt(value, "exclusion_logic", ["and", "or"]),
    maxAttemptsPerContact: numericAt(value, ["max_attempts_per_contact"]),
    attemptsUseSamePeriod: booleanAt(value, "attempts_use_same_period"),
    secondAttemptPeriod: numericAt(value, ["second_attempt_period"]),
    thirdAttemptPeriod: numericAt(value, ["third_attempt_period"]),
    otherAttemptPeriod: numericAt(value, ["other_attempt_period"]),
    retryPeriod: numericAt(value, ["retry_period"]),
    retryPeriodUnit: enumAt(value, "retry_period_unit", ["seconds", "minutes", "hours", "days"]),
    dialSequence: enumAt(value, "dial_sequence", ["list_dial", "contact_dial", "contact_with_lock"]),
    enableMaxRingTime: booleanAt(value, "enable_max_ring_time"),
    maxRingTime: numericAt(value, ["max_ring_time"]),
    businessHourSource: enumAt(value, "business_hour_source", ["queue", "campaign"]),
    businessHourId: stringAt(value, ["business_hour_id"]),
    enableClosureHour: booleanAt(value, "enable_closure_hour"),
    closureSetId: stringAt(value, ["closure_set_id"]),
    contactTimezoneSource: enumAt(value, "contact_timezone_source", ["none", "timezone", "area_code"]),
    contactPhoneOrder: stringAt(value, ["contact_phone_order"]),
    enableDiagnostics: booleanAt(value, "enable_diagnostics"),
    localCallingWindows,
  };
}

function parseTtsAsset(value: Record<string, unknown>): ZoomTtsAssetResult | null {
  const assetId = stringAt(value, ["asset_id"]);
  if (!assetId || value.asset_type !== "audio") return null;
  const item = arrayAt(value, ["asset_items"])
    .map((entry) => asRecord(entry))
    .find((entry) => typeof entry.asset_item_id === "string" && entry.asset_item_id.length > 0);
  const assetItemId = item ? stringAt(item, ["asset_item_id"]) : null;
  return assetItemId ? { assetId, assetItemId } : null;
}

function parseContact(value: Record<string, unknown>): ZoomContactDto | null {
  const id = stringAt(value, ["contact_id", "id"]);
  if (!id) return null;
  const phoneSource = arrayAt(value, ["contact_phones", "phone_numbers", "phones"]);
  const phones = phoneSource.map((entry) => {
    const record = asRecord(entry);
    const number = stringAt(record, ["contact_phone_number", "phone_number", "number"]);
    return number ? { type: stringAt(record, ["contact_phone_type", "phone_type", "type"]) ?? "Other", number } : null;
  }).filter((entry): entry is { type: string; number: string } => entry !== null);
  const emails = arrayAt(value, ["contact_emails", "emails"])
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return {
    id,
    displayName: stringAt(value, ["contact_display_name", "display_name", "name"]) ?? "",
    phones,
    emails,
  };
}

function stableSnapshotRevision(kind: string, snapshot: Record<string, unknown>) {
  return `sha256:${createHash("sha256")
    .update(`zaad-revision:v1:${kind}:`)
    .update(JSON.stringify(snapshot))
    .digest("base64url")}`;
}

function parseNextPageToken(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 100 || /[\u0000-\u001F\u007F]/u.test(value)) {
    throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
  }
  return value;
}

function maskPhone(value: string) {
  const visible = value.replace(/\D/gu, "");
  return visible.length >= 4 ? `***-***-${visible.slice(-4)}` : "***";
}

function canonicalAgentlessAmdOffAction(value: string | null): ZoomOneTimeCampaignReadback["agentlessAmdOffAction"] {
  if (value === "useFlow" || value === "use_flow") return "use_flow";
  if (value === "hangUp" || value === "hang_up") return "hang_up";
  if (value === "playMedia" || value === "play_media") return "play_media";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayAt(value: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) if (Array.isArray(value[key])) return value[key] as unknown[];
  return [];
}

function stringAt(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (typeof value[key] === "string" && value[key]) return value[key] as string;
  return null;
}

function numberAt(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (typeof value[key] === "number" && Number.isFinite(value[key])) return value[key] as number;
  return null;
}

function numericAt(value: Record<string, unknown>, keys: string[]) {
  const number = numberAt(value, keys);
  if (number !== null) return number;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && /^\d+$/u.test(candidate)) return Number(candidate);
  }
  return null;
}

function booleanAt(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "boolean" ? value[key] as boolean : null;
}

function enumAt<const T extends readonly string[]>(
  value: Record<string, unknown>,
  key: string,
  allowed: T,
): T[number] | null {
  const candidate = value[key];
  return typeof candidate === "string" && (allowed as readonly string[]).includes(candidate)
    ? candidate as T[number]
    : null;
}

function compactObject(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined));
}
