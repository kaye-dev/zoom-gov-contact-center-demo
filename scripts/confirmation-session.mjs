#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const stateRelativePath = ".codex/confirmation-session.local.json";
const tokenHeader = "x-confirmation-session-token";
const reservedSlugs = new Set(["tmp", "reviews"]);
const surfaces = new Set(["prototype", "review"]);
const stateKeys = [
  "schemaVersion",
  "sessionId",
  "checkout",
  "gitCommonDirectory",
  "slug",
  "createdAt",
  "artifactServers",
  "appRuntime",
];
const artifactKeys = ["surface", "artifactRealpath", "url", "pid", "processToken", "startedAt"];
const appKeys = [
  "kind",
  "runtimeId",
  "runtimeSessionId",
  "owner",
  "composeProject",
  "containerId",
  "checkoutMount",
  "url",
  "commit",
];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label, { optional = [] } = {}) {
  ensure(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const allowed = new Set([...expected, ...optional]);
  for (const key of Object.keys(value)) ensure(allowed.has(key), `${label} contains an unknown field: ${key}`);
  for (const key of expected) ensure(Object.hasOwn(value, key), `${label} is missing ${key}`);
}

function nonEmptyString(value, label) {
  ensure(typeof value === "string" && value.length > 0 && !/[\r\n]/u.test(value), `${label} must be a non-empty single-line string`);
  return value;
}

function assertNoDuplicateObjectKeys(text) {
  let index = 0;
  const whitespace = /\s/u;
  const skipWhitespace = () => {
    while (index < text.length && whitespace.test(text[index])) index += 1;
  };
  const parseString = () => {
    ensure(text[index] === '"', "confirmation state contains invalid JSON");
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    throw new Error("confirmation state contains an unterminated string");
  };
  const parseValue = () => {
    skipWhitespace();
    if (text[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        const key = parseString();
        ensure(!keys.has(key), `confirmation state contains a duplicate field: ${key}`);
        keys.add(key);
        skipWhitespace();
        ensure(text[index] === ":", "confirmation state contains invalid JSON");
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        ensure(text[index] === ",", "confirmation state contains invalid JSON");
        index += 1;
      }
      throw new Error("confirmation state contains an unterminated object");
    }
    if (text[index] === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        ensure(text[index] === ",", "confirmation state contains invalid JSON");
        index += 1;
      }
      throw new Error("confirmation state contains an unterminated array");
    }
    if (text[index] === '"') {
      parseString();
      return;
    }
    const primitive = text.slice(index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u)?.[0];
    ensure(primitive, "confirmation state contains invalid JSON");
    index += primitive.length;
  };
  parseValue();
  skipWhitespace();
  ensure(index === text.length, "confirmation state contains trailing JSON data");
}

function timestamp(value, label) {
  nonEmptyString(value, label);
  ensure(!Number.isNaN(Date.parse(value)), `${label} must be an ISO-compatible timestamp`);
  return value;
}

function uuid(value, label) {
  nonEmptyString(value, label);
  ensure(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value), `${label} must be a UUID`);
  return value;
}

export function validateSlug(slug) {
  ensure(typeof slug === "string" && /^[a-z0-9][a-z0-9-]*$/u.test(slug) && !reservedSlugs.has(slug), "Slug must contain only lowercase letters, digits, and hyphens, and must not be reserved.");
  return slug;
}

