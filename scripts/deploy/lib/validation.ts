import { readFileSync } from "node:fs";

export type DatabaseTarget = {
  pooledUrl: string;
  directUrl: string;
  endpointId: string;
  database: string;
  username: string;
  pooledHost: string;
  directHost: string;
  regionSlug: string;
};

export type VercelLink = {
  orgId: string;
  projectId: string;
};

export type DeploymentCommandOutput = {
  id?: string;
  url: URL;
};

export type VercelProjectApi = {
  id: string;
  accountId: string;
  name: string;
  autoExposeSystemEnvs: true;
  gitLink: null;
};

export type NeonProject = {
  id: string;
  name: string;
  regionId: string;
  orgId: string;
};

const NEON_DIRECT_HOST_PATTERN =
  /^(ep-[a-z0-9-]+)\.(?:(c-[1-9][0-9]*)\.)?([a-z0-9-]+)\.aws\.neon\.tech$/i;
const NEON_POOLED_HOST_PATTERN =
  /^(ep-[a-z0-9-]+)-pooler\.(?:(c-[1-9][0-9]*)\.)?([a-z0-9-]+)\.aws\.neon\.tech$/i;
const FORBIDDEN_POSTGRES_QUERY_KEYS = new Set([
  "host",
  "hostaddr",
  "port",
  "user",
  "password",
  "dbname",
  "database",
  "service",
  "servicefile",
  "ssl",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "uselibpqcompat",
  "sslnegotiation",
]);

export function validateDatabaseUrls(
  pooledValue: string,
  directValue: string,
): DatabaseTarget {
  const pooled = parsePostgresUrl(pooledValue, "pooled");
  const direct = parsePostgresUrl(directValue, "direct");
  const pooledHostMatch = NEON_POOLED_HOST_PATTERN.exec(pooled.hostname);
  const directHostMatch = NEON_DIRECT_HOST_PATTERN.exec(direct.hostname);

  if (!pooledHostMatch) {
    throw new Error(
      "DATABASE_URL must use a Neon pooled hostname containing '-pooler'.",
    );
  }
  if (!directHostMatch) {
    throw new Error(
      "DATABASE_URL_UNPOOLED must use the matching non-pooler Neon hostname.",
    );
  }

  const pooledEndpoint = pooledHostMatch[1]?.toLowerCase();
  const directEndpoint = directHostMatch[1]?.toLowerCase();
  const pooledProxy = pooledHostMatch[2]?.toLowerCase();
  const directProxy = directHostMatch[2]?.toLowerCase();
  const pooledRegion = pooledHostMatch[3]?.toLowerCase();
  const directRegion = directHostMatch[3]?.toLowerCase();
  if (
    !pooledEndpoint ||
    pooledEndpoint !== directEndpoint ||
    pooledProxy !== directProxy ||
    !pooledRegion ||
    pooledRegion !== directRegion
  ) {
    throw new Error("The pooled and direct URLs do not use the same Neon endpoint.");
  }
  if (pooledRegion !== "ap-southeast-1") {
    throw new Error("The Neon endpoint must be in Singapore (ap-southeast-1). ");
  }

  if (
    pooled.username !== direct.username ||
    pooled.password !== direct.password ||
    decodeURIComponent(pooled.pathname) !== decodeURIComponent(direct.pathname)
  ) {
    throw new Error(
      "The pooled and direct URLs must use the same database, user, and password.",
    );
  }

  return {
    pooledUrl: pooledValue.trim(),
    directUrl: directValue.trim(),
    endpointId: pooledEndpoint,
    database: decodeURIComponent(pooled.pathname.slice(1)),
    username: decodeURIComponent(pooled.username),
    pooledHost: pooled.hostname,
    directHost: direct.hostname,
    regionSlug: pooledRegion,
  };
}

