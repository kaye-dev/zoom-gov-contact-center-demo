export const UNIVERSITY_CONSULTATION_SERVICES = [
  "admissions",
  "student-support",
  "careers",
] as const;
export type UniversityConsultationService =
  (typeof UNIVERSITY_CONSULTATION_SERVICES)[number];

export type OnlineConsultationSetting = {
  serviceKey: UniversityConsultationService;
  enabled: boolean;
  webClientTag: string | null;
  queueId: string | null;
};

export type OnlineConsultationSettingsInput = {
  services: Array<{
    serviceKey: UniversityConsultationService;
    webClientTag: string;
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
    services.length !== UNIVERSITY_CONSULTATION_SERVICES.length
  ) {
    return { ok: false, code: ONLINE_CONSULTATION_ERROR_CODES.invalidPayload };
  }
  const parsed = services.map((service) => {
    if (!service || typeof service !== "object") return null;
    const { serviceKey, webClientTag } = service as Record<string, unknown>;
    if (
      typeof serviceKey !== "string" ||
      !isUniversityConsultationService(serviceKey) ||
      typeof webClientTag !== "string"
    ) {
      return null;
    }
    const tag = parseVideoClientWebTag(webClientTag);
    return tag ? { serviceKey, webClientTag: tag } : null;
  });
  if (
    parsed.some((service) => service === null) ||
    new Set(parsed.map((service) => service?.serviceKey)).size !==
      UNIVERSITY_CONSULTATION_SERVICES.length
  ) {
    return { ok: false, code: ONLINE_CONSULTATION_ERROR_CODES.invalidTag };
  }
  return {
    ok: true,
    value: { services: parsed as OnlineConsultationSettingsInput["services"] },
  };
}
