import { randomUUID } from "node:crypto";

import {
  type NeonDeploymentConfig,
  type NeonRequest,
} from "./neon-api";
import { validateDatabaseUrls } from "./validation";

const NEON_API_ORIGIN = "https://console.neon.tech";
const NEON_API_PREFIX = "/api/v2";
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_OPERATION_POLL_INTERVAL_MS = 5_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 5 * 60_000;
const BRANCH_LIST_LIMIT = 10_000;
const MAX_BRANCH_LIST_PAGES = 100;
const REHEARSAL_BRANCH_PREFIX = "rehearsal/deploy-";

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,60}$/u;
const BRANCH_ID_PATTERN = /^br-[a-z0-9-]{1,57}$/u;
const ENDPOINT_ID_PATTERN = /^ep-[a-z0-9-]{1,57}$/u;
const LSN_PATTERN = /^[0-9a-f]+\/[0-9a-f]+$/iu;

type JsonRecord = Record<string, unknown>;

export type NeonRehearsal = {
  branchId: string;
  branchName: string;
  parentBranchId: string;
  parentLsn: string;
  endpointId: string;
  directUrl: string;
};

export type NeonRehearsalDependencies = {
  request?: NeonRequest;
  wait?: (delayMs: number) => Promise<void>;
  now?: () => number;
  randomId?: () => string;
  operationPollIntervalMs?: number;
  operationTimeoutMs?: number;
};

type ResolvedDependencies = {
  request: NeonRequest;
  wait: (delayMs: number) => Promise<void>;
  now: () => number;
  operationPollIntervalMs: number;
  operationTimeoutMs: number;
};

type RehearsalIdentity = {
  branchId: string;
  branchName: string;
  parentBranchId: string;
  endpointId: string;
};

type CompleteRehearsalIdentity = RehearsalIdentity & {
  parentLsn: string;
};

type EndpointIdentity = {
  id: string;
  host: string;
};

export class NeonMutationAmbiguousError extends Error {
  readonly method: "POST" | "DELETE";

  readonly path: string;

  constructor(method: "POST" | "DELETE", path: string) {
    super(
      `Neon API ${method} ${path} did not return a verifiable response. The mutation was not retried.`,
    );
    this.name = "NeonMutationAmbiguousError";
    this.method = method;
    this.path = path;
  }
}

