import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { OutreachContractError } from "@/lib/zaad/outreach-contracts";
import type { OutreachScope } from "./outreach-scope";
import { assertAccount, audioScope, ownedAsset, validItem, type AudioAssetReader } from "./message-imports";
import { ZaadZoomClient } from "./zoom-client";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/aac", "audio/mp4"]);
type Dependencies = { reader?: AudioAssetReader; fetch?: typeof fetch; resolve?: (hostname: string) => Promise<{ address: string }[]> };
const fail = (code = "AUDIO_UNAVAILABLE") => new OutreachContractError(code, 502);
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" };

export function parseAudioRange(value: string | null) {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !match[1] && !match[2]) throw new OutreachContractError("INVALID_AUDIO_RANGE", 400);
  const start = match[1] ? Number(match[1]) : null, end = match[2] ? Number(match[2]) : null;
  if ([start, end].some(number => number !== null && (!Number.isSafeInteger(number) || number < 0)) || start !== null && end !== null && end < start || start === null && end === 0) throw new OutreachContractError("INVALID_AUDIO_RANGE", 400);
  return { value, start, end };
}
export function allowedAudioUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw fail("AUDIO_URL_NOT_ALLOWED"); }
  if (url.protocol !== "https:" || url.hostname !== "file.zoom.us" || url.port || url.username || url.password || url.hash || isIP(url.hostname)) throw fail("AUDIO_URL_NOT_ALLOWED");
  return url;
}
export function publicAudioAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a !== 0 && a !== 10 && a !== 127 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127) && a < 224;
  }
  // Only global unicast IPv6, excluding mapped IPv4 and special/private ranges.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !address.toLowerCase().startsWith("2001:db8:");
}
export function audioSignature(bytes: Uint8Array, mime: string) {
  const tag = (start: number, length: number) => new TextDecoder().decode(bytes.subarray(start, start + length));
  if (mime === "audio/mpeg") return tag(0, 3) === "ID3" || bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (mime === "audio/wav" || mime === "audio/x-wav") return tag(0, 4) === "RIFF" && tag(8, 4) === "WAVE";
  if (mime === "audio/ogg") return tag(0, 4) === "OggS";
  if (mime === "audio/flac") return tag(0, 4) === "fLaC";
  if (mime === "audio/aac") return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
  return mime === "audio/mp4" && tag(4, 4) === "ftyp";
}
async function checkedFetch(raw: string, range: string | null, signal: AbortSignal, dependencies: Dependencies) {
  let url = allowedAudioUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const addresses = await (dependencies.resolve ?? (hostname => lookup(hostname, { all: true })))(url.hostname);
    if (!addresses.length || addresses.some(row => !publicAudioAddress(row.address))) throw fail("AUDIO_URL_NOT_ALLOWED");
    const response = await (dependencies.fetch ?? fetch)(url, { method: "GET", headers: { Accept: "audio/*", ...(range ? { Range: range } : {}) }, cache: "no-store", redirect: "manual", signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || hop === 3) throw fail("AUDIO_URL_NOT_ALLOWED");
    url = allowedAudioUrl(new URL(location, url).href);
  }
  throw fail();
}
function contentRange(response: Response) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  if (!match) throw fail("INVALID_AUDIO_RANGE_RESPONSE");
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger) || start > end || end >= total || total > MAX_AUDIO_BYTES) throw fail("INVALID_AUDIO_RANGE_RESPONSE");
  return { start, end, total };
}
async function prefix(response: Response, maximum = 32) {
  const reader = response.body?.getReader();
  if (!reader) throw fail();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (size < maximum) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); size += next.value.length; if (size > MAX_AUDIO_BYTES) throw fail("AUDIO_TOO_LARGE"); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { reader, bytes };
  } catch (error) { await reader.cancel().catch(() => undefined); reader.releaseLock(); throw error; }
}

