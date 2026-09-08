#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, rm, mkdir, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertRuntimeStopped, createPortAllocator, inspectPorts, processStart, resolvePortIdentity, testAllocatorOptions } from "./development-port-allocation.mjs";

function ensure(value, message) { if (!value) throw new Error(message); }
const digest = value => createHash("sha256").update(value).digest("hex");
async function readPrivate(file, optional = false) {
  let stat;
  try { stat = await lstat(file); } catch (error) { if (optional && error.code === "ENOENT") return null; throw error; }
  ensure(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600 && stat.size < 131072 && await realpath(file) === file, `unsafe migration file: ${file}`);
  return readFile(file, "utf8");
}
async function writeAtomic(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}
function parseManifest(text, identity) {
  const result = {};
  for (const line of text.trim().split("\n")) {
    const match = /^([A-Z_]+)=([^\r\n]*)$/u.exec(line);
    ensure(match && !Object.hasOwn(result, match[1]), "invalid runtime manifest for migration");
    result[match[1]] = match[2];
  }
  ensure(["1", "2"].includes(result.RUNTIME_SCHEMA_VERSION) && result.RUNTIME_CHECKOUT_PATH === identity.checkout &&
    result.RUNTIME_GIT_COMMON_DIR === identity.gitCommonDirectory && result.RUNTIME_ID === identity.runtimeId && result.RUNTIME_MODE === identity.mode &&
    result.WEB_BIND_ADDRESS === "127.0.0.1" && result.WEB_ORIGIN === `http://localhost:${result.HOST_PORT}`, "runtime manifest identity mismatch");
  const port = Number(result.HOST_PORT);
  ensure(Number.isInteger(port) && (identity.mode === "local" ? port === 3000 : result.RUNTIME_SCHEMA_VERSION === "1" ? port >= 3100 && port <= 3899 : port >= 3001 && port <= 3005), "invalid runtime Web port");
  const db = Number(result.POSTGRES_PORT), studio = Number(result.STUDIO_PORT);
  ensure(identity.mode === "local" ? db === 5432 && studio === 5555 :
    db >= 15432 && db <= 16231 && studio - db === 10123 && (result.RUNTIME_SCHEMA_VERSION !== "1" || db - port === 12332), "invalid legacy DB/Studio ports");
  return result;
}

