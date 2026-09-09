import { record } from "@/lib/zaad/outreach-contracts";
import { digest } from "../outreach-data";

// Preference rows have their own lifecycle; contact.version alone cannot detect changes.
export function municipalContactDigest(value: unknown) {
  const contact = record(value);
  const preferences = Array.isArray(contact.preferences) ? [...contact.preferences].sort((a, b) => String(record(a).topic).localeCompare(String(record(b).topic))) : [];
  return digest({ ...contact, preferences });
}
