export type ZoomVideoConfig = { scriptSrc: string; entryId: string; apiKey: string; environment: string };

/** Parse only the attributes issued by Zoom's Install SDK dialog; never execute markup. */
export function parseZoomVideoTag(value: string): ZoomVideoConfig | null {
  if (value.length > 4096) return null;
  const tag = /^\s*<script\b([^>]*)>\s*<\/script>\s*$/iu.exec(value);
  if (!tag) return null;
  const attrs = new Map<string, string>();
  const allowed = new Set(["type", "src", "data-entry-id", "data-env", "data-apikey"]);
  let cursor = 0;
  for (const match of tag[1].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)) {
    if (!/^\s*$/u.test(tag[1].slice(cursor, match.index))) return null;
    const name = match[1].toLowerCase();
    if (!allowed.has(name) || attrs.has(name)) return null;
    attrs.set(name, match[2] ?? match[3]);
    cursor = match.index! + match[0].length;
  }
  if (!/^\s*$/u.test(tag[1].slice(cursor)) || (attrs.has("type") && attrs.get("type") !== "module")) return null;
  const scriptSrc = attrs.get("src") ?? "";
  const source = /^https:\/\/(us01|eu01)ccistatic\.zoom\.us\/\1cci\/web-sdk\/video-client\.js$/u.exec(scriptSrc);
  if (!source) return null;
  const environment = source[1];
  if (attrs.has("data-env") && attrs.get("data-env") !== environment) return null;
  const entryId = attrs.get("data-entry-id") ?? "";
  const apiKey = attrs.get("data-apikey") ?? "";
  if (![entryId, apiKey].every(v => /^[A-Za-z0-9_-]{1,512}$/u.test(v))) return null;
  return { scriptSrc, entryId, apiKey, environment };
}
