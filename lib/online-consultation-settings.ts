export const UNIVERSITY_CONSULTATION_SERVICES = ["admissions", "student-support", "careers"] as const;
export type UniversityConsultationService = (typeof UNIVERSITY_CONSULTATION_SERVICES)[number];

export type OnlineConsultationSetting = { serviceKey: UniversityConsultationService; enabled: boolean; webClientTag: string | null; queueId: string | null };

export function isUniversityConsultationService(value: string): value is UniversityConsultationService {
  return (UNIVERSITY_CONSULTATION_SERVICES as readonly string[]).includes(value);
}

/** Reject arbitrary markup: only an official HTTPS SDK script tag is accepted. */
export function parseVideoClientWebTag(value: string): string | null {
  const tag = value.trim();
  if (!tag) return null;
  if (!/^<script\s+[^>]*\bsrc=["']https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/[^"']+["'][^>]*>\s*<\/script>$/iu.test(tag)) return null;
  if (/<\s*(?!\/script\s*>)[^>]+>/iu.test(tag.replace(/^<script/iu, ""))) return null;
  return tag;
}