export async function createNeonRehearsal(
  config: NeonDeploymentConfig,
  apiKey: string,
  dependencies: NeonRehearsalDependencies = {},
): Promise<NeonRehearsal> {
  assertInputs(config, apiKey);
  const runtime = resolveDependencies(dependencies);
  const branchName = createUniqueBranchName(
    runtime.now(),
    dependencies.randomId ?? randomUUID,
  );

  await assertProductionParent(config, apiKey, runtime.request);

  const createPath = `/projects/${encodeURIComponent(config.projectId)}/branches`;
  let createResponse: JsonRecord;
  try {
    createResponse = await neonMutationJson(
      createPath,
      "POST",
      apiKey,
      runtime.request,
      {
        branch: {
          name: branchName,
          parent_id: config.branchId,
          protected: false,
          init_source: "parent-data",
        },
        endpoints: [{ type: "read_write" }],
      },
    );
  } catch (error) {
    if (error instanceof NeonMutationAmbiguousError) {
      const recovered = await recoverAmbiguousCreate(
        config,
        branchName,
        apiKey,
        runtime,
      );
      if (recovered !== undefined) {
        return recovered;
      }
    }
    throw error;
  }

  const createdBranch = requiredRecord(
    createResponse.branch,
    "Neon rehearsal branch",
  );
  const branchId = requiredIdentifier(
    createdBranch.id,
    BRANCH_ID_PATTERN,
    "Neon rehearsal branch ID",
  );
  const createdEndpoints = createResponse.endpoints;
  if (!Array.isArray(createdEndpoints) || createdEndpoints.length !== 1) {
    throw new Error(
      "The Neon rehearsal create response must contain exactly one endpoint.",
    );
  }
  const createdEndpoint = requiredRecord(
    createdEndpoints[0],
    "Neon rehearsal endpoint",
  );
  const endpoint = assertEndpointIdentity(
    createdEndpoint,
    config,
    branchId,
    undefined,
    false,
  );
  const identity: RehearsalIdentity = {
    branchId,
    branchName,
    parentBranchId: config.branchId,
    endpointId: endpoint.id,
  };
  const initialParentLsn = assertRehearsalBranch(
    createdBranch,
    config,
    identity,
    undefined,
    false,
  );

  const operations = createResponse.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error(
      "The Neon rehearsal create response did not include its operation chain.",
    );
  }
  await waitForOperations(operations, config, identity, apiKey, runtime);

  const branchResponse = await neonGet(
    branchPath(config.projectId, branchId),
    apiKey,
    runtime.request,
  );
  const readbackBranch = requiredRecord(
    branchResponse.branch,
    "Neon rehearsal branch",
  );
  const parentLsn = requiredLsn(
    assertRehearsalBranch(
      readbackBranch,
      config,
      identity,
      initialParentLsn,
      true,
    ),
  );
  const completeIdentity: CompleteRehearsalIdentity = {
    ...identity,
    parentLsn,
  };

  const endpointResponse = await neonGet(
    endpointPath(config.projectId, endpoint.id),
    apiKey,
    runtime.request,
  );
  const readbackEndpoint = assertEndpointIdentity(
    requiredRecord(endpointResponse.endpoint, "Neon rehearsal endpoint"),
    config,
    branchId,
    endpoint,
    true,
  );

  const directUrl = await loadDirectConnectionUrl(
    config,
    completeIdentity,
    readbackEndpoint,
    apiKey,
    runtime.request,
  );

  return { ...completeIdentity, directUrl };
}

export async function deleteNeonRehearsal(
  config: NeonDeploymentConfig,
  apiKey: string,
  rehearsal: NeonRehearsal,
  dependencies: NeonRehearsalDependencies = {},
): Promise<void> {
  assertInputs(config, apiKey);
  assertRehearsalHandle(config, rehearsal);
  const runtime = resolveDependencies(dependencies);
  const identity: CompleteRehearsalIdentity = {
    branchId: rehearsal.branchId,
    branchName: rehearsal.branchName,
    parentBranchId: rehearsal.parentBranchId,
    parentLsn: rehearsal.parentLsn,
    endpointId: rehearsal.endpointId,
  };

  const activeBranches = await listActiveBranches(
    config.projectId,
    apiKey,
    runtime.request,
  );
  const target = activeBranches.filter(
    (branch) => branch.id === rehearsal.branchId,
  );
  if (target.length === 0) {
    return;
  }
  if (target.length !== 1) {
    throw new Error("The Neon rehearsal branch readback is ambiguous.");
  }
  if (
    activeBranches.some(
      (branch) => branch.parent_id === rehearsal.branchId,
    )
  ) {
    throw new Error(
      "The Neon rehearsal branch has a child branch and cannot be deleted safely.",
    );
  }

  const branchResponse = await neonGet(
    branchPath(config.projectId, rehearsal.branchId),
    apiKey,
    runtime.request,
  );
  assertRehearsalBranch(
    requiredRecord(branchResponse.branch, "Neon rehearsal branch"),
    config,
    identity,
    identity.parentLsn,
    true,
  );

  const deletePath = `${branchPath(config.projectId, rehearsal.branchId)}?hard_delete=false`;
  let deleteResponse: Response;
  try {
    deleteResponse = await neonRequest(
      deletePath,
      "DELETE",
      apiKey,
      runtime.request,
    );
  } catch (error) {
    if (error instanceof NeonMutationAmbiguousError) {
      const readback = await tryListActiveBranches(
        config.projectId,
        apiKey,
        runtime.request,
      );
      if (
        readback !== undefined &&
        !readback.some((branch) => branch.id === rehearsal.branchId)
      ) {
        return;
      }
    }
    throw error;
  }

  if (deleteResponse.status !== 200 && deleteResponse.status !== 204) {
    await deleteResponse.arrayBuffer().catch(() => undefined);
    throw new NeonMutationAmbiguousError(
      "DELETE",
      branchPath(config.projectId, rehearsal.branchId),
    );
  }
  if (deleteResponse.status !== 204) {
    const deleteResult = await readMutationJson(
      deleteResponse,
      "DELETE",
      new URL(deleteResponse.url || `${NEON_API_ORIGIN}${NEON_API_PREFIX}${deletePath}`).pathname,
    );
    assertRehearsalBranch(
      requiredRecord(deleteResult.branch, "Deleted Neon rehearsal branch"),
      config,
      identity,
      identity.parentLsn,
      false,
    );
    const operations = deleteResult.operations;
    if (!Array.isArray(operations)) {
      throw new NeonMutationAmbiguousError(
        "DELETE",
        branchPath(config.projectId, rehearsal.branchId),
      );
    }
    await waitForOperations(operations, config, identity, apiKey, runtime);
  }

  const finalBranches = await listActiveBranches(
    config.projectId,
    apiKey,
    runtime.request,
  );
  if (finalBranches.some((branch) => branch.id === rehearsal.branchId)) {
    throw new Error("The Neon rehearsal branch deletion could not be verified.");
  }
}

