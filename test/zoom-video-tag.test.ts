import assert from "node:assert/strict";
import test from "node:test";
import { parseZoomVideoTag } from "../lib/zoom-video-tag";

const tag = '<script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/video-client.js" data-entry-id="entry" data-env="us01" data-apikey="public-key"></script>';
test("Zoom video Install SDK tag yields only structured public configuration", () => {
  assert.deepEqual(parseZoomVideoTag(tag), { scriptSrc: "https://us01ccistatic.zoom.us/us01cci/web-sdk/video-client.js", entryId: "entry", apiKey: "public-key", environment: "us01" });
  assert.equal(parseZoomVideoTag(tag.replaceAll("us01", "eu01"))?.environment, "eu01");
});
test("reject missing entry, injected attributes, duplicate attributes and foreign SDK sources", () => {
  for (const value of [
    tag.replace(' data-entry-id="entry"', ''),
    tag.replace(' data-apikey="public-key"', ''),
    tag.replace('<script ', '<script onload="alert(1)" '),
    tag.replace('<script ', '<script data-entry-id="other" '),
    tag.replace('us01ccistatic.zoom.us', 'us01ccistatic.zoom.us.evil.example'),
    tag.replace('video-client.js', 'other.js'),
    tag.replace('data-env="us01"', 'data-env="eu01"'),
    tag.replace('</script>', 'alert(1)</script>'),
    tag + '<img src=x>',
  ]) assert.equal(parseZoomVideoTag(value), null, value);
});
