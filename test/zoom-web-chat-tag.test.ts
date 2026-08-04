import assert from "node:assert/strict";
import test from "node:test";

import {
  formatZoomWebChatTag,
  normalizeCampaignWebTag,
  normalizeContactCenterEntryIdWebTag,
  parseCampaignWebTag,
  parseContactCenterEntryIdWebTag,
} from "../lib/zoom-web-chat-tag";

const campaignTag =
  '<script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js" data-apikey="public-api-key" data-env="us01"></script>';
const entryIdTag =
  '<script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js" data-chat-entry-id="entry-id-value" data-env="us01" data-apikey="public-api-key"></script>';

test("Campaign Web Tag accepts optional type/env and normalizes attributes", () => {
  const reordered = `
    <script data-apikey='public-api-key'
      src='https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js'
      data-env='us01' type='MODULE'></script>
  `;
  const parsed = parseCampaignWebTag(reordered);

  assert.deepEqual(parsed, {
    mode: "CAMPAIGN",
    scriptSrc:
      "https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js",
    apiKey: "public-api-key",
    environment: "us01",
    scriptType: "module",
  });
  assert.equal(formatZoomWebChatTag(parsed!), campaignTag);
  assert.equal(normalizeCampaignWebTag(reordered), campaignTag);

  assert.deepEqual(
    parseCampaignWebTag(
      '<script src="https://eu01ccistatic.zoom.us/eu01cci/web-sdk/zcc-sdk.js" data-apikey="public-api-key"></script>',
    ),
    {
      mode: "CAMPAIGN",
      scriptSrc: "https://eu01ccistatic.zoom.us/eu01cci/web-sdk/zcc-sdk.js",
      apiKey: "public-api-key",
      environment: "eu01",
      scriptType: null,
    },
  );
});

test("Contact Center Entry ID tag requires and preserves data-chat-entry-id", () => {
  const parsed = parseContactCenterEntryIdWebTag(entryIdTag);

  assert.deepEqual(parsed, {
    mode: "CONTACT_CENTER_ENTRY_ID",
    scriptSrc:
      "https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js",
    apiKey: "public-api-key",
    environment: "us01",
    scriptType: "module",
    chatEntryId: "entry-id-value",
  });
  assert.equal(formatZoomWebChatTag(parsed!), entryIdTag);
  assert.equal(normalizeContactCenterEntryIdWebTag(entryIdTag), entryIdTag);
});

test("Campaign and Contact Center tags cannot be used in the other mode", () => {
  assert.equal(parseCampaignWebTag(entryIdTag), null);
  assert.equal(parseContactCenterEntryIdWebTag(campaignTag), null);
});

test("Zoom Web Chat tags reject unsafe sources and malformed scripts", () => {
  const invalidCampaignTags = [
    campaignTag.replace("https://", "http://"),
    campaignTag.replace("us01ccistatic.zoom.us", "zoom.us.attacker.example"),
    campaignTag.replace("us01ccistatic.zoom.us", "zoom.us"),
    campaignTag.replace("/web-sdk/chat-client.js", "/web-sdk/other.js"),
    campaignTag.replace("chat-client.js", "chat-client.js?version=1"),
    campaignTag.replace(' data-env="us01"', ' data-env="eu01"'),
    campaignTag.replace(' data-env="us01"', ' data-env="US01"'),
    campaignTag.replaceAll("us01", "zz99"),
    campaignTag.replace(' data-env="us01"', ' async="true" data-env="us01"'),
    campaignTag.replace(
      ' data-env="us01"',
      ' data-env="us01" data-env="us01"',
    ),
    campaignTag.replace('type="module"', 'type="text/javascript"'),
    campaignTag.replace('type="module"', "type=module"),
    campaignTag.replace('data-apikey="public-api-key"', 'data-apikey=""'),
    campaignTag.replace("</script>", "alert(1)</script>"),
    `${campaignTag}<script></script>`,
    campaignTag.replace(
      "https://us01ccistatic.zoom.us",
      "https://us01ccistatic.zoom.us:444",
    ),
    campaignTag.replace(
      "https://us01ccistatic.zoom.us",
      "https://us01ccistatic.zoom.us:443",
    ),
    campaignTag.replace(
      "https://us01ccistatic.zoom.us",
      "https://@us01ccistatic.zoom.us",
    ),
    campaignTag.replace(
      "https://us01ccistatic.zoom.us",
      " https://us01ccistatic.zoom.us",
    ),
  ];

  for (const invalidTag of invalidCampaignTags) {
    assert.equal(parseCampaignWebTag(invalidTag), null, invalidTag);
  }
});

test("Zoom Web Chat tags reject empty, unsafe and oversized opaque values", () => {
  assert.equal(
    parseContactCenterEntryIdWebTag(
      entryIdTag.replace('data-chat-entry-id="entry-id-value"', 'data-chat-entry-id=""'),
    ),
    null,
  );
  assert.equal(
    parseContactCenterEntryIdWebTag(
      entryIdTag.replace(
        'data-chat-entry-id="entry-id-value"',
        'data-chat-entry-id="entry id value"',
      ),
    ),
    null,
  );
  assert.equal(
    parseCampaignWebTag(
      campaignTag.replace("public-api-key", "a".repeat(513)),
    ),
    null,
  );
  assert.equal(
    parseCampaignWebTag(
      campaignTag.replace("public-api-key", "public\u0085api-key"),
    ),
    null,
  );
  assert.equal(parseCampaignWebTag(" ".repeat(4097)), null);
});
