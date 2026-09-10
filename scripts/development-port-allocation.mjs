#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const PORT_POLICY = Object.freeze({ schemaVersion: 1, appBase: 3000, artifactBase: 4000, worktreeSlots: 5 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (value) => createHash("sha256").update(value).digest("hex");
function ensure(value, message) { if (!value) throw new Error(message); }

export function defaultPortStateRoot() {
  if (process.env.DEVELOPMENT_PORT_STATE_ROOT) {
    ensure(process.env.NODE_ENV === "test", "DEVELOPMENT_PORT_STATE_ROOT is a test-only override");
    return path.resolve(process.env.DEVELOPMENT_PORT_STATE_ROOT);
  }
  return path.join(homedir(), ".local/state/zoom-gov-contact-center-demo/development-ports");
}

export async function resolvePortIdentity(checkout = process.cwd()) {
  checkout = await realpath(checkout);
  let gitDirectory;
  let gitCommonDirectory;
  if (process.env.NODE_ENV === "test" && process.env.DEVELOPMENT_PORT_STATE_ROOT && process.env.DEV_RUNTIME_GIT_DIR_OVERRIDE) {
    gitDirectory = await realpath(process.env.DEV_RUNTIME_GIT_DIR_OVERRIDE);
    gitCommonDirectory = await realpath(process.env.DEV_RUNTIME_GIT_COMMON_DIR_OVERRIDE);
  } else {
    const result = await exec("git", ["-C", checkout, "rev-parse", "--show-toplevel", "--absolute-git-dir", "--path-format=absolute", "--git-common-dir"], { timeout: 5000 });
    const [top, git, common] = result.stdout.trim().split("\n");
    ensure(await realpath(top) === checkout, "port allocation requires the checkout root");
    gitDirectory = await realpath(git);
    gitCommonDirectory = await realpath(common);
  }
  const mode = gitDirectory === gitCommonDirectory ? "local" : "worktree";
  return { checkout, gitCommonDirectory, mode, runtimeId: mode === "local" ? "local" : hash(checkout).slice(0, 12), owner: hash(`${gitCommonDirectory}\0${checkout}`) };
}

function validateIdentity(identity) {
  ensure(identity && typeof identity.checkout === "string" && typeof identity.gitCommonDirectory === "string" && path.isAbsolute(identity.checkout) && path.isAbsolute(identity.gitCommonDirectory) &&
    ["local", "worktree"].includes(identity.mode) && typeof identity.runtimeId === "string" &&
    identity.owner === hash(`${identity.gitCommonDirectory}\0${identity.checkout}`), "invalid port owner identity");
}
function validateLease(lease, slot) {
  validateIdentity(lease);
  ensure(lease.schemaVersion === PORT_POLICY.schemaVersion && lease.slot === slot && Number.isInteger(slot) && slot >= 0 && slot <= PORT_POLICY.worktreeSlots &&
    (lease.mode === "local" ? slot === 0 : slot > 0) && lease.appPort === 3000 + slot && lease.artifactPort === 4000 + slot &&
    /^[a-f0-9-]{36}$/u.test(lease.allocationId), `invalid port lease for slot ${slot}; inspect it before any allocation`);
  if (lease.artifact !== null) {
    const value = lease.artifact;
    ensure(value && Number.isInteger(value.pid) && value.pid > 1 && typeof value.processStart === "string" &&
      /^[a-f0-9-]{36}$/u.test(value.processToken) && ["prototype", "review"].includes(value.surface) &&
      /^[a-z0-9][a-z0-9-]*$/u.test(value.slug) && !["tmp", "reviews"].includes(value.slug) &&
      value.artifactRealpath === path.join(lease.checkout, "plans", value.slug, value.surface), "invalid artifact process identity");
  }
  return lease;
}

