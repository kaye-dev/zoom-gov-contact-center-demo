import type { AudioAsset, AudioAssetsPage } from "@/lib/zaad/message-import-contracts";
import { OutreachContractError } from "@/lib/zaad/outreach-contracts";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const invalid = () => { throw new OutreachContractError("INVALID_AUDIO_ASSET_RESPONSE", 502); };

export function parseAudioAssetsPage(payload: unknown): AudioAssetsPage {
  const value = object(payload);
  if (!Array.isArray(value.assets)) return invalid();
  const assets = value.assets.map(raw => {
    const item = object(raw), assetId = text(item.asset_id), name = text(item.asset_name);
    if (!assetId || !name) return invalid();
    return { assetId, name };
  });
  if (value.next_page_token != null && typeof value.next_page_token !== "string") return invalid();
  return { assets, nextPageToken: text(value.next_page_token) };
}
export function parseAudioAsset(payload: unknown, expectedId: string): AudioAsset {
  const value = object(payload), assetId = text(value.asset_id), name = text(value.asset_name);
  if (assetId !== expectedId || !name || !Array.isArray(value.asset_items) || typeof value.asset_type !== "string") return invalid();
  const modified = text(value.last_modified_time);
  const seen = new Set<string>();
  const items = value.asset_items.map(raw => {
    const item = object(raw), assetItemId = text(item.asset_item_id);
    if (assetItemId && seen.has(assetItemId)) return invalid();
    seen.add(assetItemId);
    // Do not return a temporary file URL to callers or persist it.
    return { assetItemId, name: text(item.asset_item_name) || name, languageCode: text(item.asset_item_language), voiceId: text(item.asset_item_voice) || null, hasAudioFile: Boolean(text(item.asset_item_file_url)) };
  });
  return { assetId, name, type: value.asset_type, archived: value.archived === true || value.is_archived === true || value.status === "archived", sourceModifiedAt: modified && Number.isFinite(Date.parse(modified)) ? new Date(modified).toISOString() : null, items };
}