export async function importedMessageAudio(db: PrismaClient, scope: OutreachScope, id: string, request: Request, dependencies: Dependencies = {}): Promise<Response> {
  const range = parseAudioRange(request.headers.get("range"));
  const row = await db.outreachImportedAudioMessage.findFirst({ where: { ...audioScope(scope), id }, include: { binding: true } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  const client = dependencies.reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  if (client.accountId !== row.binding.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
  await assertAccount(db, client.accountId); await ownedAsset(db, scope, client.accountId, row.binding.zoomId);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  const latestUrl = async () => {
    await assertAccount(db, client.accountId);
    const current = await db.outreachImportedAudioMessage.findFirst({ where: { ...audioScope(scope), id } });
    if (!current) throw new OutreachContractError("NOT_FOUND", 404);
    await ownedAsset(db, scope, client.accountId, row.binding.zoomId);
    const asset = await client.getAudioAsset(row.binding.zoomId), item = asset.items.find(item => item.assetItemId === row.assetItemId);
    await assertAccount(db, client.accountId);
    if (asset.assetId !== row.binding.zoomId || !item || !validItem(asset, item) || !item.fileUrl || item.languageCode !== row.languageCode) throw fail();
    return allowedAudioUrl(item.fileUrl).href;
  };
  try {
    let url = await latestUrl(), response = await checkedFetch(url, range?.value ?? null, signal, dependencies);
    if ([401, 403].includes(response.status)) {
      await response.body?.cancel(); url = await latestUrl();
      response = await checkedFetch(url, range?.value ?? null, signal, dependencies);
    }
    if (response.status === 416 && range) {
      const total = /^bytes \*\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1];
      await response.body?.cancel();
      if (!total || !Number.isSafeInteger(Number(total)) || Number(total) > MAX_AUDIO_BYTES) throw fail("INVALID_AUDIO_RANGE_RESPONSE");
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${total}` } });
    }
    const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    const lengthHeader = response.headers.get("content-length"), length = lengthHeader === null ? null : Number(lengthHeader);
    if (![200, 206].includes(response.status) || !MIME_TYPES.has(mime) || length !== null && (!Number.isSafeInteger(length) || length < 0 || length > MAX_AUDIO_BYTES)) { await response.body?.cancel(); throw fail("INVALID_AUDIO_RESPONSE"); }
    const part = response.status === 206 ? contentRange(response) : null;
    if (part && (!range || range.start !== null && part.start !== range.start || range.end !== null && range.start !== null && part.end > range.end || length !== null && length !== part.end - part.start + 1)) { await response.body?.cancel(); throw fail("INVALID_AUDIO_RANGE_RESPONSE"); }
    if (part && range?.start === null && (part.start !== Math.max(0, part.total - range.end!) || part.end !== part.total - 1)) { await response.body?.cancel(); throw fail("INVALID_AUDIO_RANGE_RESPONSE"); }
    const first = await prefix(response);
    try {
      if (part?.start || first.bytes.length < 12) {
        // A seek response does not contain a format header. Validate byte zero
        // from the same signed object; never treat arbitrary bytes as a header.
        const probe = await checkedFetch(url, "bytes=0-31", signal, dependencies);
        if (![200, 206].includes(probe.status) || probe.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== mime) { await probe.body?.cancel(); throw fail("INVALID_AUDIO_RESPONSE"); }
        if (probe.status === 206) { const beginning = contentRange(probe); if (beginning.start !== 0 || part && beginning.total !== part.total) { await probe.body?.cancel(); throw fail("INVALID_AUDIO_RANGE_RESPONSE"); } }
        const beginning = await prefix(probe); await beginning.reader.cancel(); beginning.reader.releaseLock();
        if (!audioSignature(beginning.bytes, mime)) throw fail("INVALID_AUDIO_SIGNATURE");
      } else if (!audioSignature(first.bytes, mime)) throw fail("INVALID_AUDIO_SIGNATURE");
      await assertAccount(db, client.accountId);
      if (!await db.outreachImportedAudioMessage.findFirst({ where: { ...audioScope(scope), id } })) throw new OutreachContractError("NOT_FOUND", 404);
    } catch (error) { await first.reader.cancel().catch(() => undefined); first.reader.releaseLock(); throw error; }
    let total = first.bytes.length, initial = true;
    const expectedLength = part ? part.end - part.start + 1 : length;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (initial) { initial = false; if (first.bytes.length) controller.enqueue(first.bytes); return; }
          const next = await first.reader.read();
          if (next.done) { if (expectedLength !== null && total !== expectedLength) throw fail("AUDIO_TRUNCATED"); first.reader.releaseLock(); controller.close(); return; }
          total += next.value.length;
          if (total > MAX_AUDIO_BYTES || expectedLength !== null && total > expectedLength) throw fail("AUDIO_TOO_LARGE");
          controller.enqueue(next.value);
        } catch { await first.reader.cancel().catch(() => undefined); first.reader.releaseLock(); controller.error(fail()); }
      },
      async cancel() { await first.reader.cancel().catch(() => undefined); first.reader.releaseLock(); },
    });
    return new Response(stream, { status: response.status, headers: { ...headers, "Content-Type": mime, ...(expectedLength === null ? {} : { "Content-Length": String(expectedLength) }), ...(part ? { "Content-Range": `bytes ${part.start}-${part.end}/${part.total}` } : {}) } });
  } catch (error) {
    if (error instanceof OutreachContractError) throw error;
    throw fail();
  }
}
