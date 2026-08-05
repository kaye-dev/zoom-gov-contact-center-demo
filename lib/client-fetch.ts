export const AWS_PAYLOAD_HASH_HEADER = "x-amz-content-sha256";

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const PAYLOAD_HASH_METHODS = new Set(["POST", "PUT"]);

function resolveRequestInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === "string" && typeof window !== "undefined") {
    return new URL(input, window.location.href);
  }

  return input;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Fetch wrapper for browser requests sent through CloudFront OAC.
 *
 * Lambda Function URL origins reject unsigned POST/PUT payloads. Constructing a
 * Request first lets the browser serialize BodyInit (including FormData) once;
 * the hash and the transmitted request therefore use the exact same bytes.
 */
export async function fetchWithAwsPayloadHash(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<Response> {
  const request = new Request(resolveRequestInput(input), init);

  if (PAYLOAD_HASH_METHODS.has(request.method.toUpperCase())) {
    const body = await request.clone().arrayBuffer();
    request.headers.set(AWS_PAYLOAD_HASH_HEADER, await sha256Hex(body));
  }

  return fetchImplementation(request);
}
