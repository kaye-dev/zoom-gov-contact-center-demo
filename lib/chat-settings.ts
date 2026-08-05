import {
  SETTINGS_ERROR_CODES,
  isNullableString,
  isRecord,
  normalizeNullableString,
  type SettingsErrorCode,
  type ValidationResult,
} from "./site-settings";
import {
  normalizeCampaignWebTag,
  normalizeContactCenterEntryIdWebTag,
  parseCampaignWebTag,
  parseContactCenterEntryIdWebTag,
  type ZoomWebChatTagConfig,
} from "./zoom-web-chat-tag";

export const ZOOM_CHAT_MODES = [
  "DISABLED",
  "CAMPAIGN",
  "CONTACT_CENTER_ENTRY_ID",
] as const;

export type ZoomChatMode = (typeof ZOOM_CHAT_MODES)[number];

export type ChatSettings = {
  activeMode: ZoomChatMode;
  campaignWebTag: string | null;
  campaignMemo: string | null;
  contactCenterEntryIdWebTag: string | null;
  contactCenterEntryIdMemo: string | null;
};

export const MAX_CHAT_MEMO_LENGTH = 4000;

export function isZoomChatMode(value: string): value is ZoomChatMode {
  return (ZOOM_CHAT_MODES as readonly string[]).includes(value);
}

export function parseChatSettings(
  input: unknown,
): ValidationResult<ChatSettings> {
  if (
    !isRecord(input) ||
    typeof input.activeMode !== "string" ||
    !isZoomChatMode(input.activeMode) ||
    !isNullableString(input.campaignWebTag) ||
    !isNullableString(input.campaignMemo) ||
    !isNullableString(input.contactCenterEntryIdWebTag) ||
    !isNullableString(input.contactCenterEntryIdMemo)
  ) {
    return invalid(SETTINGS_ERROR_CODES.invalidRequest);
  }

  const campaignWebTag = normalizeNullableString(input.campaignWebTag);
  const canonicalCampaignWebTag =
    campaignWebTag === null ? null : normalizeCampaignWebTag(campaignWebTag);
  if (campaignWebTag !== null && canonicalCampaignWebTag === null) {
    return invalid(SETTINGS_ERROR_CODES.invalidZoomCampaignWebTag);
  }

  const contactCenterEntryIdWebTag = normalizeNullableString(
    input.contactCenterEntryIdWebTag,
  );
  const canonicalContactCenterEntryIdWebTag =
    contactCenterEntryIdWebTag === null
      ? null
      : normalizeContactCenterEntryIdWebTag(contactCenterEntryIdWebTag);
  if (
    contactCenterEntryIdWebTag !== null &&
    canonicalContactCenterEntryIdWebTag === null
  ) {
    return invalid(SETTINGS_ERROR_CODES.invalidZoomContactCenterWebTag);
  }

  const campaignMemo = normalizeMemo(input.campaignMemo);
  const contactCenterEntryIdMemo = normalizeMemo(
    input.contactCenterEntryIdMemo,
  );
  if (campaignMemo === undefined || contactCenterEntryIdMemo === undefined) {
    return invalid(SETTINGS_ERROR_CODES.invalidChatMemo);
  }

  if (
    (input.activeMode === "CAMPAIGN" && canonicalCampaignWebTag === null) ||
    (input.activeMode === "CONTACT_CENTER_ENTRY_ID" &&
      canonicalContactCenterEntryIdWebTag === null)
  ) {
    return invalid(SETTINGS_ERROR_CODES.activeZoomChatTagRequired);
  }

  return {
    ok: true,
    value: {
      activeMode: input.activeMode,
      campaignWebTag: canonicalCampaignWebTag,
      campaignMemo,
      contactCenterEntryIdWebTag: canonicalContactCenterEntryIdWebTag,
      contactCenterEntryIdMemo,
    },
  };
}

export function resolveActiveZoomWebChatTag(
  settings: ChatSettings,
): ZoomWebChatTagConfig | null {
  if (settings.activeMode === "CAMPAIGN" && settings.campaignWebTag) {
    return parseCampaignWebTag(settings.campaignWebTag);
  }

  if (
    settings.activeMode === "CONTACT_CENTER_ENTRY_ID" &&
    settings.contactCenterEntryIdWebTag
  ) {
    return parseContactCenterEntryIdWebTag(
      settings.contactCenterEntryIdWebTag,
    );
  }

  return null;
}

function normalizeMemo(value: string | null): string | null | undefined {
  if (value === null || value.trim().length === 0) {
    return null;
  }

  if (Array.from(value).length > MAX_CHAT_MEMO_LENGTH) {
    return undefined;
  }

  return value;
}

function invalid<T>(code: SettingsErrorCode): ValidationResult<T> {
  return { ok: false, code };
}