async function assertProductionParent(
  config: NeonDeploymentConfig,
  apiKey: string,
  request: NeonRequest,
): Promise<void> {
  const projectResponse = await neonGet(
    `/projects/${encodeURIComponent(config.projectId)}`,
    apiKey,
    request,
  );
  const project = requiredRecord(projectResponse.project, "Neon project");
  if (
    project.id !== config.projectId ||
    project.name !== config.projectName ||
    project.region_id !== config.regionId
  ) {
    throw new Error(
      "The Neon project does not match the stored rehearsal target.",
    );
  }

  const branchResponse = await neonGet(
    branchPath(config.projectId, config.branchId),
    apiKey,
    request,
  );
  const branch = requiredRecord(branchResponse.branch, "Neon Production branch");
  if (
    branch.id !== config.branchId ||
    branch.project_id !== config.projectId ||
    branch.current_state !== "ready"
  ) {
    throw new Error(
      "The Neon Production branch is not the exact ready parent in the stored target.",
    );
  }
}

async function recoverAmbiguousCreate(
  config: NeonDeploymentConfig,
  branchName: string,
  apiKey: string,
  runtime: ResolvedDependencies,
): Promise<NeonRehearsal | undefined> {
  const deadline = runtime.now() + runtime.operationTimeoutMs;
  while (true) {
    const activeBranches = await tryListActiveBranches(
      config.projectId,
      apiKey,
      runtime.request,
    );
    if (activeBranches !== undefined) {
      const matches = activeBranches.filter(
        (branch) =>
          branch.project_id === config.projectId &&
          branch.parent_id === config.branchId &&
          branch.name === branchName &&
          branch.default === false &&
          branch.protected === false &&
          branch.init_source === "parent-data",
      );
      if (matches.length > 1) {
        throw new Error(
          "The ambiguous Neon rehearsal create response matched multiple branches.",
        );
      }
      const match = matches[0];
      if (match !== undefined) {
        const branchId = requiredIdentifier(
          match.id,
          BRANCH_ID_PATTERN,
          "Recovered Neon rehearsal branch ID",
        );
        const endpointsResponse = await neonGet(
          `${branchPath(config.projectId, branchId)}/endpoints`,
          apiKey,
          runtime.request,
        );
        if (!Array.isArray(endpointsResponse.endpoints)) {
          throw new Error(
            "The recovered Neon rehearsal endpoints response is invalid.",
          );
        }
        const endpoints = endpointsResponse.endpoints.filter(
          (value): value is JsonRecord =>
            isRecord(value) &&
            value.project_id === config.projectId &&
            value.branch_id === branchId &&
            value.region_id === config.regionId &&
            value.type === "read_write" &&
            value.disabled === false,
        );
        if (endpoints.length > 1) {
          throw new Error(
            "The recovered Neon rehearsal branch has multiple read-write endpoints.",
          );
        }
        const endpointRecord = endpoints[0];
        if (endpointRecord !== undefined) {
          const endpoint = assertEndpointIdentity(
            endpointRecord,
            config,
            branchId,
            undefined,
            false,
          );
          const identity: RehearsalIdentity = {
            branchId,
            branchName,
            parentBranchId: config.branchId,
            endpointId: endpoint.id,
          };
          const branchResponse = await neonGet(
            branchPath(config.projectId, branchId),
            apiKey,
            runtime.request,
          );
          const branchRecord = requiredRecord(
            branchResponse.branch,
            "Recovered Neon rehearsal branch",
          );
          const parentLsn = assertRehearsalBranch(
            branchRecord,
            config,
            identity,
            undefined,
            false,
          );
          if (
            branchRecord.current_state === "ready" &&
            parentLsn !== undefined &&
            (endpointRecord.current_state === "active" ||
              endpointRecord.current_state === "idle")
          ) {
            const endpointResponse = await neonGet(
              endpointPath(config.projectId, endpoint.id),
              apiKey,
              runtime.request,
            );
            const readbackEndpoint = assertEndpointIdentity(
              requiredRecord(
                endpointResponse.endpoint,
                "Recovered Neon rehearsal endpoint",
              ),
              config,
              branchId,
              endpoint,
              true,
            );
            const completeIdentity: CompleteRehearsalIdentity = {
              ...identity,
              parentLsn,
            };
            const directUrl = await loadDirectConnectionUrl(
              config,
              completeIdentity,
              readbackEndpoint,
              apiKey,
              runtime.request,
            );
            return { ...completeIdentity, directUrl };
          }
        }
      }
    }
    if (runtime.now() >= deadline) {
      return undefined;
    }
    await runtime.wait(runtime.operationPollIntervalMs);
  }
}

