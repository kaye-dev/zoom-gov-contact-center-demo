import { validateDatabaseUrls, type DatabaseTarget } from "./validation";

const NEON_API_ORIGIN = "https://console.neon.tech";
const NEON_API_PREFIX = "/api/v2";
const REQUEST_TIMEOUT_MS = 30_000;

export type NeonDeploymentConfig = {
  projectId: string;
  projectName: string;
  branchId: string;
  databaseName: string;
  roleName: string;
  regionId: "aws-ap-southeast-1";
  expectedPlan: "free";
};

export type NeonRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type NeonConnectionContext = {
  database: DatabaseTarget;
  organizationId: string;
};

export async function loadNeonConnectionContext(
  config: NeonDeploymentConfig,
  apiKey: string,
  request: NeonRequest = globalThis.fetch,
): Promise<NeonConnectionContext> {
  assertConfig(config);
  if (!apiKey || /[\r\n\0]/u.test(apiKey)) {
    throw new Error("The Neon API credential is invalid.");
  }

  const projectResponse = await neonGet(
    `/projects/${encodeURIComponent(config.projectId)}`,
    apiKey,
    request,
  );
  const project = requiredRecord(projectResponse.project, "Neon project");
  if (
    project.id !== config.projectId ||
    project.name !== config.projectName ||
    project.region_id !== config.regionId ||
    typeof project.org_id !== "string" ||
    !project.org_id
  ) {
    throw new Error("The Neon API project does not match the stored deployment target.");
  }
  const organizationId = project.org_id;

  const organizationResponse = await neonGet(
    `/organizations/${encodeURIComponent(organizationId)}`,
    apiKey,
    request,
  );
  const organization = isRecord(organizationResponse.organization)
    ? organizationResponse.organization
    : organizationResponse;
  if (
    organization.id !== organizationId ||
    organization.plan !== config.expectedPlan
  ) {
    throw new Error("The Neon organization does not match the stored deployment policy.");
  }

  const branchResponse = await neonGet(
    `/projects/${encodeURIComponent(config.projectId)}/branches/${encodeURIComponent(config.branchId)}`,
    apiKey,
    request,
  );
  const branch = requiredRecord(branchResponse.branch, "Neon branch");
  if (
    branch.id !== config.branchId ||
    branch.project_id !== config.projectId
  ) {
    throw new Error("The Neon branch does not match the stored deployment target.");
  }

  const databaseResponse = await neonGet(
    `/projects/${encodeURIComponent(config.projectId)}/branches/${encodeURIComponent(config.branchId)}/databases/${encodeURIComponent(config.databaseName)}`,
    apiKey,
    request,
  );
  const databaseRecord = requiredRecord(
    databaseResponse.database,
    "Neon database",
  );
  if (
    databaseRecord.branch_id !== config.branchId ||
    databaseRecord.name !== config.databaseName ||
    databaseRecord.owner_name !== config.roleName
  ) {
    throw new Error("The Neon database does not match the stored deployment target.");
  }

  const roleResponse = await neonGet(
    `/projects/${encodeURIComponent(config.projectId)}/branches/${encodeURIComponent(config.branchId)}/roles/${encodeURIComponent(config.roleName)}`,
    apiKey,
    request,
  );
  const role = requiredRecord(roleResponse.role, "Neon role");
  if (role.branch_id !== config.branchId || role.name !== config.roleName) {
    throw new Error("The Neon role does not match the stored deployment target.");
  }

  const endpointsResponse = await neonGet(
    `/projects/${encodeURIComponent(config.projectId)}/endpoints`,
    apiKey,
    request,
  );
  if (!Array.isArray(endpointsResponse.endpoints)) {
    throw new Error("The Neon endpoints response is invalid.");
  }
  const endpoints = endpointsResponse.endpoints.filter(
    (value): value is Record<string, unknown> =>
      isRecord(value) &&
      value.project_id === config.projectId &&
      value.branch_id === config.branchId &&
      value.region_id === config.regionId &&
      value.type === "read_write" &&
      value.disabled !== true,
  );
  if (endpoints.length !== 1) {
    throw new Error(
      "The Neon branch must have exactly one enabled read-write endpoint in the stored region.",
    );
  }
  const endpoint = endpoints[0];
  if (
    typeof endpoint?.id !== "string" ||
    !/^[a-z0-9-]{1,60}$/u.test(endpoint.id) ||
    typeof endpoint.host !== "string" ||
    !endpoint.host
  ) {
    throw new Error("The Neon read-write endpoint response is invalid.");
  }

  const [pooledResponse, directResponse] = await Promise.all([
    neonGet(connectionPath(config, endpoint.id, true), apiKey, request),
    neonGet(connectionPath(config, endpoint.id, false), apiKey, request),
  ]);
  if (
    typeof pooledResponse.uri !== "string" ||
    typeof directResponse.uri !== "string"
  ) {
    throw new Error("The Neon connection URI response is invalid.");
  }
  const database = validateDatabaseUrls(
    pooledResponse.uri,
    directResponse.uri,
  );
  if (
    database.endpointId !== endpoint.id ||
    database.directHost.toLowerCase() !== endpoint.host.toLowerCase() ||
    database.database !== config.databaseName ||
    database.username !== config.roleName
  ) {
    throw new Error(
      "The dynamic Neon connection URIs do not match the stored database target.",
    );
  }

  return { database, organizationId };
}

function connectionPath(
  config: NeonDeploymentConfig,
  endpointId: string,
  pooled: boolean,
): string {
  const search = new URLSearchParams({
    branch_id: config.branchId,
    endpoint_id: endpointId,
    database_name: config.databaseName,
    role_name: config.roleName,
    pooled: String(pooled),
  });
  return `/projects/${encodeURIComponent(config.projectId)}/connection_uri?${search.toString()}`;
}

async function neonGet(
  path: string,
  apiKey: string,
  request: NeonRequest,
): Promise<Record<string, unknown>> {
  const url = new URL(`${NEON_API_PREFIX}${path}`, NEON_API_ORIGIN);
  let response: Response;
  try {
    response = await request(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Neon API GET ${url.pathname} failed before a response.`);
  }
  if (!response.ok) {
    await response.arrayBuffer().catch(() => undefined);
    throw new Error(
      `Neon API GET ${url.pathname} returned HTTP ${response.status}.`,
    );
  }
  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new Error(`Neon API GET ${url.pathname} returned invalid JSON.`);
  }
  if (!isRecord(value)) {
    throw new Error(`Neon API GET ${url.pathname} returned an invalid object.`);
  }
  return value;
}

function assertConfig(config: NeonDeploymentConfig): void {
  for (const value of [
    config.projectId,
    config.branchId,
  ]) {
    if (!/^[a-z0-9-]{1,60}$/u.test(value)) {
      throw new Error("The stored Neon deployment identifiers are invalid.");
    }
  }
  for (const value of [
    config.projectName,
    config.databaseName,
    config.roleName,
  ]) {
    if (!value || value.length > 128 || /[\r\n\0]/u.test(value)) {
      throw new Error("The stored Neon deployment names are invalid.");
    }
  }
  if (
    config.regionId !== "aws-ap-southeast-1" ||
    config.expectedPlan !== "free"
  ) {
    throw new Error("The stored Neon deployment policy is unsupported.");
  }
}

function requiredRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${description} response is invalid.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
