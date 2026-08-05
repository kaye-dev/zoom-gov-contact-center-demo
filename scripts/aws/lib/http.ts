import { fetchWithAwsPayloadHash } from "../../../lib/client-fetch";

import { getStackOutput } from "./aws";
import type { AwsRuntimeConfig } from "./config";

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const OAC_POST_PROBE_BODY = JSON.stringify({
  oacPayloadHashProbe: true,
});

export function applicationUrl(config: AwsRuntimeConfig): URL {
  const value = getStackOutput(
    config,
    config.webStackName,
    "ApplicationUrl",
  );
  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new Error("ApplicationUrl must use HTTPS.");
  }

  return url;
}

export function privateFunctionUrl(config: AwsRuntimeConfig): URL {
  const value = getStackOutput(
    config,
    config.webStackName,
    "FunctionUrl",
  );
  const url = new URL(value);

  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".lambda-url.ap-northeast-1.on.aws")
  ) {
    throw new Error("FunctionUrl output is not a Tokyo Lambda Function URL.");
  }

  return url;
}

export function endpointUrl(baseUrl: URL, path: string): URL {
  const normalizedBase = new URL(baseUrl.toString());
  if (!normalizedBase.pathname.endsWith("/")) {
    normalizedBase.pathname += "/";
  }

  return new URL(path.replace(/^\//, ""), normalizedBase);
}

export function isHealthyPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.status !== "ok") {
    return false;
  }

  if (typeof record.database !== "object" || record.database === null) {
    return false;
  }

  return (record.database as Record<string, unknown>).configured === true;
}

export async function fetchWithTimeout(
  url: URL,
  timeoutMilliseconds: number,
  init: RequestInit = {},
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  const headers = new Headers(init.headers);
  if (!headers.has("user-agent")) {
    headers.set("user-agent", "zoom-gov-demo-aws-operations/1.0");
  }

  try {
    return await fetchWithAwsPayloadHash(
      url,
      {
        ...init,
        method: init.method ?? "GET",
        redirect: init.redirect ?? "follow",
        signal: controller.signal,
        headers,
      },
      fetchImplementation,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertHealthyResponse(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(`Health endpoint returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  if (!isHealthyPayload(payload)) {
    throw new Error("Health endpoint returned an unhealthy payload.");
  }
}

export async function assertOacPostProbeResponse(
  response: Response,
): Promise<void> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (
    response.status !== 200 ||
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    (payload as Record<string, unknown>).ok !== true
  ) {
    throw new Error(
      `OAC POST probe did not reach the application (HTTP ${response.status}).`,
    );
  }
}

export function assertDirectFunctionUrlDenied(response: Response): void {
  if (response.status !== 403) {
    throw new Error(
      `Direct Lambda Function URL returned HTTP ${response.status}; expected 403.`,
    );
  }
}