async function loadDirectConnectionUrl(
  config: NeonDeploymentConfig,
  identity: RehearsalIdentity,
  endpoint: EndpointIdentity,
  apiKey: string,
  request: NeonRequest,
): Promise<string> {
  const [pooledResponse, directResponse] = await Promise.all([
    neonGet(
      connectionPath(config, identity.branchId, endpoint.id, true),
      apiKey,
      request,
    ),
    neonGet(
      connectionPath(config, identity.branchId, endpoint.id, false),
      apiKey,
      request,
    ),
  ]);
  if (
    typeof pooledResponse.uri !== "string" ||
    typeof directResponse.uri !== "string"
  ) {
    throw new Error("The Neon rehearsal connection URI response is invalid.");
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
      "The dynamic Neon rehearsal connection URI does not match the verified branch endpoint.",
    );
  }
  return database.directUrl;
}

async function waitForOperations(
  values: unknown[],
  config: NeonDeploymentConfig,
  identity: RehearsalIdentity,
  apiKey: string,
  runtime: ResolvedDependencies,
): Promise<void> {
  const operationIds = new Set<string>();
  for (const value of values) {
    const operation = requiredRecord(value, "Neon operation");
    const operationId = assertOperationIdentity(operation, config, identity);
    operationIds.add(operationId);
  }

  for (const operationId of operationIds) {
    const deadline = runtime.now() + runtime.operationTimeoutMs;
    while (true) {
      const response = await neonGet(
        `/projects/${encodeURIComponent(config.projectId)}/operations/${encodeURIComponent(operationId)}`,
        apiKey,
        runtime.request,
      );
      const operation = requiredRecord(response.operation, "Neon operation");
      assertOperationIdentity(operation, config, identity, operationId);
      const status = operation.status;
      if (status === "finished") {
        break;
      }
      if (
        status === "error" ||
        status === "cancelled" ||
        status === "skipped"
      ) {
        throw new Error(
          `The Neon rehearsal operation ended with status '${status}'.`,
        );
      }
      if (
        status !== "scheduling" &&
        status !== "running" &&
        status !== "failed" &&
        status !== "cancelling"
      ) {
        throw new Error("The Neon rehearsal operation status is invalid.");
      }
      if (runtime.now() >= deadline) {
        throw new Error("Timed out waiting for the Neon rehearsal operation.");
      }
      await runtime.wait(runtime.operationPollIntervalMs);
    }
  }
}

