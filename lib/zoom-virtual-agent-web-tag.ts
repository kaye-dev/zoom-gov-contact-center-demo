export type ZoomVirtualAgentWebTagConfig = {
  scriptSrc: string;
  apiKey: string;
  environment: string;
};

const MAX_WEB_TAG_LENGTH = 4096;
const SCRIPT_TAG_PATTERN = /^\s*<script\b([^>]*)>\s*<\/script>\s*$/i;
const ATTRIBUTE_PATTERN = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ALLOWED_ATTRIBUTES = new Set(["type", "src", "data-apikey", "data-env"]);
const API_KEY_PATTERN = /^[A-Za-z0-9_-]{10,256}$/;
const ENVIRONMENT_PATTERN = /^[a-z]{2}\d{2}$/;

export function parseZoomVirtualAgentWebTag(
  value: string,
): ZoomVirtualAgentWebTagConfig | null {
  if (value.length === 0 || value.length > MAX_WEB_TAG_LENGTH) {
    return null;
  }

  const scriptMatch = SCRIPT_TAG_PATTERN.exec(value);
  if (!scriptMatch) return null;

  const attributes = parseAttributes(scriptMatch[1]);
  if (!attributes) return null;

  if (
    attributes.size !== ALLOWED_ATTRIBUTES.size ||
    attributes.get("type")?.toLowerCase() !== "module"
  ) {
    return null;
  }

  const scriptSrc = attributes.get("src");
  const apiKey = attributes.get("data-apikey");
  const environment = attributes.get("data-env");

  if (
    !scriptSrc ||
    !apiKey ||
    !environment ||
    !isValidZoomScriptSource(scriptSrc, environment) ||
    !API_KEY_PATTERN.test(apiKey) ||
    !ENVIRONMENT_PATTERN.test(environment)
  ) {
    return null;
  }

  return { scriptSrc, apiKey, environment };
}

export function formatZoomVirtualAgentWebTag(
  config: ZoomVirtualAgentWebTagConfig,
): string {
  return `<script type="module" src="${config.scriptSrc}" data-apikey="${config.apiKey}" data-env="${config.environment}"></script>`;
}

export function normalizeZoomVirtualAgentWebTag(value: string): string | null {
  const parsed = parseZoomVirtualAgentWebTag(value);
  return parsed ? formatZoomVirtualAgentWebTag(parsed) : null;
}

function parseAttributes(value: string): Map<string, string> | null {
  const attributes = new Map<string, string>();
  let cursor = 0;

  for (const match of value.matchAll(ATTRIBUTE_PATTERN)) {
    if (match.index === undefined) return null;

    const gap = value.slice(cursor, match.index);
    if (!/^\s*$/.test(gap)) return null;

    const name = match[1].toLowerCase();
    if (!ALLOWED_ATTRIBUTES.has(name) || attributes.has(name)) {
      return null;
    }

    attributes.set(name, match[2] ?? match[3] ?? "");
    cursor = match.index + match[0].length;
  }

  if (!/^\s*$/.test(value.slice(cursor))) return null;
  return attributes;
}

function isValidZoomScriptSource(
  value: string,
  environment: string,
): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      url.hostname === `${environment}ccistatic.zoom.us` &&
      url.pathname === `/${environment}cci/web-sdk/chat-client.js`
    );
  } catch {
    return false;
  }
}
