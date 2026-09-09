import { MAX_CHAT_MEMO_LENGTH } from "./chat-settings";
import type { TenantKey } from "./tenants";
import {
  consultationServices,
  UNIVERSITY_CONSULTATION_SERVICES,
  type UniversityConsultationService,
  type ConsultationService,
} from "./online-consultation-catalog";
export { UNIVERSITY_CONSULTATION_SERVICES, type UniversityConsultationService };

export type OnlineConsultationSetting = {
  serviceKey: ConsultationService;
  enabled: boolean;
  webClientTag: string | null;
  queueId: string | null;
  memo?: string;
};

export type OnlineConsultationSettingsInput = {
  services: Array<{
    serviceKey: ConsultationService;
    webClientTag: string;
    memo?: string;
  }>;
};

export const ONLINE_CONSULTATION_ERROR_CODES = {
  invalidPayload: "INVALID_ONLINE_CONSULTATION_SETTINGS",
  invalidTag: "INVALID_ONLINE_CONSULTATION_TAG",
  saveFailed: "ONLINE_CONSULTATION_SAVE_FAILED",
} as const;

export function isUniversityConsultationService(
  value: string,
): value is UniversityConsultationService {
  return (UNIVERSITY_CONSULTATION_SERVICES as readonly string[]).includes(
    value,
  );
}

/** Reject arbitrary markup: only an official HTTPS SDK script tag is accepted. */
export function parseVideoClientWebTag(value: string): string | null {
  const tag = value.trim();
  if (!tag) return null;
  if (
    !/^<script\s+[^>]*\bsrc=["']https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/[^"']+["'][^>]*>\s*<\/script>$/iu.test(
      tag,
    )
  )
    return null;
  if (/<\s*(?!\/script\s*>)[^>]+>/iu.test(tag.replace(/^<script/iu, "")))
    return null;
  return tag;
}

export function parseOnlineConsultationSettings(
  value: unknown,
  tenantKey: TenantKey = "univ",
):
  | { ok: true; value: OnlineConsultationSettingsInput }
  | {
      ok: false;
      code: (typeof ONLINE_CONSULTATION_ERROR_CODES)[keyof typeof ONLINE_CONSULTATION_ERROR_CODES];
    } {
  if (!value || typeof value !== "object") {
    return { ok: false, code: ONLINE_CONSULTATION_ERROR_CODES.invalidPayload };
  }
  const services = (value as { services?: unknown }).services;
  if (
    !Array.isArray(services) ||
    services.length !== consultationServices(tenantKey).length
  ) {
    return { ok: false, code: ONLINE_CONSULTATION_ERROR_CODES.invalidPayload };
  }
  const parsed = services.map((service) => {
    if (!service || typeof service !== "object") return null;
    const { serviceKey, webClientTag, memo } = service as Record<
      string,
      unknown
    >;
    if (
      typeof serviceKey !== "string" ||
      !consultationServices(tenantKey).some((key) => key === serviceKey) ||
      typeof webClientTag !== "string" ||
      (memo !== undefined &&
        (typeof memo !== "string" ||
          Array.from(memo).length > MAX_CHAT_MEMO_LENGTH))
    ) {
      return null;
    }
    const tag = parseVideoClientWebTag(webClientTag);
    return tag
      ? {
          serviceKey,
          webClientTag: tag,
          ...(memo === undefined ? {} : { memo }),
        }
      : null;
  });
  if (
    parsed.some((service) => service === null) ||
    new Set(parsed.map((service) => service?.serviceKey)).size !==
      consultationServices(tenantKey).length
  ) {
    return { ok: false, code: ONLINE_CONSULTATION_ERROR_CODES.invalidTag };
  }
  return {
    ok: true,
    value: { services: parsed as OnlineConsultationSettingsInput["services"] },
  };
}