function assertOperationIdentity(
  operation: JsonRecord,
  config: NeonDeploymentConfig,
  identity: RehearsalIdentity,
  expectedOperationId?: string,
): string {
  const operationId = operation.id;
  if (
    typeof operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      operationId,
    ) ||
    (expectedOperationId !== undefined && operationId !== expectedOperationId) ||
    operation.project_id !== config.projectId ||
    operation.branch_id !== identity.branchId ||
    (operation.endpoint_id !== undefined &&
      operation.endpoint_id !== identity.endpointId)
  ) {
    throw new Error("The Neon rehearsal operation identity is invalid.");
  }
  return operationId;
}

function assertRehearsalBranch(
  branch: JsonRecord,
  config: NeonDeploymentConfig,
  identity: RehearsalIdentity,
  expectedParentLsn: string | undefined,
  requireReady: boolean,
): string | undefined {
  const parentLsn =
    branch.parent_lsn === undefined || branch.parent_lsn === null
      ? undefined
      : requiredLsn(branch.parent_lsn);
  if (
    branch.id !== identity.branchId ||
    branch.project_id !== config.projectId ||
    branch.parent_id !== identity.parentBranchId ||
    (expectedParentLsn !== undefined && parentLsn !== expectedParentLsn) ||
    branch.name !== identity.branchName ||
    branch.default !== false ||
    branch.protected !== false ||
    branch.init_source !== "parent-data" ||
    (requireReady && branch.current_state !== "ready") ||
    (!requireReady &&
      branch.current_state !== "init" &&
      branch.current_state !== "ready") ||
    (requireReady && parentLsn === undefined) ||
    (requireReady &&
      branch.pending_state !== undefined &&
      branch.pending_state !== null &&
      branch.pending_state !== "ready")
  ) {
    throw new Error("The Neon rehearsal branch identity or state is invalid.");
  }
  return parentLsn;
}

function assertEndpointIdentity(
  endpoint: JsonRecord,
  config: NeonDeploymentConfig,
  branchId: string,
  expected: EndpointIdentity | undefined,
  requireReady: boolean,
): EndpointIdentity {
  const id = requiredIdentifier(
    endpoint.id,
    ENDPOINT_ID_PATTERN,
    "Neon rehearsal endpoint ID",
  );
  const host = endpoint.host;
  if (
    typeof host !== "string" ||
    !host ||
    /[\r\n\0]/u.test(host) ||
    endpoint.project_id !== config.projectId ||
    endpoint.branch_id !== branchId ||
    endpoint.region_id !== config.regionId ||
    endpoint.type !== "read_write" ||
    endpoint.disabled !== false ||
    (endpoint.current_state !== "init" &&
      endpoint.current_state !== "active" &&
      endpoint.current_state !== "idle") ||
    (expected !== undefined &&
      (id !== expected.id || host.toLowerCase() !== expected.host.toLowerCase())) ||
    (requireReady &&
      endpoint.current_state !== "active" &&
      endpoint.current_state !== "idle")
  ) {
    throw new Error("The Neon rehearsal endpoint identity or state is invalid.");
  }
  return { id, host };
}

