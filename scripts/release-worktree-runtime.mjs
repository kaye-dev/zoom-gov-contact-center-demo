import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { assertRuntimeStopped, createPortAllocator, inspectPorts, resolvePortIdentity } from "./development-port-allocation.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
function ensure(value, message) { if (!value) throw new Error(message); }
async function safeRead(file) {
  let stat;
  try { stat = await lstat(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  ensure(stat.isFile() && !stat.isSymbolicLink() && stat.size < 131072 && await realpath(file) === file, `unsafe runtime state: ${file}`);
  return readFile(file, "utf8");
}
function values(text) {
  const result = {};
  for (const line of text.trim().split("\n")) {
    const match = /^([A-Z_]+)=([^\r\n]*)$/u.exec(line);
    ensure(match && !Object.hasOwn(result, match[1]), "invalid runtime state");
    result[match[1]] = match[2];
  }
  return result;
}

export async function releaseWorktreeRuntime(checkout, {
  resolveIdentity = resolvePortIdentity, allocator = createPortAllocator(), inspect = inspectPorts,
  assertStopped = assertRuntimeStopped,
  runtimeStateRoot = process.env.DEV_RUNTIME_STATE_ROOT ?? path.join(process.env.TMPDIR || "/tmp", "zoom-gov-contact-center-demo-runtime"),
} = {}) {
  const identity = await resolveIdentity(checkout);
  const state = path.join(identity.checkout, ".codex");
  ensure(await realpath(state) === state, "unsafe runtime directory");
  const lock = path.join(state, "port-migration.lock");
  await mkdir(lock, { mode: 0o700 });
  let legacyLock;
  try {
    const manifestPath = path.join(state, "runtime.local.env");
    const original = await safeRead(manifestPath);
    const manifest = original === null ? null : values(original);
    if (manifest) ensure(manifest.RUNTIME_CHECKOUT_PATH === identity.checkout && manifest.RUNTIME_ID === identity.runtimeId && manifest.RUNTIME_GIT_COMMON_DIR === identity.gitCommonDirectory && manifest.RUNTIME_MODE === identity.mode, "runtime owner mismatch");
    ensure(await safeRead(path.join(state, "confirmation-session.local.json")) === null, "confirmation session remains; allocation preserved");
    const sessionPath = path.join(state, "runtime-session.local.json");
    const sessionText = await safeRead(sessionPath);
    if (sessionText !== null) {
      const session = JSON.parse(sessionText);
      ensure(session.checkout === identity.checkout && session.runtimeId === identity.runtimeId && session.composeProject === manifest?.COMPOSE_PROJECT_NAME, "runtime session owner mismatch");
    }
    const lease = await allocator.status(identity);
    const ports = manifest ? [manifest.HOST_PORT, manifest.POSTGRES_PORT, manifest.STUDIO_PORT].map(Number) : [];
    if (lease) ports.push(lease.appPort, lease.artifactPort);
    ensure(ports.every(port => Number.isInteger(port) && port > 0 && port < 65536), "invalid runtime port");
    await assertStopped(identity);
    ensure((await inspect([...new Set(ports)], identity)).every(entry => entry.free), "PORT_IN_USE: allocation preserved");
    let legacyPath;
    let legacyText;
    if (manifest && identity.mode === "worktree") {
      const slot = Number(manifest.POSTGRES_PORT) - 15432;
      ensure(slot >= 0 && slot < 800 && Number(manifest.STUDIO_PORT) === 25555 + slot, "invalid runtime slot");
      await mkdir(runtimeStateRoot, { recursive: true });
      const directory = path.join(await realpath(runtimeStateRoot), hash(identity.gitCommonDirectory).slice(0, 12));
      await mkdir(directory, { recursive: true });
      ensure(await realpath(directory) === path.resolve(directory), "unsafe runtime lease directory");
      const candidateLock = path.join(directory, "allocation.lock");
      await mkdir(candidateLock);
      legacyLock = candidateLock;
      legacyPath = path.join(directory, `slot-${slot}.lease`);
      legacyText = await safeRead(legacyPath);
      if (legacyText !== null) {
        const legacy = values(legacyText);
        ensure(legacy.RUNTIME_CHECKOUT_PATH === identity.checkout && legacy.RUNTIME_ID === identity.runtimeId && Number(legacy.RUNTIME_SLOT) === slot, "runtime lease owner mismatch");
      }
    }
    ensure(await safeRead(manifestPath) === original && await safeRead(sessionPath) === sessionText, "runtime state changed; allocation preserved");
    if (lease) await allocator.release(identity, identity.owner, lease.allocationId);
    if (legacyText != null) await rm(legacyPath);
    if (sessionText !== null) await rm(sessionPath);
    if (original !== null) await rm(manifestPath);
    return { released: Boolean(lease || manifest), volumesPreserved: true };
  } finally {
    if (legacyLock) await rmdir(legacyLock);
    await rmdir(lock);
  }
}