async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  ensure(metadata.isDirectory() && !metadata.isSymbolicLink() && (metadata.mode & 0o777) === 0o700 && await realpath(directory) === directory,
    `port state must be a real 0700 directory: ${directory}`);
}
async function readPrivateJson(file) {
  let metadata;
  try { metadata = await lstat(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  ensure(metadata.isFile() && !metadata.isSymbolicLink() && (metadata.mode & 0o777) === 0o600 && metadata.size < 65536 && await realpath(file) === file,
    `port state must be a regular 0600 file: ${file}`);
  return JSON.parse(await readFile(file, "utf8"));
}
async function atomicJson(file, value) {
  await readPrivateJson(file);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

export async function processStart(pid) {
  try { return (await exec("ps", ["-p", String(pid), "-o", "lstart="], { timeout: 3000 })).stdout.trim() || null; }
  catch { return null; }
}

export async function assertArtifactStartupAllowed(identity) {
  let lock;
  try { lock = await lstat(path.join(identity.checkout, ".codex/port-migration.lock")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  ensure(!lock, "PORT_MIGRATION_BUSY: finish the port migration before starting an artifact");
  const state = await readPrivateJson(path.join(identity.checkout, ".codex/confirmation-session.local.json"));
  if (!state) return;
  ensure(state.checkout === identity.checkout && state.gitCommonDirectory === identity.gitCommonDirectory, "retained artifact checkout identity mismatch");
  for (const artifact of Object.values(state.artifactServers ?? {})) {
    const port = Number(new URL(artifact.url).port);
    ensure(port >= 4000 && port <= 4005,
      `PORT_MIGRATION_REQUIRED: retained artifact ${artifact.url}; run ./dev-confirmation.sh stop ${state.slug} before starting the new origin`);
  }
}
async function processCheckout(pid) {
  try {
    const result = await exec("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { timeout: 3000 });
    return result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  } catch { return null; }
}
async function bindAvailable(port, host) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else if (error.code === "EAFNOSUPPORT" || error.code === "EADDRNOTAVAIL") resolve(true);
      else reject(error);
    });
    server.listen({ port, host, ipv6Only: true }, () => server.close(() => resolve(true)));
  });
}

// Read running publications without starting Docker. Native listeners are also
// checked with bind on both loopback families; an unavailable daemon is not started.
export async function runningContainers() {
  let containers = [];
  try {
    const ids = (await exec("docker", ["ps", "-q"], { timeout: 5000 })).stdout.trim().split(/\s+/u).filter(Boolean);
    if (ids.length) containers = JSON.parse((await exec("docker", ["inspect", ...ids], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 })).stdout);
  } catch (error) {
    if (!(process.env.NODE_ENV === "test" && process.env.DEVELOPMENT_PORT_TEST_INSPECTION === "stub") && error.code !== "ENOENT" && !/cannot connect|is the docker daemon|connection refused|error during connect/iu.test(error.stderr ?? "")) throw error;
  }
  return containers;
}

export async function assertRuntimeStopped(identity, { allowDatabase = false } = {}) {
  const project = identity.mode === "local" ? "zoom-gov-contact-center-demo" : `zoom-gov-demo-wt-${identity.runtimeId}`;
  const active = (await runningContainers()).filter(c => c.Config?.Labels?.["com.docker.compose.project"] === project &&
    (!allowDatabase || c.Config?.Labels?.["com.docker.compose.service"] === "web"));
  ensure(active.length === 0, `PORT_RUNTIME_IN_USE: ${active.map(c => c.Id).join(",")}; stop the owned services explicitly before releasing/migrating`);
}