export async function migrateRuntimePorts({ checkout, rollback = false, allocator, inspect = inspectPorts, assertStopped = assertRuntimeStopped } = {}) {
  const identity = await resolvePortIdentity(checkout);
  allocator ??= createPortAllocator();
  const stateRoot = path.join(identity.checkout, ".codex");
  ensure(await realpath(stateRoot) === stateRoot, "migration state directory must not traverse symlinks");
  const lock = path.join(stateRoot, "port-migration.lock");
  await mkdir(lock, { mode: 0o700 }).catch(error => { throw new Error(`PORT_MIGRATION_BUSY: inspect ${lock}: ${error.code}`); });
  const manifestPath = path.join(stateRoot, "runtime.local.env");
  const journalPath = path.join(stateRoot, "port-migration.local.json");
  let createdAllocation;
  let manifestCommitted = false;
  try {
    const original = await readPrivate(manifestPath);
    const manifest = parseManifest(original, identity);
    const journalText = await readPrivate(journalPath, true);
    const journal = journalText === null ? null : JSON.parse(journalText);
    if (journal) ensure(journal.schemaVersion === 1 && journal.owner === identity.owner && typeof journal.before === "string" && typeof journal.after === "string" &&
      journal.beforeDigest === digest(journal.before) && journal.afterDigest === digest(journal.after), "invalid port migration journal");
    if (rollback) ensure(journal && [journal.beforeDigest, journal.afterDigest].includes(digest(original)), "PORT_MIGRATION_DRIFT: manifest changed after migration");
    else if (manifest.RUNTIME_SCHEMA_VERSION === "2") return { status: "current", oldUrl: manifest.WEB_ORIGIN, newUrl: manifest.WEB_ORIGIN };
    else ensure(journal === null || journal.status === "rolled-back", "PORT_MIGRATION_PENDING: resolve the existing transaction with migrate-ports --rollback");

    await assertStopped(identity, { allowDatabase: true });
    const ports = [Number(manifest.HOST_PORT)];
    if (rollback) ports.push(Number(parseManifest(journal.before, identity).HOST_PORT));
    const allocationBefore = await allocator.status(identity);
    if (allocationBefore) {
      ports.push(allocationBefore.appPort, allocationBefore.artifactPort);
      if (allocationBefore.artifact) ensure(await processStart(allocationBefore.artifact.pid) === null, "PORT_MIGRATION_REQUIRED: stop the owned artifact first");
    }
    const confirmation = await readPrivate(path.join(stateRoot, "confirmation-session.local.json"), true);
    if (confirmation) {
      const state = JSON.parse(confirmation);
      ensure(state.checkout === identity.checkout && state.gitCommonDirectory === identity.gitCommonDirectory, "confirmation owner mismatch");
      for (const artifact of Object.values(state.artifactServers ?? {})) {
        ensure(Number.isInteger(artifact.pid) && artifact.pid > 1, "invalid retained artifact PID");
        ensure(await processStart(artifact.pid) === null, `PORT_MIGRATION_REQUIRED: stop the retained session with ./dev-confirmation.sh stop ${state.slug}`);
        const url = new URL(artifact.url);
        ensure(url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port, "invalid retained artifact origin");
        ports.push(Number(url.port));
      }
    }
    ensure((await inspect([...new Set(ports)], identity)).every(entry => entry.free), "PORT_MIGRATION_REQUIRED: Web/artifact listeners are running; stop their verified owners explicitly; DB is preserved");
    if (rollback) {
      ensure(!journal.createdAllocationId || !allocationBefore || allocationBefore.allocationId === journal.createdAllocationId,
        "PORT_MIGRATION_DRIFT: allocation changed after migration");
      ensure(await readPrivate(manifestPath) === original, "PORT_MIGRATION_DRIFT");
      await writeAtomic(manifestPath, journal.before);
      manifestCommitted = true;
      if (journal.createdAllocationId) await allocator.release(identity, identity.owner, journal.createdAllocationId, { rollback: true });
      await writeAtomic(journalPath, JSON.stringify({ ...journal, status: "rolled-back" }, null, 2));
      return { status: "rolled-back", oldUrl: manifest.WEB_ORIGIN, newUrl: parseManifest(journal.before, identity).WEB_ORIGIN };
    }
    const allocation = await allocator.allocate(identity);
    if (allocation.created) createdAllocation = allocation;
    const updated = original.replace(/^RUNTIME_SCHEMA_VERSION=1$/mu, "RUNTIME_SCHEMA_VERSION=2")
      .replace(/^HOST_PORT=\d+$/mu, `HOST_PORT=${allocation.appPort}`)
      .replace(/^WEB_ORIGIN=.+$/mu, `WEB_ORIGIN=http://localhost:${allocation.appPort}`);
    parseManifest(updated, identity);
    const transaction = { schemaVersion: 1, owner: identity.owner, status: "pending", before: original, after: updated,
      beforeDigest: digest(original), afterDigest: digest(updated), createdAllocationId: createdAllocation?.allocationId ?? null };
    await writeAtomic(journalPath, JSON.stringify(transaction, null, 2));
    ensure(await readPrivate(manifestPath) === original, "PORT_MIGRATION_DRIFT");
    // Recheck at commit; a new listener means no manifest change.
    await assertStopped(identity, { allowDatabase: true });
    ensure((await inspect([...new Set([...ports, allocation.appPort, allocation.artifactPort])], identity)).every(entry => entry.free), "PORT_MIGRATION_DRIFT: a listener appeared before commit");
    await writeAtomic(manifestPath, updated);
    manifestCommitted = true;
    await writeAtomic(journalPath, JSON.stringify({ ...transaction, status: "committed" }, null, 2));
    return { status: "migrated", oldUrl: manifest.WEB_ORIGIN, newUrl: `http://localhost:${allocation.appPort}`, slot: allocation.slot };
  } catch (error) {
    if (createdAllocation && !manifestCommitted) {
      await allocator.release(identity, identity.owner, createdAllocation.allocationId, { rollback: true }).catch(() => {});
    }
    throw error;
  } finally { await rmdir(lock); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rollback = args[0] === "--rollback";
  if (rollback) args.shift();
  if (args.length !== 2 || args[0] !== "--checkout") {
    console.error("Usage: development-port-migration.mjs [--rollback] --checkout <path>"); process.exitCode = 2;
  } else {
    const options = testAllocatorOptions();
    migrateRuntimePorts({ checkout: args[1], rollback, allocator: createPortAllocator(options), ...(options.inspect ? { inspect: options.inspect } : {}) })
      .then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
