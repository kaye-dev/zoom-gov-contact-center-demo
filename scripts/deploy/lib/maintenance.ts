export const MAINTENANCE_EDGE_CONFIG_KEYS = [
  "site_maintenance_production",
  "site_maintenance_preview",
  "site_maintenance_development",
] as const;

export type MaintenanceEdgeConfigKey =
  (typeof MAINTENANCE_EDGE_CONFIG_KEYS)[number];

export type MaintenanceMode = "DISABLED" | "ENABLED" | "SCHEDULED";

export type MaintenanceSetting = {
  version: 1;
  mode: MaintenanceMode;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  updatedAt: string;
};

export type MaintenanceEdgeConfigSnapshot = Record<
  MaintenanceEdgeConfigKey,
  MaintenanceSetting
>;

export type MaintenanceEdgeConfigCredentials = {
  connectionString: string;
  edgeConfigId: string;
  readToken: string;
  writeToken: string;
};

export type MaintenancePublicExpectation = {
  key: MaintenanceEdgeConfigKey;
  status: 200 | 503;
  retryAfter?: string;
};

export type MaintenanceRequestFunction = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const EDGE_CONFIG_HOST = "edge-config.vercel.com";
const EDGE_CONFIG_REQUEST_TIMEOUT_MS = 30_000;
const MAINTENANCE_SETTING_FIELDS = [
  "mode",
  "scheduledEndAt",
  "scheduledStartAt",
  "updatedAt",
  "version",
] as const;

export function validateMaintenanceEdgeConfigCredentials(input: {
  connectionString: string;
  edgeConfigId: string;
  writeToken: string;
}): MaintenanceEdgeConfigCredentials {
  const connectionString = input.connectionString.trim();
  const edgeConfigId = validateEdgeConfigIdentifier(input.edgeConfigId);
  const writeToken = validateToken(input.writeToken, "write token");
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("EDGE_CONFIG must be a valid Vercel Edge Config connection string.");
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const queryEntries = [...url.searchParams.entries()];
  if (
    url.protocol !== "https:" ||
    url.hostname !== EDGE_CONFIG_HOST ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    pathParts.length !== 1 ||
    queryEntries.length !== 1 ||
    queryEntries[0]?.[0] !== "token"
  ) {
    throw new Error("EDGE_CONFIG must use the canonical Vercel Edge Config connection-string format.");
  }

  const connectionId = validateEdgeConfigIdentifier(pathParts[0] ?? "");
  if (connectionId !== edgeConfigId) {
    throw new Error(
      "EDGE_CONFIG and MAINTENANCE_EDGE_CONFIG_ID must identify the same Edge Config.",
    );
  }

  const readToken = validateToken(url.searchParams.get("token") ?? "", "read token");
  return {
    connectionString,
    edgeConfigId,
    readToken,
    writeToken,
  };
}

export function parseMaintenanceEdgeConfigItems(
  value: unknown,
): MaintenanceEdgeConfigSnapshot {
  if (!isRecord(value)) {
    throw new Error("Edge Config items response must be a JSON object.");
  }

  return Object.fromEntries(
    MAINTENANCE_EDGE_CONFIG_KEYS.map((key) => [
      key,
      parseMaintenanceSetting(value[key], key),
    ]),
  ) as MaintenanceEdgeConfigSnapshot;
}

export async function verifyMaintenanceEdgeConfig(
  credentials: MaintenanceEdgeConfigCredentials,
  expectedOwnerId: string,
  request: MaintenanceRequestFunction = globalThis.fetch,
): Promise<MaintenanceEdgeConfigSnapshot> {
  const metadata = await requestJson(
    createManagementUrl(
      `/v1/edge-config/${encodeURIComponent(credentials.edgeConfigId)}`,
      expectedOwnerId,
    ),
    credentials.writeToken,
    "Edge Config management metadata",
    request,
  );
  if (
    !isRecord(metadata) ||
    metadata.id !== credentials.edgeConfigId ||
    metadata.ownerId !== expectedOwnerId
  ) {
    throw new Error(
      "Edge Config management metadata did not match the reviewed Vercel scope and Edge Config ID.",
    );
  }

  const managementItems = parseMaintenanceEdgeConfigItems(
    await requestJson(
      createManagementUrl(
        `/v1/edge-config/${encodeURIComponent(credentials.edgeConfigId)}/items`,
        expectedOwnerId,
      ),
      credentials.writeToken,
      "Edge Config management items",
      request,
    ),
  );
  const readItems = await readMaintenanceEdgeConfig(credentials, request);

  for (const key of MAINTENANCE_EDGE_CONFIG_KEYS) {
    if (!maintenanceSettingsEqual(managementItems[key], readItems[key])) {
      throw new Error(
        `Edge Config read and management endpoints disagree for ${key}; wait for propagation and retry.`,
      );
    }
  }

  return readItems;
}