export async function inspectPorts(ports, identity) {
  const containers = await runningContainers();
  const results = [];
  for (const port of ports) {
    const publishers = containers.filter((container) => Object.values(container.NetworkSettings?.Ports ?? {}).flatMap((value) => value ?? []).some((entry) => Number(entry.HostPort) === port));
    const ownedContainers = publishers.length > 0 && publishers.every((container) =>
      container.Config?.Labels?.["com.docker.compose.project"] === (identity.mode === "local" ? "zoom-gov-contact-center-demo" : `zoom-gov-demo-wt-${identity.runtimeId}`) &&
      container.Mounts?.some((mount) => mount.Type === "bind" && mount.Source === identity.checkout));
    const free = await bindAvailable(port, "127.0.0.1") && await bindAvailable(port, "::1");
    if (publishers.length) { results.push({ port, free: false, owned: ownedContainers, detail: publishers.map((c) => c.Id).join(",") }); continue; }
    if (free) { results.push({ port, free: true, owned: false, detail: "free" }); continue; }
    let pids = [];
    try { pids = (await exec("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { timeout: 3000 })).stdout.trim().split(/\s+/u).filter(Boolean); } catch { /* unknown owner stays unavailable */ }
    let owned = pids.length > 0;
    for (const pid of pids) {
      const command = (await exec("ps", ["-p", pid, "-o", "command="], { timeout: 3000 })).stdout;
      owned &&= await processCheckout(pid) === identity.checkout && /(?:next-server|next dev|serve-plan-artifact\.mjs|prototype-entry\.mjs)/u.test(command);
    }
    results.push({ port, free: false, owned, detail: `listener PID ${pids.join(",") || "unknown"}` });
  }
  return results;
}

export function createPortAllocator({ stateRoot = defaultPortStateRoot(), inspect = inspectPorts, assertStopped = assertRuntimeStopped, lockTimeoutMs = 5000 } = {}) {
  stateRoot = path.resolve(stateRoot);
  const file = (slot) => path.join(stateRoot, `slot-${slot}.json`);
  async function locked(action) {
    await privateDirectory(stateRoot);
    const lock = path.join(stateRoot, "allocation.lock");
    const deadline = Date.now() + lockTimeoutMs;
    while (true) {
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        ensure(Date.now() < deadline, `PORT_LOCK_BUSY: inspect ${lock}; a lock is never reclaimed by age alone`);
        await sleep(25);
      }
    }
    const token = randomUUID();
    try {
      await writeFile(path.join(lock, "owner.json"), JSON.stringify({ token, pid: process.pid }), { flag: "wx", mode: 0o600 });
      return await action();
    } finally {
      const owner = await readPrivateJson(path.join(lock, "owner.json"));
      if (owner?.token === token) {
        await rm(path.join(lock, "owner.json"));
        await rmdir(lock);
      }
    }
  }
  async function leases() {
    const values = [];
    for (let slot = 0; slot <= PORT_POLICY.worktreeSlots; slot += 1) {
      const lease = await readPrivateJson(file(slot));
      if (lease) values.push(validateLease(lease, slot));
    }
    return values;
  }
  async function ownLease(identity) {
    validateIdentity(identity);
    const matches = (await leases()).filter((lease) => lease.owner === identity.owner);
    ensure(matches.length <= 1, "duplicate port owner reservations");
    return matches[0] ?? null;
  }
  async function allocate(identity) {
    validateIdentity(identity);
    return locked(async () => {
      const all = await leases();
      const existing = all.find((lease) => lease.owner === identity.owner);
      if (existing) {
        const occupied = await inspect([existing.appPort, existing.artifactPort], identity);
        ensure(occupied.every((entry) => entry.free || entry.owned), `PORT_CONFLICT: ${JSON.stringify(occupied)}; inspect the listener; reservation belongs to ${identity.checkout}`);
        return { ...existing, created: false };
      }
      const rejected = [];
      for (const slot of identity.mode === "local" ? [0] : Array.from({ length: PORT_POLICY.worktreeSlots }, (_, i) => i + 1)) {
        const reserved = all.find((lease) => lease.slot === slot);
        if (reserved) { rejected.push(`slot ${slot}: ${reserved.checkout}`); continue; }
        const occupied = await inspect([3000 + slot, 4000 + slot], identity);
        if (occupied.some((entry) => !entry.free && !entry.owned)) { rejected.push(`slot ${slot}: ${JSON.stringify(occupied)}`); continue; }
        const lease = { schemaVersion: 1, ...identity, slot, appPort: 3000 + slot, artifactPort: 4000 + slot, allocationId: randomUUID(), artifact: null };
        await atomicJson(file(slot), lease);
        return { ...lease, created: true };
      }
      throw new Error(`PORT_SLOTS_EXHAUSTED: ${rejected.join("; ")}. Stop only the named owner and explicitly release its reservation with development-port-allocation.mjs release --checkout <checkout> --owner <owner>. No port outside 3000–3005/4000–4005 is used.`);
    });
  }
  async function release(identity, owner, allocationId, { rollback = false } = {}) {
    ensure(owner === identity.owner, "release requires the exact owner from status");
    return locked(async () => {
      const lease = await ownLease(identity);
      if (!lease) return { released: false };
      if (allocationId) ensure(lease.allocationId === allocationId, "allocation changed before release");
      const occupied = await inspect([lease.appPort, lease.artifactPort], identity);
      ensure(occupied.every((entry) => entry.free || (rollback && !entry.owned)), "PORT_IN_USE: stop the owned app/artifact before releasing its reservation");
      if (lease.artifact) ensure(await processStart(lease.artifact.pid) === null, "artifact process still exists; inspect it before release");
      if (!rollback) await assertStopped(identity);
      await rm(file(lease.slot));
      return { released: true };
    });
  }
  async function updateArtifact(identity, allocationId, artifact) {
    return locked(async () => {
      const lease = await ownLease(identity);
      ensure(lease?.allocationId === allocationId, "artifact allocation changed");
      if (lease.artifact) {
        const start = await processStart(lease.artifact.pid);
        ensure(start === null || (artifact?.processToken === lease.artifact.processToken), "artifact process already registered; inspect its owner before replacing");
      }
      lease.artifact = artifact;
      validateLease(lease, lease.slot);
      await atomicJson(file(lease.slot), lease);
    });
  }
  async function clearArtifact(identity, allocationId, token) {
    return locked(async () => {
      const lease = await ownLease(identity);
      if (!lease || lease.allocationId !== allocationId || lease.artifact?.processToken !== token) return;
      lease.artifact = null;
      await atomicJson(file(lease.slot), lease);
    });
  }
  return { allocate, status: (identity) => locked(() => ownLease(identity)), release, updateArtifact, clearArtifact };
}

export async function verifyArtifactProcess(lease) {
  const artifact = lease?.artifact;
  if (!artifact) return null;
  const start = await processStart(artifact.pid);
  if (start === null) return null;
  ensure(start === artifact.processStart, "artifact PID was reused; no process will be stopped");
  ensure(await processCheckout(artifact.pid) === lease.checkout, "artifact process cwd changed");
  const response = await fetch(`http://127.0.0.1:${lease.artifactPort}/`, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(3000) });
  ensure(response.ok && response.headers.get("x-confirmation-session-token") === artifact.processToken, "artifact owner token mismatch");
  return artifact;
}

// Existing shell tests use isolated process/Docker stubs, never host listeners.
export function testAllocatorOptions() {
  if (process.env.NODE_ENV !== "test" || !process.env.DEVELOPMENT_PORT_STATE_ROOT || process.env.DEVELOPMENT_PORT_TEST_INSPECTION !== "stub") return {};
  return { inspect: async (ports) => Promise.all(ports.map(async port => {
    try {
      await exec("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { timeout: 3000 });
      return { port, free: false, owned: false, detail: "test listener" };
    } catch (error) {
      if (error.code !== 1) throw error;
      return { port, free: true, owned: false, detail: "free test port" };
    }
  })) };
}

async function main(args) {
  const command = args.shift();
  const options = {};
  while (args.length) {
    const key = args.shift();
    ensure(["--checkout", "--owner"].includes(key) && args.length > 0 && options[key] === undefined, "invalid allocator arguments");
    options[key] = args.shift();
  }
  ensure(["allocate", "status", "release"].includes(command), "Usage: development-port-allocation.mjs <allocate|status|release> [--checkout <path>] [--owner <owner>]");
  const identity = await resolvePortIdentity(options["--checkout"]);
  const allocator = createPortAllocator(testAllocatorOptions());
  const result = command === "allocate" ? await allocator.allocate(identity) : command === "status" ? await allocator.status(identity) : await allocator.release(identity, options["--owner"]);
  console.log(JSON.stringify(result));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