function parsePostgresUrl(value: string, kind: "pooled" | "direct"): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`The ${kind} database URL is not a valid URL.`);
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`The ${kind} database URL must use PostgreSQL.`);
  }
  if (!url.username || !url.password || !url.pathname || url.pathname === "/") {
    throw new Error(
      `The ${kind} database URL must include a user, password, and database.`,
    );
  }
  if (url.port && url.port !== "5432") {
    throw new Error(`The ${kind} database URL may only use port 5432.`);
  }
  if (url.searchParams.get("sslmode") !== "require") {
    throw new Error(`The ${kind} database URL must set sslmode=require.`);
  }
  if (url.searchParams.getAll("sslmode").length !== 1) {
    throw new Error(`The ${kind} database URL must set sslmode exactly once.`);
  }
  const forbiddenQueryKeys = [...url.searchParams.keys()].filter((key) =>
    FORBIDDEN_POSTGRES_QUERY_KEYS.has(key.toLowerCase()),
  );
  if (forbiddenQueryKeys.length > 0) {
    throw new Error(
      `The ${kind} database URL contains a forbidden identity or TLS override query parameter.`,
    );
  }
  if (url.hash) {
    throw new Error(`The ${kind} database URL must not include a fragment.`);
  }
  return url;
}

export function redactDatabaseHost(host: string): string {
  const [first, ...rest] = host.split(".");
  const suffix = rest.join(".");
  const marker = first.endsWith("-pooler") ? "-pooler" : "";
  return `ep-…${marker}.${suffix}`;
}

export function validateCanonicalUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("The canonical Production URL is invalid.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "The canonical Production URL must be an HTTPS origin without credentials, port, path, query, or fragment.",
    );
  }
  return url;
}

export function readVercelLink(path: string): VercelLink {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error(".vercel/project.json is missing or invalid.");
  }

  if (!isRecord(value)) {
    throw new Error(".vercel/project.json must contain an object.");
  }
  const orgId = value.orgId;
  const projectId = value.projectId;
  if (
    typeof orgId !== "string" ||
    !/^team_[A-Za-z0-9]+$/.test(orgId) ||
    typeof projectId !== "string" ||
    !/^prj_[A-Za-z0-9]+$/.test(projectId)
  ) {
    throw new Error("The Vercel link does not contain valid orgId/projectId values.");
  }
  return { orgId, projectId };
}

export function parseVercelProjectApi(
  output: string,
  link: VercelLink,
): VercelProjectApi {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new Error("Vercel project API did not return valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new Error("Vercel project API response is not an object.");
  }
  if (parsed.id !== link.projectId || parsed.accountId !== link.orgId) {
    throw new Error(
      "The Vercel API project/scope does not match .vercel/project.json.",
    );
  }
  if (typeof parsed.name !== "string" || !parsed.name) {
    throw new Error("The Vercel API project name is missing.");
  }
  if (parsed.autoExposeSystemEnvs !== true) {
    throw new Error(
      "Vercel System Environment Variables are disabled or could not be proven enabled. Enable them under Project Settings > Environment Variables.",
    );
  }
  if (parsed.link !== null && parsed.link !== undefined) {
    throw new Error(
      "The Vercel project has a Git integration. Disconnect it before using deploy.sh.",
    );
  }
  return {
    id: parsed.id,
    accountId: parsed.accountId,
    name: parsed.name,
    autoExposeSystemEnvs: true,
    gitLink: null,
  };
}

export function parseNeonProjectApi(
  output: string,
  projectId: string,
  expectedName: string,
): NeonProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new Error("Neon project API did not return valid JSON.");
  }

  if (!isRecord(parsed) || !isRecord(parsed.project)) {
    throw new Error("Neon project API response is missing the project object.");
  }
  const project = parsed.project;

  const id = project.id;
  const name = project.name;
  const regionId = project.region_id ?? project.regionId;
  const orgId = project.org_id ?? project.orgId;
  if (id !== projectId) {
    throw new Error("The Neon API project ID does not match the selected project ID.");
  }
  if (typeof name !== "string" || name !== expectedName) {
    throw new Error("The selected Neon project name does not match the project ID.");
  }
  if (regionId !== "aws-ap-southeast-1") {
    throw new Error(
      "The selected Neon project is not in Singapore (aws-ap-southeast-1).",
    );
  }
  if (typeof orgId !== "string" || !orgId) {
    throw new Error("The selected Neon project organization ID is missing.");
  }
  return { id, name, regionId, orgId };
}

export function assertNeonEndpointMatches(
  output: string,
  target: DatabaseTarget,
  projectId?: string,
): void {
  readNeonEndpointState(output, target, projectId);
}

