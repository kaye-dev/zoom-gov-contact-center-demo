export type ZoomCampaignWebChatTagConfig = {
  mode: "CAMPAIGN";
  scriptSrc: string;
  apiKey: string;
  environment: string;
  scriptType: "module" | null;
};

export type ZoomContactCenterEntryIdWebChatTagConfig = {
  mode: "CONTACT_CENTER_ENTRY_ID";
  scriptSrc: string;
  apiKey: string;
  environment: string;
  scriptType: "module" | null;
  chatEntryId: string;
};

export type ZoomWebChatTagConfig =
  | ZoomCampaignWebChatTagConfig
  | ZoomContactCenterEntryIdWebChatTagConfig;

const MAX_WEB_TAG_LENGTH = 4096;
const MAX_OPAQUE_VALUE_LENGTH = 512;
const SCRIPT_TAG_PATTERN = /^\s*<script\b([^>]*)>\s*<\/script>\s*$/i;
const ATTRIBUTE_PATTERN =
  /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const COMMON_ATTRIBUTES = new Set(["type", "src", "data-apikey", "data-env"]);
const ENTRY_ID_ATTRIBUTES = new Set([
  ...COMMON_ATTRIBUTES,
  "data-chat-entry-id",
]);
const ZOOM_ENVIRONMENTS = new Set(["us01", "eu01"]);
const ZOOM_CDN_HOST_PATTERN = /^(us01|eu01)ccistatic\.zoom\.us$/;
const SDK_FILE_PATTERN = /^(?:chat-client|zcc-sdk)\.js$/;
const UNSAFE_OPAQUE_VALUE_PATTERN = /[\u0000-\u0020\u007f-\u009f"'`<>&]/;

export function parseCampaignWebTag(
  value: string,
): ZoomCampaignWebChatTagConfig | null {
  const parsed = parseWebTag(value, "CAMPAIGN");
  return parsed?.mode === "CAMPAIGN" ? parsed : null;
}

export function parseContactCenterEntryIdWebTag(
  value: string,
): ZoomContactCenterEntryIdWebChatTagConfig | null {
  const parsed = parseWebTag(value, "CONTACT_CENTER_ENTRY_ID");
  return parsed?.mode === "CONTACT_CENTER_ENTRY_ID" ? parsed : null;
}

export function formatZoomWebChatTag(config: ZoomWebChatTagConfig): string {
  const attributes = [
    config.scriptType ? `type="${config.scriptType}"` : null,
    `src="${config.scriptSrc}"`,
    config.mode === "CONTACT_CENTER_ENTRY_ID"
      ? `data-chat-entry-id="${config.chatEntryId}"`
      : null,
    config.mode === "CAMPAIGN" ? `data-apikey="${config.apiKey}"` : null,
    `data-env="${config.environment}"`,
    config.mode === "CONTACT_CENTER_ENTRY_ID"
      ? `data-apikey="${config.apiKey}"`
      : null,
  ].filter((attribute): attribute is string => attribute !== null);

  return `<script ${attributes.join(" ")}></script>`;
}

export function normalizeCampaignWebTag(value: string): string | null {
  const parsed = parseCampaignWebTag(value);
  return parsed ? formatZoomWebChatTag(parsed) : null;
}

export function normalizeContactCenterEntryIdWebTag(
  value: string,
): string | null {
  const parsed = parseContactCenterEntryIdWebTag(value);
  return parsed ? formatZoomWebChatTag(parsed) : null;
}

function parseWebTag(
  value: string,
  expectedMode: ZoomWebChatTagConfig["mode"],
): ZoomWebChatTagConfig | null {
  if (value.length === 0 || value.length > MAX_WEB_TAG_LENGTH) {
    return null;
  }

  const scriptMatch = SCRIPT_TAG_PATTERN.exec(value);
  if (!scriptMatch) return null;

  const allowedAttributes =
    expectedMode === "CAMPAIGN" ? COMMON_ATTRIBUTES : ENTRY_ID_ATTRIBUTES;
  const attributes = parseAttributes(scriptMatch[1], allowedAttributes);
  if (!attributes) return null;

  const rawScriptType = attributes.get("type") ?? null;
  if (rawScriptType !== null && rawScriptType.toLowerCase() !== "module") {
    return null;
  }

  const rawScriptSrc = attributes.get("src");
  const apiKey = attributes.get("data-apikey");
  const declaredEnvironment = attributes.get("data-env") ?? null;
  if (!rawScriptSrc || !apiKey || !isValidOpaqueValue(apiKey)) {
    return null;
  }

  const scriptSource = parseZoomScriptSource(
    rawScriptSrc,
    declaredEnvironment,
  );
  if (!scriptSource) return null;

  const baseConfig = {
    scriptSrc: scriptSource.scriptSrc,
    apiKey,
    environment: scriptSource.environment,
    scriptType: rawScriptType === null ? null : ("module" as const),
  };

  if (expectedMode === "CAMPAIGN") {
    return { mode: "CAMPAIGN", ...baseConfig };
  }

  const chatEntryId = attributes.get("data-chat-entry-id");
  if (!chatEntryId || !isValidOpaqueValue(chatEntryId)) {
    return null;
  }

  return {
    mode: "CONTACT_CENTER_ENTRY_ID",
    ...baseConfig,
    chatEntryId,
  };
}

function parseAttributes(
  value: string,
  allowedAttributes: ReadonlySet<string>,
): Map<string, string> | null {
  const attributes = new Map<string, string>();
  let cursor = 0;

  for (const match of value.matchAll(ATTRIBUTE_PATTERN)) {
    if (match.index === undefined) return null;

    const gap = value.slice(cursor, match.index);
    if (!/^\s*$/.test(gap)) return null;

    const name = match[1].toLowerCase();
    if (!allowedAttributes.has(name) || attributes.has(name)) {
      return null;
    }

    attributes.set(name, match[2] ?? match[3] ?? "");
    cursor = match.index + match[0].length;
  }

  if (!/^\s*$/.test(value.slice(cursor))) return null;
  return attributes;
}

function parseZoomScriptSource(
  value: string,
  declaredEnvironment: string | null,
): { scriptSrc: string; environment: string } | null {
  try {
    const url = new URL(value);
    if (url.href !== value) return null;

    const hostMatch = ZOOM_CDN_HOST_PATTERN.exec(url.hostname);
    if (!hostMatch) return null;

    const environment = hostMatch[1];
    if (
      !ZOOM_ENVIRONMENTS.has(environment) ||
      (declaredEnvironment !== null && declaredEnvironment !== environment)
    ) {
      return null;
    }

    const expectedPathPrefix = `/${environment}cci/web-sdk/`;
    if (!url.pathname.startsWith(expectedPathPrefix)) return null;

    const sdkFile = url.pathname.slice(expectedPathPrefix.length);
    if (!SDK_FILE_PATTERN.test(sdkFile)) return null;

    if (
      url.protocol !== "https:" ||
      url.username.length !== 0 ||
      url.password.length !== 0 ||
      url.port.length !== 0 ||
      url.search.length !== 0 ||
      url.hash.length !== 0
    ) {
      return null;
    }

    return { scriptSrc: url.href, environment };
  } catch {
    return null;
  }
}

function isValidOpaqueValue(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_OPAQUE_VALUE_LENGTH &&
    !UNSAFE_OPAQUE_VALUE_PATTERN.test(value)
  );
}
