import assert from "node:assert/strict";
import test from "node:test";

import { ZoomVirtualAgentWebTag } from "../app/components/ZoomVirtualAgentWebTag";
import {
  formatZoomVirtualAgentWebTag,
  normalizeZoomVirtualAgentWebTag,
  parseZoomVirtualAgentWebTag,
} from "../lib/zoom-virtual-agent-web-tag";

const config = {
  scriptSrc:
    "https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js",
  apiKey: "public-api-key",
  environment: "us01",
};

const canonicalTag =
  '<script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js" data-apikey="public-api-key" data-env="us01"></script>';

test("Zoom Web Tagを属性順や空白に依存せず解析して正規化する", () => {
  const input = `
    <script data-env='us01' data-apikey="public-api-key"
      src='https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js'
      type='MODULE'></script>
  `;

  assert.deepEqual(parseZoomVirtualAgentWebTag(input), config);
  assert.equal(normalizeZoomVirtualAgentWebTag(input), canonicalTag);
  assert.equal(formatZoomVirtualAgentWebTag(config), canonicalTag);
});

test("Zoom Web TagはZoomのHTTPS配信元と安全な属性だけを許可する", () => {
  const invalidTags = [
    canonicalTag.replace("https://", "http://"),
    canonicalTag.replace("us01ccistatic.zoom.us", "zoom.us.attacker.example"),
    canonicalTag.replace("us01ccistatic.zoom.us", "zoom.us"),
    canonicalTag.replace("/web-sdk/chat-client.js", "/other.js"),
    canonicalTag.replace("chat-client.js", "chat-client.js?version=1"),
    canonicalTag.replace(' data-env="us01"', ' async data-env="us01"'),
    canonicalTag.replace(' data-env="us01"', ' data-env="us01" data-env="us02"'),
    canonicalTag.replace(' data-env="us01"', ' data-env="eu01"'),
    canonicalTag.replace(' data-env="us01"', ' data-env="bogus"'),
    canonicalTag.replace(' data-env="us01"', ' data-env="US 01"'),
    "<script type='module' src='https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js\"' data-apikey='public-api-key' data-env='us01'></script>",
    canonicalTag.replace("</script>", "alert(1)</script>"),
    canonicalTag.replace(' data-apikey="public-api-key"', ""),
    `${canonicalTag}<script></script>`,
  ];

  for (const invalidTag of invalidTags) {
    assert.equal(parseZoomVirtualAgentWebTag(invalidTag), null, invalidTag);
  }
});

test("Zoom Web Tagの設定がない、または不正な場合は読み込まない", () => {
  assert.equal(ZoomVirtualAgentWebTag({ webTag: null }), null);
  assert.equal(
    ZoomVirtualAgentWebTag({
      webTag:
        '<script type="module" src="https://example.com/chat-client.js" data-apikey="public-api-key" data-env="us01"></script>',
    }),
    null,
  );
});

test("Zoom Web TagへDBで管理する公開設定を安全なpropsとして渡す", () => {
  const webTag = ZoomVirtualAgentWebTag({ webTag: canonicalTag });

  assert.ok(webTag);
  assert.equal(webTag.props.id, "zoom-virtual-agent-web-tag");
  assert.equal(webTag.props.type, "module");
  assert.equal(webTag.props.src, config.scriptSrc);
  assert.equal(webTag.props["data-apikey"], config.apiKey);
  assert.equal(webTag.props["data-env"], config.environment);
  assert.equal(webTag.props.strategy, "afterInteractive");
});