export function readNeonEndpointState(
  output: string,
  target: DatabaseTarget,
  projectId?: string,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new Error("Neon endpoints list did not return valid JSON.");
  }

  const candidates = collectRecords(parsed);
  const endpoint = candidates.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.id === target.endpointId &&
      candidate.region_id === "aws-ap-southeast-1",
  );
  if (!isRecord(endpoint)) {
    throw new Error(
      `The database URL endpoint '${target.endpointId}' is not in the selected Neon project.`,
    );
  }
  const host = endpoint.host;
  if (
    typeof host !== "string" ||
    host.toLowerCase() !== target.directHost.toLowerCase()
  ) {
    throw new Error("The Neon endpoint host does not match the supplied URLs.");
  }
  if (endpoint.type !== "read_write") {
    throw new Error("The Neon endpoint must be a read_write endpoint.");
  }
  if (
    projectId !== undefined &&
    endpoint.project_id !== projectId
  ) {
    throw new Error("The Neon endpoint does not belong to the selected project.");
  }
  if (typeof endpoint.branch_id !== "string" || !endpoint.branch_id) {
    throw new Error("The Neon endpoint branch ID is missing.");
  }
  if (typeof endpoint.current_state !== "string" || !endpoint.current_state) {
    throw new Error("The Neon endpoint current_state is missing.");
  }
  return endpoint.current_state;
}

function collectRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectRecords);
  }
  if (!isRecord(value)) {
    return [];
  }
  return [value, ...Object.values(value).flatMap(collectRecords)];
}

export function parseVersion(value: string): [number, number, number] {
  const match = /(?:^|\s|v)(\d+)\.(\d+)\.(\d+)(?:\s|$|-)/.exec(value.trim());
  if (!match) {
    throw new Error(`Could not parse CLI version output '${stripAnsi(value).trim()}'.`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function assertMinimumVersion(
  actual: readonly number[],
  minimum: readonly number[],
  name: string,
): void {
  for (let index = 0; index < 3; index += 1) {
    const actualPart = actual[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;
    if (actualPart > minimumPart) {
      return;
    }
    if (actualPart < minimumPart) {
      throw new Error(
        `${name} ${actual.join(".")} is too old; ${minimum.join(".")} or newer is required.`,
      );
    }
  }
}

export function parseDeploymentOutput(output: string): DeploymentCommandOutput {
  const value = stripAnsi(output).trim();
  if (/^https:\/\/[A-Za-z0-9-]+\.vercel\.app\/?$/.test(value)) {
    return { url: parseDeploymentOrigin(value) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(
      "Vercel deploy stdout must contain one URL or the documented JSON deployment result.",
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      "Vercel deploy JSON did not report one READY Production deployment.",
    );
  }
  const deployment =
    "status" in parsed
      ? parsed.status === "ok" &&
        !("error" in parsed) &&
        isRecord(parsed.deployment)
        ? parsed.deployment
        : undefined
      : parsed;
  if (
    !deployment ||
    "error" in deployment ||
    typeof deployment.id !== "string" ||
    !/^dpl_[A-Za-z0-9]+$/.test(deployment.id) ||
    typeof deployment.url !== "string" ||
    deployment.readyState !== "READY" ||
    deployment.target !== "production"
  ) {
    throw new Error(
      "Vercel deploy JSON did not report one READY Production deployment.",
    );
  }
  return {
    id: deployment.id,
    url: parseDeploymentOrigin(deployment.url),
  };
}

export function assertDeploymentOutputMatchesCandidate(
  output: DeploymentCommandOutput,
  candidateId: string,
): void {
  if (output.id !== undefined && output.id !== candidateId) {
    throw new Error(
      "Vercel deploy JSON deployment ID does not match inspect and API evidence.",
    );
  }
}

function parseDeploymentOrigin(value: string): URL {
  if (!/^https:\/\/[A-Za-z0-9-]+\.vercel\.app\/?$/.test(value)) {
    throw new Error("Vercel staged deployment URL is not an HTTPS origin.");
  }
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Vercel staged deployment URL is not an HTTPS origin.");
  }
  return url;
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
