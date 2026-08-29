import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ZoomWebChatScript } from "../app/components/ZoomWebChatScript";
import type { ZoomWebChatTagConfig } from "../lib/zoom-web-chat-tag";

const localeGateSource = readFileSync(
  new URL("../app/components/ZoomWebChatLocaleGate.tsx", import.meta.url),
  "utf8",
);
const launcherSource = readFileSync(
  new URL("../app/components/ZoomWebChatLauncher.tsx", import.meta.url),
  "utf8",
);

const campaignConfig: ZoomWebChatTagConfig = {
  mode: "CAMPAIGN",
  scriptSrc:
    "https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js",
  apiKey: "public-api-key",
  environment: "us01",
  scriptType: "module",
};

const entryIdConfig: ZoomWebChatTagConfig = {
  mode: "CONTACT_CENTER_ENTRY_ID",
  scriptSrc:
    "https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js",
  apiKey: "public-api-key",
  environment: "us01",
  scriptType: null,
  chatEntryId: "public-entry-id",
};

test("disabled chat does not render the Zoom SDK script", () => {
  assert.equal(ZoomWebChatScript({ config: null }), null);
});

test("Campaign renders one safe script without an Entry ID", () => {
  const script = ZoomWebChatScript({ config: campaignConfig });

  assert.ok(script);
  assert.equal(script.props.id, "zoom-web-chat-script");
  assert.equal(script.props.type, "module");
  assert.equal(script.props.src, campaignConfig.scriptSrc);
  assert.equal(script.props["data-apikey"], campaignConfig.apiKey);
  assert.equal(script.props["data-env"], campaignConfig.environment);
  assert.equal(script.props["data-chat-entry-id"], undefined);
  assert.equal(script.props.strategy, "afterInteractive");
});

test("Contact Center renders the selected Entry ID and preserves optional type", () => {
  const script = ZoomWebChatScript({ config: entryIdConfig });

  assert.ok(script);
  assert.equal(script.props.id, "zoom-web-chat-script");
  assert.equal(script.props.type, undefined);
  assert.equal(script.props.src, entryIdConfig.scriptSrc);
  assert.equal(script.props["data-apikey"], entryIdConfig.apiKey);
  assert.equal(script.props["data-env"], entryIdConfig.environment);
  assert.equal(
    script.props["data-chat-entry-id"],
    entryIdConfig.chatEntryId,
  );
  assert.equal(script.props.strategy, "afterInteractive");
});

test("Zoom SDK rendering waits for the synchronized site language", () => {
  assert.match(localeGateSource, /const \{ isLocaleReady, locale \} = useI18n\(\);/);
  assert.match(localeGateSource, /!isLocaleReady/);
  assert.match(
    localeGateSource,
    /document\.documentElement\.lang !== toHtmlLanguageTag\(locale\)/,
  );
  assert.match(localeGateSource, /return <ZoomWebChatScript config={config} \/>;/);
  assert.doesNotMatch(localeGateSource, /data-language|zoomCampaignSdkConfig/);
  assert.match(launcherSource, /<ZoomWebChatLocaleGate config={config} \/>/);
});
