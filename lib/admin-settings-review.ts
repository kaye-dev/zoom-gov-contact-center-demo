import type { AdminSettingsResource } from "./admin-settings-tenant";
import type { TenantKey } from "./tenants";
import { consultationServices } from "./online-consultation-catalog";
import { SITE_LOCALES } from "./site-settings";
export const SETTINGS_REVIEW_STATES = [
  "default",
  "help-open",
  "lg",
  "detail",
  "third",
  "dirty",
  "confirm-switch",
  "loading",
  "load-error",
  "saving",
  "saved",
  "save-error",
  "readonly",
  "validation",
  "invalid",
  "menu",
  "collapsed",
] as const;
export type SettingsReviewState = (typeof SETTINGS_REVIEW_STATES)[number];
export function resolveSettingsReview(
  state: unknown,
  hostname: string,
  environment: string | undefined,
  optedIn = false,
): SettingsReviewState | undefined {
  if (
    !optedIn ||
    environment === "production" ||
    !["localhost", "127.0.0.1", "[::1]", "univ.localhost", "lg.localhost"].includes(hostname)
  )
    return undefined;
  return typeof state === "string" &&
    SETTINGS_REVIEW_STATES.some((s) => s === state)
    ? (state as SettingsReviewState)
    : undefined;
}
export function settingsReviewData(
  resource: AdminSettingsResource,
  tenant: TenantKey,
) {
  if (resource === "phone-settings")
    return {
      settings: {
        representativePhone: { display: "", e164: "" },
        aiPhoneNumbers: Object.fromEntries(SITE_LOCALES.map((l) => [l, null])),
      },
      orderedLocales: SITE_LOCALES.map((locale) => ({ locale, enabled: true })),
    };
  if (resource === "chat-settings")
    return {
      settings: {
        activeMode: "DISABLED",
        campaignWebTag: null,
        campaignMemo: null,
        contactCenterEntryIdWebTag: null,
        contactCenterEntryIdMemo: null,
      },
    };
  return {
    settings: consultationServices(tenant).map((serviceKey) => ({
      serviceKey,
      enabled: false,
      webClientTag: null,
      queueId: null,
      memo: "",
    })),
  };
}
