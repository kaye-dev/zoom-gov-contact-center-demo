const HOSTNAME_UNSAFE_INPUT_PATTERN = /[%\s\u0000-\u001f\u007f]/u;
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Normalizes a `Host` header value to a comparable hostname. The port is
 * dropped so request hosts compare against configured hostnames in one form.
 */
export function normalizeRequestHostname(
  value: string | null | undefined,
): string | null {
  const candidate = value?.trim();
  if (
    !candidate ||
    HOSTNAME_UNSAFE_INPUT_PATTERN.test(candidate) ||
    candidate.includes("://") ||
    candidate.includes("/") ||
    candidate.includes("?") ||
    candidate.includes("#")
  ) {
    return null;
  }

  try {
    const url = new URL(`https://${candidate}`);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return normalizeParsedHostname(url.hostname);
  } catch {
    return null;
  }
}

/**
 * Normalizes a production canonical origin to its hostname. Production origins
 * must be exact HTTPS origins without a port, credentials, path, query, or
 * fragment.
 */
export function normalizeHttpsOriginHostname(
  value: string | undefined,
): string | null {
  const candidate = value?.trim();
  if (!candidate || HOSTNAME_UNSAFE_INPUT_PATTERN.test(candidate)) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return normalizeParsedHostname(url.hostname);
  } catch {
    return null;
  }
}

/**
 * Normalizes any HTTP(S) origin to its hostname. Unlike
 * {@link normalizeHttpsOriginHostname} this accepts `http:` and a port so local
 * origins such as `http://localhost:3000` resolve too.
 */
export function normalizeOriginHostname(
  value: string | undefined,
): string | null {
  const candidate = value?.trim();
  if (!candidate || HOSTNAME_UNSAFE_INPUT_PATTERN.test(candidate)) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return normalizeParsedHostname(url.hostname);
  } catch {
    return null;
  }
}

function normalizeParsedHostname(value: string): string | null {
  const hostname = value.toLowerCase().replace(/\.$/, "");
  if (!hostname) return null;

  // WHATWG URL parsing already validates bracketed IPv6 literals. Keep the
  // brackets so request and canonical values compare in the same form.
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return /^[\[\]0-9a-f:.]+$/.test(hostname) ? hostname : null;
  }

  if (hostname.length > 253) return null;
  const labels = hostname.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !DNS_LABEL_PATTERN.test(label),
    )
  ) {
    return null;
  }

  return hostname;
}
