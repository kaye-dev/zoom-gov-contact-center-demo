import assert from "node:assert/strict";
import test from "node:test";
import { parseAudioAsset, parseAudioAssetsPage } from "../lib/server/zaad/audio-asset-parser";
import { parseAudioImport } from "../lib/zaad/message-import-contracts";
import { audioItemDigest } from "../lib/server/zaad/message-imports";
import { ZaadZoomClient, clearZaadZoomTokenCache } from "../lib/server/zaad/zoom-client";

const payload = { asset_id: "asset", asset_name: "録音", asset_type: "audio", asset_items: [{ asset_item_id: "ja", asset_item_name: "日本語", asset_item_language: "ja-JP", asset_item_file_url: "https://example.invalid/temporary?secret=one" }, { asset_item_id: "en", asset_item_language: "en-US", asset_item_voice: "Joanna", asset_item_file_url: "https://example.invalid/file" }] };
test("MESSAGE-API-01: audio metadata preserves missing voice and excludes temporary URLs and text", () => {
  const value = parseAudioAsset(payload, "asset");
  assert.equal(value.items.length, 2); assert.equal(value.items[0].voiceId, null);
  assert.equal(value.items[0].hasAudioFile, true);
  assert.doesNotMatch(JSON.stringify(value), /https:|secret|body/);
  const next = parseAudioAsset({ ...payload, asset_items: payload.asset_items.map(item => ({ ...item, asset_item_file_url: "https://example.invalid/rotated" })) }, "asset");
  assert.equal(audioItemDigest(value,value.items[0]), audioItemDigest(next,next.items[0]));
  assert.equal(parseAudioAsset({ ...payload, archived: true }, "asset").archived, true);
  assert.equal(parseAudioAsset({ ...payload, asset_items: [{asset_item_id:"x"}] }, "asset").items[0].hasAudioFile, false);
  assert.throws(()=>parseAudioAsset(payload,"wrong"));
  assert.throws(()=>parseAudioAssetsPage({}));
  assert.throws(()=>parseAudioAsset({...payload,asset_items:[payload.asset_items[0],payload.asset_items[0]]},"asset"));
});
test("MESSAGE-IMPORT: payload is bounded, deduplicated and does not accept client text/metadata", () => {
  const item={assetId:"asset",assetItemId:"ja",observedDigest:"a".repeat(64),version:0};
  const value={operationKey:"audio_import_operation",accountId:"account",departmentKey:"welfare",items:[item]};
  assert.equal(parseAudioImport(value).items.length,1);
  for(const items of [[],Array.from({length:101},()=>item),[item,item],[{...item,body:"fake"}],[{...item,version:-1}],[{...item,observedDigest:"no"}]])assert.throws(()=>parseAudioImport({...value,items}));
  assert.throws(()=>parseAudioImport({...value,body:"invented"}));
});
test("MESSAGE-API-01: asset methods use GET with pagination and no write gate", async () => {
  clearZaadZoomTokenCache();const requests:{url:string;method:string}[]=[];
  type Constructor=new(...args:unknown[])=>ZaadZoomClient;
  const client=new (ZaadZoomClient as unknown as Constructor)({accountId:"test-audio",clientId:"client",clientSecret:"secret"},async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);requests.push({url,method:init?.method??"GET"});
    if(url.includes("/oauth/token"))return Response.json({access_token:"test-audio-token",expires_in:3600});
    return Response.json(url.includes("?")?{assets:[{asset_id:"asset",asset_name:"音声"}],next_page_token:"page2"}:payload);
  },"https://api.zoom.test/v2","https://zoom.test/oauth/token",{contact:false,tts:false,campaign:false});
  assert.equal((await client.listAudioAssets({pageSize:100,nextPageToken:"page1"})).nextPageToken,"page2");
  assert.equal((await client.getAudioAsset("asset")).items.length,2);
  assert.ok(requests.filter(row=>row.url.includes("asset_library")).every(row=>row.method==="GET"));
  assert.match(requests.find(row=>row.url.includes("asset_library"))!.url,/asset_type=audio&page_size=100&next_page_token=page1/);
});