async function listActiveBranches(
  projectId: string,
  apiKey: string,
  request: NeonRequest,
): Promise<JsonRecord[]> {
  const branches: JsonRecord[] = [];
  const branchIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_BRANCH_LIST_PAGES; page += 1) {
    const search = new URLSearchParams({
      limit: String(BRANCH_LIST_LIMIT),
      sort_by: "created_at",
      sort_order: "asc",
      include_deleted: "false",
    });
    if (cursor !== undefined) {
      search.set("cursor", cursor);
    }
    const response = await neonGet(
      `/projects/${encodeURIComponent(projectId)}/branches?${search.toString()}`,
      apiKey,
      request,
    );
    if (!Array.isArray(response.branches)) {
      throw new Error("The Neon branches list response is invalid.");
    }
    for (const value of response.branches) {
      const branch = requiredRecord(value, "Neon branch list item");
      const branchId = requiredIdentifier(
        branch.id,
        BRANCH_ID_PATTERN,
        "Neon branch list item ID",
      );
      if (branch.project_id !== projectId || branchIds.has(branchId)) {
        throw new Error("The Neon branches list identity is invalid.");
      }
      branchIds.add(branchId);
      branches.push(branch);
    }
    const pagination = response.pagination;
    if (pagination === undefined) {
      return branches;
    }
    const paginationRecord = requiredRecord(
      pagination,
      "Neon branches pagination",
    );
    const next = paginationRecord.next;
    if (next === undefined) {
      return branches;
    }
    if (
      typeof next !== "string" ||
      !next ||
      /[\r\n\0]/u.test(next) ||
      cursors.has(next)
    ) {
      throw new Error("The Neon branches pagination cursor is invalid.");
    }
    cursors.add(next);
    cursor = next;
  }
  throw new Error("The Neon branches list exceeded the pagination limit.");
}

async function tryListActiveBranches(
  projectId: string,
  apiKey: string,
  request: NeonRequest,
): Promise<JsonRecord[] | undefined> {
  try {
    return await listActiveBranches(projectId, apiKey, request);
  } catch {
    return undefined;
  }
}

async function neonGet(
  path: string,
  apiKey: string,
  request: NeonRequest,
): Promise<JsonRecord> {
  const response = await neonRequest(path, "GET", apiKey, request);
  return readJson(response, "GET", new URL(response.url || `${NEON_API_ORIGIN}${NEON_API_PREFIX}${path}`).pathname);
}

async function neonMutationJson(
  path: string,
  method: "POST",
  apiKey: string,
  request: NeonRequest,
  body: JsonRecord,
): Promise<JsonRecord> {
  const response = await neonRequest(path, method, apiKey, request, body);
  if (response.status !== 201) {
    await response.arrayBuffer().catch(() => undefined);
    throw new NeonMutationAmbiguousError(method, new URL(response.url || `${NEON_API_ORIGIN}${NEON_API_PREFIX}${path}`).pathname);
  }
  return readMutationJson(
    response,
    method,
    new URL(response.url || `${NEON_API_ORIGIN}${NEON_API_PREFIX}${path}`).pathname,
  );
}

async function neonRequest(
  path: string,
  method: "GET" | "POST" | "DELETE",
  apiKey: string,
  request: NeonRequest,
  body?: JsonRecord,
): Promise<Response> {
  const url = new URL(`${NEON_API_PREFIX}${path}`, NEON_API_ORIGIN);
  let response: Response;
  try {
    response = await request(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    if (method === "POST" || method === "DELETE") {
      throw new NeonMutationAmbiguousError(method, url.pathname);
    }
    throw new Error(`Neon API GET ${url.pathname} failed before a response.`);
  }
  if (!response.ok) {
    await response.arrayBuffer().catch(() => undefined);
    throw new Error(
      `Neon API ${method} ${url.pathname} returned HTTP ${response.status}.`,
    );
  }
  return response;
}

async function readMutationJson(
  response: Response,
  method: "POST" | "DELETE",
  path: string,
): Promise<JsonRecord> {
  try {
    return await readJson(response, method, path);
  } catch {
    throw new NeonMutationAmbiguousError(method, path);
  }
}

async function readJson(
  response: Response,
  method: "GET" | "POST" | "DELETE",
  path: string,
): Promise<JsonRecord> {
  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new Error(`Neon API ${method} ${path} returned invalid JSON.`);
  }
  if (!isRecord(value)) {
    throw new Error(`Neon API ${method} ${path} returned an invalid object.`);
  }
  return value;
}