export async function readMaintenanceEdgeConfig(
  credentials: Pick<
    MaintenanceEdgeConfigCredentials,
    "edgeConfigId" | "readToken"
  >,
  request: MaintenanceRequestFunction = globalThis.fetch,
): Promise<MaintenanceEdgeConfigSnapshot> {
  return parseMaintenanceEdgeConfigItems(
    await requestJson(
      new URL(
        `/${encodeURIComponent(credentials.edgeConfigId)}/items`,
        `https://${EDGE_CONFIG_HOST}`,
      ),
      credentials.readToken,
      "Edge Config read endpoint",
      request,
    ),
  );
}

export function createMaintenancePublicExpectation(
  snapshot: MaintenanceEdgeConfigSnapshot,
  key: MaintenanceEdgeConfigKey,
  now = new Date(),
): MaintenancePublicExpectation {
  const setting = snapshot[key];
  if (setting.mode === "ENABLED") {
    return { key, status: 503 };
  }
  if (
    setting.mode === "SCHEDULED" &&
    Date.parse(setting.scheduledStartAt!) <= now.getTime() &&
    now.getTime() < Date.parse(setting.scheduledEndAt!)
  ) {
    return {
      key,
      status: 503,
      retryAfter: new Date(setting.scheduledEndAt!).toUTCString(),
    };
  }
  return { key, status: 200 };
}

function parseMaintenanceSetting(
  value: unknown,
  key: MaintenanceEdgeConfigKey,
): MaintenanceSetting {
  if (!isRecord(value)) {
    throw invalidMaintenanceSetting(key);
  }
  const fields = Object.keys(value).sort();
  if (
    fields.length !== MAINTENANCE_SETTING_FIELDS.length ||
    fields.some((field, index) => field !== MAINTENANCE_SETTING_FIELDS[index])
  ) {
    throw invalidMaintenanceSetting(key);
  }
  if (
    value.version !== 1 ||
    !isMaintenanceMode(value.mode) ||
    !isNullableUtcIsoTimestamp(value.scheduledStartAt) ||
    !isNullableUtcIsoTimestamp(value.scheduledEndAt) ||
    !isUtcIsoTimestamp(value.updatedAt)
  ) {
    throw invalidMaintenanceSetting(key);
  }

  const hasScheduledStart = value.scheduledStartAt !== null;
  const hasScheduledEnd = value.scheduledEndAt !== null;
  if (
    hasScheduledStart !== hasScheduledEnd ||
    (hasScheduledStart &&
      hasScheduledEnd &&
      Date.parse(value.scheduledStartAt as string) >=
        Date.parse(value.scheduledEndAt as string)) ||
    (value.mode === "SCHEDULED" &&
      (!hasScheduledStart || !hasScheduledEnd))
  ) {
    throw invalidMaintenanceSetting(key);
  }

  return {
    version: 1,
    mode: value.mode,
    scheduledStartAt: value.scheduledStartAt,
    scheduledEndAt: value.scheduledEndAt,
    updatedAt: value.updatedAt,
  };
}

async function requestJson(
  url: URL,
  token: string,
  description: string,
  request: MaintenanceRequestFunction,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    EDGE_CONFIG_REQUEST_TIMEOUT_MS,
  );
  try {
    let response: Response;
    try {
      response = await request(url, {
        headers: { authorization: `Bearer ${token}` },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      throw new Error(`${description} could not be reached.`);
    }
    if (!response.ok) {
      await response.arrayBuffer().catch(() => undefined);
      throw new Error(`${description} returned HTTP ${response.status}.`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`${description} returned invalid JSON.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function createManagementUrl(pathname: string, teamId: string): URL {
  const url = new URL(pathname, "https://api.vercel.com");
  url.searchParams.set("teamId", teamId);
  return url;
}

function validateEdgeConfigIdentifier(value: string): string {
  const normalized = value.trim();
  if (!/^ecfg_[A-Za-z0-9_-]{1,251}$/.test(normalized)) {
    throw new Error("MAINTENANCE_EDGE_CONFIG_ID is invalid.");
  }
  return normalized;
}

function validateToken(value: string, label: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 4096 ||
    /[\u0000-\u0020\u007f]/.test(normalized)
  ) {
    throw new Error(`The Edge Config ${label} is invalid.`);
  }
  return normalized;
}

function isMaintenanceMode(value: unknown): value is MaintenanceMode {
  return value === "DISABLED" || value === "ENABLED" || value === "SCHEDULED";
}

function isNullableUtcIsoTimestamp(value: unknown): value is string | null {
  return value === null || isUtcIsoTimestamp(value);
}

function isUtcIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(
      value,
    );
  if (!match) return false;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const date = new Date(timestamp);
  const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6]) &&
    date.getUTCMilliseconds() === milliseconds
  );
}

function maintenanceSettingsEqual(
  left: MaintenanceSetting,
  right: MaintenanceSetting,
): boolean {
  return (
    left.version === right.version &&
    left.mode === right.mode &&
    left.scheduledStartAt === right.scheduledStartAt &&
    left.scheduledEndAt === right.scheduledEndAt &&
    left.updatedAt === right.updatedAt
  );
}

function invalidMaintenanceSetting(key: MaintenanceEdgeConfigKey): Error {
  return new Error(`Edge Config key ${key} has an invalid maintenance value.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