function validateLoopbackUrl(value, label, { app = false } = {}) {
  let parsed;
  try {
    parsed = new URL(nonEmptyString(value, label));
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  ensure(parsed.username === "" && parsed.password === "" && parsed.search === "" && parsed.hash === "", `${label} must not contain credentials, query, or fragment`);
  if (app) {
    ensure(parsed.protocol === "http:" && parsed.hostname === "localhost", `${label} must use http://localhost`);
    const port = Number(parsed.port || "80");
    ensure(port === 3000 || (port >= 3100 && port <= 3899), `${label} uses an unavailable app port`);
  } else {
    ensure(parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" && parsed.port !== "", `${label} must use an explicit 127.0.0.1 port`);
  }
  return parsed.toString();
}

function validateArtifactIdentity(value, surface) {
  exactKeys(value, artifactKeys, `artifactServers.${surface}`);
  ensure(value.surface === surface, `artifactServers.${surface}.surface must be ${surface}`);
  nonEmptyString(value.artifactRealpath, `artifactServers.${surface}.artifactRealpath`);
  validateLoopbackUrl(value.url, `artifactServers.${surface}.url`);
  ensure(Number.isSafeInteger(value.pid) && value.pid > 1, `artifactServers.${surface}.pid must be a positive process ID`);
  uuid(value.processToken, `artifactServers.${surface}.processToken`);
  timestamp(value.startedAt, `artifactServers.${surface}.startedAt`);
}

function validateAppRuntime(value) {
  exactKeys(value, appKeys, "appRuntime");
  ensure(["local-native", "local-compose", "worktree-compose"].includes(value.kind), "appRuntime.kind is invalid");
  nonEmptyString(value.runtimeId, "appRuntime.runtimeId");
  nonEmptyString(value.runtimeSessionId, "appRuntime.runtimeSessionId");
  ensure(["agent-owned", "reused-user-owned"].includes(value.owner), "appRuntime.owner is invalid");
  nonEmptyString(value.composeProject, "appRuntime.composeProject");
  nonEmptyString(value.containerId, "appRuntime.containerId");
  nonEmptyString(value.checkoutMount, "appRuntime.checkoutMount");
  validateLoopbackUrl(value.url, "appRuntime.url", { app: true });
  ensure(/^[0-9a-f]{40}$/u.test(value.commit), "appRuntime.commit must be a full Git SHA");
  if (value.owner === "agent-owned") ensure(value.kind === "worktree-compose", "only a worktree Compose runtime can be agent-owned");
}

export function validateConfirmationState(value, identity) {
  exactKeys(value, stateKeys);
  ensure(value.schemaVersion === 1, "confirmation state schemaVersion must be 1");
  uuid(value.sessionId, "sessionId");
  ensure(value.checkout === identity.checkout, "confirmation state checkout does not match the current checkout");
  ensure(value.gitCommonDirectory === identity.gitCommonDirectory, "confirmation state Git common directory does not match the current checkout");
  validateSlug(value.slug);
  timestamp(value.createdAt, "createdAt");
  exactKeys(value.artifactServers, [], "artifactServers", { optional: ["prototype", "review"] });
  for (const surface of surfaces) {
    if (Object.hasOwn(value.artifactServers, surface)) validateArtifactIdentity(value.artifactServers[surface], surface);
  }
  if (value.appRuntime !== null) validateAppRuntime(value.appRuntime);
  return value;
}

async function resolveGitCommonDirectory(repositoryRoot) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return realpath(stdout.trim());
}

export async function resolveConfirmationIdentity(repositoryRoot = defaultRepositoryRoot) {
  const checkout = await realpath(repositoryRoot);
  const gitCommonDirectory = await resolveGitCommonDirectory(checkout);
  return {
    checkout,
    gitCommonDirectory,
    statePath: path.join(checkout, stateRelativePath),
  };
}

async function ensureStateDirectory(identity) {
  const directory = path.dirname(identity.statePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  ensure(metadata.isDirectory() && !metadata.isSymbolicLink(), ".codex must be a real directory, not a symlink");
  ensure((await realpath(directory)) === directory, ".codex must not traverse symlinks");
}

async function stateMetadata(statePath) {
  try {
    return await lstat(statePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function readConfirmationState(repositoryRoot = defaultRepositoryRoot, { required = false } = {}) {
  const identity = await resolveConfirmationIdentity(repositoryRoot);
  const metadata = await stateMetadata(identity.statePath);
  if (!metadata) {
    if (required) throw new Error(`No confirmation session exists: ${stateRelativePath}`);
    return { identity, state: null };
  }
  ensure(metadata.isFile() && !metadata.isSymbolicLink(), "confirmation state must be a regular file, not a symlink");
  ensure((metadata.mode & 0o777) === 0o600, "confirmation state mode must be 0600");
  ensure((await realpath(identity.statePath)) === identity.statePath, "confirmation state must not traverse symlinks");
  let value;
  try {
    const text = await readFile(identity.statePath, "utf8");
    assertNoDuplicateObjectKeys(text);
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`confirmation state is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { identity, state: validateConfirmationState(value, identity) };
}

async function writeConfirmationState(identity, state) {
  validateConfirmationState(state, identity);
  await ensureStateDirectory(identity);
  const temporaryPath = `${identity.statePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, identity.statePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function createState(identity, slug) {
  return {
    schemaVersion: 1,
    sessionId: randomUUID(),
    checkout: identity.checkout,
    gitCommonDirectory: identity.gitCommonDirectory,
    slug,
    createdAt: new Date().toISOString(),
    artifactServers: {},
    appRuntime: null,
  };
}

function assertRequestedSlug(state, slug) {
  if (state.slug !== slug) {
    throw new Error(`Confirmation session for '${state.slug}' is already active. Stop it first with ./dev-confirmation.sh stop ${state.slug}`);
  }
}

async function requireArtifactDirectory(identity, slug, surface) {
  const requested = path.join(identity.checkout, "plans", slug, surface);
  const root = await realpath(requested).catch((error) => {
    throw new Error(`${surface} artifact is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  });
  ensure(root === requested, `${surface} artifact directory must be real and must not be a symlink`);
  const metadata = await stat(root);
  ensure(metadata.isDirectory(), `${surface} artifact root must be a directory`);
  const indexPath = path.join(root, "index.html");
  const indexMetadata = await lstat(indexPath);
  ensure(indexMetadata.isFile() && !indexMetadata.isSymbolicLink() && (await realpath(indexPath)) === indexPath, `${surface} artifact index.html must be a regular file`);
  return root;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probeArtifact(identity, artifact) {
  ensure(processIsAlive(artifact.pid), `${artifact.surface} process ${artifact.pid} is not running`);
  const expectedRoot = path.join(identity.checkout, "plans", identity.slug ?? "", artifact.surface);
  if (identity.slug) ensure(artifact.artifactRealpath === expectedRoot, `${artifact.surface} artifact path does not match the session slug`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(artifact.url, {
      method: "HEAD",
      headers: { Host: new URL(artifact.url).host },
      redirect: "error",
      signal: controller.signal,
    });
    ensure(response.ok, `${artifact.surface} server did not return a successful response`);
    ensure(response.headers.get(tokenHeader) === artifact.processToken, `${artifact.surface} server token does not match the confirmation session`);
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForStartup(child, surface) {
  let stdout = "";
  let stderr = "";
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`${surface} server startup timed out`)), 7000);
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout?.removeAllListeners();
      child.stderr?.removeAllListeners();
      if (error) reject(error);
      else resolve(result);
    };
    const inspect = () => {
      const url = stdout.match(/^URL=(.+)$/mu)?.[1];
      const pid = stdout.match(/^PID=(\d+)$/mu)?.[1];
      if (url && pid) finish(null, { url, pid: Number(pid) });
    };
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      inspect();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => finish(new Error(`${surface} server exited before startup (code=${code ?? "none"}, signal=${signal ?? "none"}): ${stderr.trim()}`)));
  });
}

async function startArtifactProcess(identity, slug, surface, artifactRealpath) {
  const processToken = randomUUID();
  const child = spawn(process.execPath, [path.join(identity.checkout, "scripts/serve-plan-artifact.mjs"), `plans/${slug}/${surface}`], {
    cwd: identity.checkout,
    detached: true,
    env: { ...process.env, PLAN_ARTIFACT_SESSION_TOKEN: processToken },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const startup = await waitForStartup(child, surface);
    ensure(startup.pid === child.pid, `${surface} server reported an unexpected PID`);
    const artifact = {
      surface,
      artifactRealpath,
      url: validateLoopbackUrl(startup.url, `${surface} startup URL`),
      pid: startup.pid,
      processToken,
      startedAt: new Date().toISOString(),
    };
    await probeArtifact({ ...identity, slug }, artifact);
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
    return artifact;
  } catch (error) {
    if (child.pid && processIsAlive(child.pid)) process.kill(child.pid, "SIGTERM");
    throw error;
  }
}

function outputState(state) {
  const prototype = state.artifactServers.prototype;
  const review = state.artifactServers.review;
  const app = state.appRuntime;
  return [
    `CONFIRMATION_SESSION_ID=${state.sessionId}`,
    `CONFIRMATION_SLUG=${state.slug}`,
    `CONFIRMATION_CHECKOUT=${state.checkout}`,
    `PROTOTYPE_URL=${prototype?.url ?? "none"}`,
    `PROTOTYPE_PID=${prototype?.pid ?? "none"}`,
    `REVIEW_URL=${review?.url ?? "none"}`,
    `REVIEW_PID=${review?.pid ?? "none"}`,
    `APP_URL=${app?.url ?? "none"}`,
    `APP_OWNER=${app?.owner ?? "none"}`,
    `APP_RUNTIME_ID=${app?.runtimeId ?? "none"}`,
    `STOP_COMMAND=./dev-confirmation.sh stop ${state.slug}`,
  ].join("\n");
}

export async function startArtifact({ repositoryRoot = defaultRepositoryRoot, slug, surface }) {
  validateSlug(slug);
  ensure(surfaces.has(surface), "surface must be prototype or review");
  const { identity, state: existing } = await readConfirmationState(repositoryRoot);
  const artifactRealpath = await requireArtifactDirectory(identity, slug, surface);
  const state = existing ?? createState(identity, slug);
  assertRequestedSlug(state, slug);
  await ensureStateDirectory(identity);
  const current = state.artifactServers[surface];
  if (current) {
    ensure(current.artifactRealpath === artifactRealpath, `${surface} artifact path changed after the session started`);
    await probeArtifact({ ...identity, slug }, current);
    return state;
  }
  const artifact = await startArtifactProcess(identity, slug, surface, artifactRealpath);
  state.artifactServers[surface] = artifact;
  try {
    await writeConfirmationState(identity, state);
  } catch (error) {
    if (processIsAlive(artifact.pid)) process.kill(artifact.pid, "SIGTERM");
    throw error;
  }
  return state;
}

function parseKeyValues(output) {
  const result = {};
  for (const line of output.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

async function composeStatus(identity) {
  const composeScript = path.join(identity.checkout, "dev-compose.sh");
  const statusResult = await execFileAsync(composeScript, ["status"], { cwd: identity.checkout, encoding: "utf8" });
  const values = parseKeyValues(statusResult.stdout);
  ensure(values.ACTIVE_RUNTIME_HEALTH === "healthy" && values.RUNTIME_OWNERSHIP === "verified", "app runtime is not healthy and ownership-verified");
  ensure(values.RUNTIME_CHECKOUT_PATH === identity.checkout, "app runtime checkout does not match the confirmation checkout");
  const urlResult = await execFileAsync(composeScript, ["status", "--url"], { cwd: identity.checkout, encoding: "utf8" });
  const url = validateLoopbackUrl(urlResult.stdout.trim(), "app runtime URL", { app: true });
  return { values, url };
}

async function runtimeSessionOwnsContainer(identity, values) {
  if (values.RUNTIME_MODE !== "worktree" || values.ACTIVE_RUNTIME_KIND !== "compose") return false;
  const sessionPath = path.join(identity.checkout, ".codex/runtime-session.local.json");
  let metadata;
  try {
    metadata = await lstat(sessionPath);
  } catch {
    return false;
  }
  ensure(metadata.isFile() && !metadata.isSymbolicLink() && (metadata.mode & 0o777) === 0o600, "runtime session state is not a safe 0600 regular file");
  const session = JSON.parse(await readFile(sessionPath, "utf8"));
  return session.schemaVersion === 1
    && session.sessionId === values.CODEX_RUNTIME_SESSION_ID
    && session.runtimeId === values.RUNTIME_ID
    && session.checkout === identity.checkout
    && session.composeProject === values.COMPOSE_PROJECT_NAME
    && Array.isArray(session.createdContainerIds)
    && session.createdContainerIds.includes(values.ACTIVE_RUNTIME_IDENTIFIER);
}

export async function attachApp({ repositoryRoot = defaultRepositoryRoot, slug }) {
  validateSlug(slug);
  const { identity, state } = await readConfirmationState(repositoryRoot, { required: true });
  assertRequestedSlug(state, slug);
  const { values, url } = await composeStatus(identity);
  const agentOwned = await runtimeSessionOwnsContainer(identity, values);
  const kind = values.RUNTIME_MODE === "worktree" ? "worktree-compose" : values.ACTIVE_RUNTIME_KIND === "compose" ? "local-compose" : "local-native";
  const commit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: identity.checkout, encoding: "utf8" })).stdout.trim();
  const appRuntime = {
    kind,
    runtimeId: nonEmptyString(values.RUNTIME_ID, "RUNTIME_ID"),
    runtimeSessionId: nonEmptyString(values.CODEX_RUNTIME_SESSION_ID, "CODEX_RUNTIME_SESSION_ID"),
    owner: agentOwned ? "agent-owned" : "reused-user-owned",
    composeProject: nonEmptyString(values.COMPOSE_PROJECT_NAME, "COMPOSE_PROJECT_NAME"),
    containerId: values.ACTIVE_RUNTIME_KIND === "compose" ? nonEmptyString(values.ACTIVE_RUNTIME_IDENTIFIER, "ACTIVE_RUNTIME_IDENTIFIER") : "none",
    checkoutMount: nonEmptyString(values.ACTIVE_RUNTIME_MOUNT, "ACTIVE_RUNTIME_MOUNT"),
    url,
    commit,
  };
  validateAppRuntime(appRuntime);
  state.appRuntime = appRuntime;
  await writeConfirmationState(identity, state);
  return state;
}

export async function statusSession({ repositoryRoot = defaultRepositoryRoot, slug }) {
  validateSlug(slug);
  const { identity, state } = await readConfirmationState(repositoryRoot, { required: true });
  assertRequestedSlug(state, slug);
  for (const surface of surfaces) {
    if (state.artifactServers[surface]) await probeArtifact({ ...identity, slug }, state.artifactServers[surface]);
  }
  if (state.appRuntime) {
    const { values, url } = await composeStatus(identity);
    ensure(url === state.appRuntime.url, "attached app URL no longer matches the verified runtime");
    ensure(values.RUNTIME_ID === state.appRuntime.runtimeId && values.CODEX_RUNTIME_SESSION_ID === state.appRuntime.runtimeSessionId, "attached app runtime identity is stale");
  }
  return state;
}

async function stopArtifact(identity, state, surface) {
  const artifact = state.artifactServers[surface];
  if (!artifact) return;
  await probeArtifact({ ...identity, slug: state.slug }, artifact);
  process.kill(artifact.pid, "SIGTERM");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!processIsAlive(artifact.pid)) {
      delete state.artifactServers[surface];
      await writeConfirmationState(identity, state);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${surface} process ${artifact.pid} did not stop after SIGTERM`);
}

async function stopOwnedApp(identity, state) {
  const app = state.appRuntime;
  if (!app || app.owner !== "agent-owned") return app ? "preserved" : "none";
  ensure(app.kind === "worktree-compose", "only an agent-owned worktree Compose runtime can be cleaned up");
  await execFileAsync(path.join(identity.checkout, "dev-compose.sh"), ["cleanup"], {
    cwd: identity.checkout,
    encoding: "utf8",
    env: { ...process.env, CODEX_CONFIRMATION_STOP_SESSION_ID: state.sessionId },
  });
  state.appRuntime = null;
  await writeConfirmationState(identity, state);
  return "removed";
}

export async function stopSession({ repositoryRoot = defaultRepositoryRoot, slug }) {
  validateSlug(slug);
  const { identity, state } = await readConfirmationState(repositoryRoot, { required: true });
  assertRequestedSlug(state, slug);
  await stopArtifact(identity, state, "prototype");
  await stopArtifact(identity, state, "review");
  const appResult = await stopOwnedApp(identity, state);
  await rm(identity.statePath);
  return { state, appResult };
}

export async function inspectCleanupPolicy({ repositoryRoot = defaultRepositoryRoot, runtimeSessionId, runtimeId, composeProject, stopSessionId = process.env.CODEX_CONFIRMATION_STOP_SESSION_ID ?? "" }) {
  const { state } = await readConfirmationState(repositoryRoot);
  if (!state?.appRuntime || state.appRuntime.owner !== "agent-owned") return { action: "allow", state };
  const app = state.appRuntime;
  ensure(app.kind === "worktree-compose", "active agent-owned app must be a worktree Compose runtime");
  ensure(app.runtimeSessionId === runtimeSessionId && app.runtimeId === runtimeId && app.composeProject === composeProject, "active confirmation app does not match the current runtime cleanup identity");
  if (stopSessionId === "") return { action: "skip", state };
  ensure(stopSessionId === state.sessionId, "confirmation stop session ID does not match the active confirmation session");
  return { action: "allow", state };
}

function usage() {
  return [
    "Usage:",
    "  ./dev-confirmation.sh start <slug> <prototype|review>",
    "  ./dev-confirmation.sh attach-app <slug>",
    "  ./dev-confirmation.sh status <slug>",
    "  ./dev-confirmation.sh stop <slug>",
  ].join("\n");
}

async function main(args) {
  const [command, slug, surface, ...rest] = args;
  if (command === "start" && slug && surface && rest.length === 0) {
    console.log(outputState(await startArtifact({ slug, surface })));
    return;
  }
  if (command === "attach-app" && slug && surface === undefined && rest.length === 0) {
    console.log(outputState(await attachApp({ slug })));
    return;
  }
  if (command === "status" && slug && surface === undefined && rest.length === 0) {
    console.log(outputState(await statusSession({ slug })));
    return;
  }
  if (command === "stop" && slug && surface === undefined && rest.length === 0) {
    const result = await stopSession({ slug });
    console.log(`CONFIRMATION_SLUG=${slug}`);
    console.log(`APP_STOP_RESULT=${result.appResult}`);
    console.log("CONFIRMATION_STATE=removed");
    return;
  }
  if (command === "runtime-cleanup-policy" && slug && surface) {
    const [composeProject, ...unexpected] = rest;
    ensure(composeProject && unexpected.length === 0, "runtime-cleanup-policy requires runtime session ID, runtime ID, and Compose project");
    const result = await inspectCleanupPolicy({ runtimeSessionId: slug, runtimeId: surface, composeProject });
    if (result.action === "skip") {
      console.log(`ACTIVE_CONFIRMATION_SESSION_ID=${result.state.sessionId}`);
      console.log(`ACTIVE_CONFIRMATION_SLUG=${result.state.slug}`);
      console.log(`STOP_COMMAND=./dev-confirmation.sh stop ${result.state.slug}`);
      process.exitCode = 10;
    }
    return;
  }
  if (command === "-h" || command === "--help") {
    console.log(usage());
    return;
  }
  throw new Error(usage());
}

let invokedDirectly = false;
try {
  invokedDirectly = realpathSync(path.resolve(process.argv[1] ?? "")) === realpathSync(scriptPath);
} catch {
  invokedDirectly = false;
}

if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