function connectionPath(
  config: NeonDeploymentConfig,
  branchId: string,
  endpointId: string,
  pooled: boolean,
): string {
  const search = new URLSearchParams({
    branch_id: branchId,
    endpoint_id: endpointId,
    database_name: config.databaseName,
    role_name: config.roleName,
    pooled: String(pooled),
  });
  return `/projects/${encodeURIComponent(config.projectId)}/connection_uri?${search.toString()}`;
}

function branchPath(projectId: string, branchId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`;
}

function endpointPath(projectId: string, endpointId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`;
}

function createUniqueBranchName(
  timestamp: number,
  randomId: () => string,
): string {
  if (!Number.isFinite(timestamp)) {
    throw new Error("The Neon rehearsal timestamp is invalid.");
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    throw new Error("The Neon rehearsal timestamp is invalid.");
  }
  const suffix = randomId().toLowerCase().replaceAll(/[^a-z0-9]/gu, "").slice(0, 12);
  if (suffix.length < 8) {
    throw new Error("The Neon rehearsal random identifier is invalid.");
  }
  const compactTimestamp = date
    .toISOString()
    .replaceAll(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
  return `${REHEARSAL_BRANCH_PREFIX}${compactTimestamp}-${suffix}`;
}

function assertRehearsalHandle(
  config: NeonDeploymentConfig,
  rehearsal: NeonRehearsal,
): void {
  if (
    !BRANCH_ID_PATTERN.test(rehearsal.branchId) ||
    !ENDPOINT_ID_PATTERN.test(rehearsal.endpointId) ||
    rehearsal.parentBranchId !== config.branchId ||
    !LSN_PATTERN.test(rehearsal.parentLsn) ||
    !rehearsal.branchName.startsWith(REHEARSAL_BRANCH_PREFIX) ||
    rehearsal.branchName.length > 256 ||
    /[\r\n\0]/u.test(rehearsal.branchName)
  ) {
    throw new Error("The Neon rehearsal handle is invalid.");
  }
}

function assertInputs(config: NeonDeploymentConfig, apiKey: string): void {
  if (
    !PROJECT_ID_PATTERN.test(config.projectId) ||
    !BRANCH_ID_PATTERN.test(config.branchId)
  ) {
    throw new Error("The stored Neon rehearsal identifiers are invalid.");
  }
  for (const value of [config.projectName, config.databaseName, config.roleName]) {
    if (!value || value.length > 128 || /[\r\n\0]/u.test(value)) {
      throw new Error("The stored Neon rehearsal names are invalid.");
    }
  }
  if (
    config.regionId !== "aws-ap-southeast-1" ||
    config.expectedPlan !== "free"
  ) {
    throw new Error("The stored Neon rehearsal policy is unsupported.");
  }
  if (!apiKey || /[\r\n\0]/u.test(apiKey)) {
    throw new Error("The Neon API credential is invalid.");
  }
}

function resolveDependencies(
  dependencies: NeonRehearsalDependencies,
): ResolvedDependencies {
  const operationPollIntervalMs =
    dependencies.operationPollIntervalMs ?? DEFAULT_OPERATION_POLL_INTERVAL_MS;
  const operationTimeoutMs =
    dependencies.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(operationPollIntervalMs) ||
    operationPollIntervalMs <= 0 ||
    !Number.isSafeInteger(operationTimeoutMs) ||
    operationTimeoutMs <= 0
  ) {
    throw new Error("The Neon rehearsal polling configuration is invalid.");
  }
  return {
    request: dependencies.request ?? globalThis.fetch,
    wait:
      dependencies.wait ??
      ((delayMs) =>
        new Promise((resolve) => {
          setTimeout(resolve, delayMs);
        })),
    now: dependencies.now ?? Date.now,
    operationPollIntervalMs,
    operationTimeoutMs,
  };
}

function requiredIdentifier(
  value: unknown,
  pattern: RegExp,
  description: string,
): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${description} is invalid.`);
  }
  return value;
}

function requiredLsn(value: unknown): string {
  if (typeof value !== "string" || !LSN_PATTERN.test(value)) {
    throw new Error("The Neon rehearsal parent LSN is invalid.");
  }
  return value;
}

function requiredRecord(value: unknown, description: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${description} response is invalid.`);
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
