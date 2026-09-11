import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const modulePromise = import("../scripts/development-port-allocation.mjs");
const exec = promisify(execFile);
const free = async (ports: number[]) => ports.map(port => ({ port, free: true, owned: false, detail: "fixture" }));
function identity(checkout: string, mode = "worktree", common = `${checkout}/.git`) {
  return { checkout, gitCommonDirectory: common, mode, runtimeId: mode === "local" ? "local" : "fixture", owner: createHash("sha256").update(`${common}\0${checkout}`).digest("hex") };
}
async function root(context: test.TestContext) {
  const value = await mkdtemp(path.join(tmpdir(), "bounded-ports-"));
  // macOS tmpdir may be a symlink; state roots must be canonical.
  const { realpath } = await import("node:fs/promises");
  const canonical = await realpath(value);
  context.after(() => rm(canonical, { recursive: true, force: true }));
  return canonical;
}

test("PORT-01/03: fixed Local and paired worktree boundary slots; exhaustion never falls back", async context => {
  const { createPortAllocator } = await modulePromise;
  const stateRoot = await root(context);
  const allocator = createPortAllocator({ stateRoot, inspect: free });
  const local = await allocator.allocate(identity("/fixture/local", "local"));
  assert.equal(local.appPort, 3000); assert.equal(local.artifactPort, 4000);
  for (let i = 1; i <= 5; i++) {
    const lease = await allocator.allocate(identity(`/fixture/worktree-${i}`));
    assert.equal(lease.slot, i); assert.equal(lease.appPort, 3000 + i); assert.equal(lease.artifactPort, 4000 + i);
  }
  await assert.rejects(allocator.allocate(identity("/fixture/overflow")), /PORT_SLOTS_EXHAUSTED/);
  await assert.rejects(allocator.allocate(identity("/fixture/second-local", "local")), /PORT_SLOTS_EXHAUSTED/);
});

test("PORT-04: same owner remains stable across allocator instances and repos share slots", async context => {
  const { createPortAllocator } = await modulePromise;
  const stateRoot = await root(context);
  const a = createPortAllocator({ stateRoot, inspect: free });
  const b = createPortAllocator({ stateRoot, inspect: free });
  const owner = identity("/fixture/a");
  const [first, repeated, other] = await Promise.all([a.allocate(owner), b.allocate(owner), b.allocate(identity("/fixture/b"))]);
  assert.equal(first.allocationId, repeated.allocationId);
  assert.notEqual(first.slot, other.slot);
  const restarted = await createPortAllocator({ stateRoot, inspect: free }).allocate(owner);
  assert.equal(restarted.allocationId, first.allocationId);
});

test("PORT-04: child processes serialize allocations under the shared lock", async context => {
  const stateRoot = await root(context);
  const moduleUrl = new URL("../scripts/development-port-allocation.mjs", import.meta.url).href;
  const code = `import {createPortAllocator} from ${JSON.stringify(moduleUrl)};
    const allocator=createPortAllocator({stateRoot:process.argv[1],inspect:async ports=>ports.map(port=>({port,free:true}))});
    console.log(JSON.stringify(await allocator.allocate(JSON.parse(process.argv[2]))));`;
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => exec(process.execPath,
    ["--input-type=module", "-e", code, stateRoot, JSON.stringify(identity(`/fixture/child-${i}`))])));
  assert.equal(new Set(results.map(result => JSON.parse(result.stdout).slot)).size, 5);
});

test("PORT-05: foreign listeners, corrupt leases, symlinks and interrupted locks fail closed", async context => {
  const { createPortAllocator } = await modulePromise;
  const stateRoot = await root(context);
  const occupied = createPortAllocator({ stateRoot, inspect: async (ports: number[]) => ports.map(port => ({port,free:false,owned:false,detail:"foreign IPv6 listener"})) });
  await assert.rejects(occupied.allocate(identity("/fixture/local", "local")), /PORT_SLOTS_EXHAUSTED.*foreign IPv6/);
  await writeFile(path.join(stateRoot, "slot-1.json"), "{}", { mode: 0o600 });
  const allocator = createPortAllocator({ stateRoot, inspect: free, lockTimeoutMs: 30 });
  await assert.rejects(allocator.allocate(identity("/fixture/a")), /invalid port owner/);
  await rm(path.join(stateRoot, "slot-1.json"));
  const external = path.join(stateRoot, "external");
  await writeFile(external, "{}", { mode: 0o600 });
  await symlink(external, path.join(stateRoot, "slot-1.json"));
  await assert.rejects(allocator.allocate(identity("/fixture/a")), /regular 0600/);
  await rm(path.join(stateRoot, "slot-1.json"));
  await mkdir(path.join(stateRoot, "allocation.lock"));
  await assert.rejects(allocator.allocate(identity("/fixture/a")), /PORT_LOCK_BUSY/);
});

test("PORT-05: release requires exact owner and stopped resources; reallocation is explicit", async context => {
  const { createPortAllocator } = await modulePromise;
  const stateRoot = await root(context);
  let running = false;
  const allocator = createPortAllocator({ stateRoot, assertStopped: async () => {}, inspect: async (ports: number[]) => ports.map(port => ({port,free:!running,owned:true,detail:"fixture"})) });
  const owner = identity("/fixture/a");
  const lease = await allocator.allocate(owner);
  await assert.rejects(allocator.release(owner, "wrong"), /exact owner/);
  running = true;
  await assert.rejects(allocator.release(owner, owner.owner), /PORT_IN_USE/);
  running = false;
  assert.deepEqual(await allocator.release(owner, owner.owner), { released: true });
  assert.equal(await allocator.status(owner), null);
  assert.notEqual((await allocator.allocate(owner)).allocationId, lease.allocationId);
  await chmod(path.join(stateRoot, "slot-1.json"), 0o644);
  await assert.rejects(allocator.status(owner), /regular 0600/);
});

test("PORT-11: allocator CLI returns stable JSON with verified Git identity", async context => {
  const checkout = await root(context);
  await exec("git", ["init", "-q", checkout]);
  const stateRoot = path.join(checkout, "state");
  const cli = path.resolve(import.meta.dirname, "../scripts/development-port-allocation.mjs");
  const result = await exec(process.execPath, [cli, "status", "--checkout", checkout], {
    env: { ...process.env, NODE_ENV: "test", DEVELOPMENT_PORT_STATE_ROOT: stateRoot },
  });
  assert.equal(JSON.parse(result.stdout), null);
  const source = await readFile(cli, "utf8");
  assert.doesNotMatch(source, /eval\(/u);
});

test("stale artifact reclamation preserves live PIDs and rejects changed registrations or occupied ports", async context => {
  const { createPortAllocator, processStart } = await modulePromise;
  const stateRoot = await root(context);
  let occupied = false;
  const allocator = createPortAllocator({ stateRoot, inspect: async ports => (await free(ports)).map(entry => ({ ...entry, free: !occupied })), assertStopped: async () => {} });
  const owner = identity("/fixture/stale");
  const lease = await allocator.allocate(owner);
  const artifact = { pid: process.pid, processStart: await processStart(process.pid), processToken: randomUUID(), slug: "alpha", surface: "prototype", artifactRealpath: "/fixture/stale/plans/alpha/prototype" };
  await allocator.updateArtifact(owner, lease.allocationId, artifact);
  assert.equal(await allocator.reclaimStaleArtifact(owner, { ...lease, artifact }), false);
  const stale = { ...artifact, processStart: "Mon Jan  1 00:00:00 2001" };
  await allocator.updateArtifact(owner, lease.allocationId, stale);
  await assert.rejects(allocator.reclaimStaleArtifact(owner, { ...lease, artifact }), /registration changed/);
  occupied = true;
  await assert.rejects(allocator.reclaimStaleArtifact(owner, { ...lease, artifact: stale }), /PORT_IN_USE/);
  assert.deepEqual((await allocator.status(owner)).artifact, stale);
  occupied = false;
  assert.equal(await allocator.reclaimStaleArtifact(owner, { ...lease, artifact: stale }), true);
  process.kill(process.pid, 0);
  assert.equal((await allocator.status(owner)).artifact, null);
  assert.equal((await allocator.release(owner, owner.owner, lease.allocationId)).released, true);
});

test("process inspection distinguishes confirmed exit from ps and permission failures", async () => {
  const { processStart } = await modulePromise;
  const failure = (code: string | number) => Object.assign(new Error(String(code)), { code, stderr: "" });
  const missing = async () => { throw failure(1); };
  assert.equal(await processStart(123, { run: missing, signal: () => { throw failure("ESRCH"); } }), null);
  await assert.rejects(processStart(123, { run: missing, signal: () => { throw failure("EPERM"); } }), /EPERM/);
  await assert.rejects(processStart(123, { run: async () => { throw failure("ENOENT"); } }), /ENOENT/);
  await assert.rejects(processStart(123, { run: missing, signal: () => true }), /1/);
});

test("process start identity is UTC ISO across caller timezones", async () => {
  const moduleUrl = new URL("../scripts/development-port-allocation.mjs", import.meta.url).href;
  const code = `import {processStart} from ${JSON.stringify(moduleUrl)}; console.log(await processStart(Number(process.argv[1])));`;
  const results = await Promise.all(["UTC", "Asia/Tokyo", "Pacific/Honolulu"].map(TZ => exec(process.execPath,
    ["--input-type=module", "-e", code, String(process.pid)], { env: { ...process.env, TZ } })));
  assert.equal(new Set(results.map(result => result.stdout.trim())).size, 1);
  assert.match(results[0].stdout.trim(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u);
});

test("PORT-11: documented policy and launcher ranges match exported bounds", async () => {
  const { PORT_POLICY } = await modulePromise;
  assert.deepEqual(PORT_POLICY, { schemaVersion: 1, appBase: 3000, artifactBase: 4000, worktreeSlots: 5 });
  const doc = await readFile(new URL("../docs/development/development-ports.md", import.meta.url), "utf8");
  for (const expected of ["3001–3005", "4001–4005", "15432–16231", "25555–26354", "migrate-ports --rollback", "GUI", "承認そのものを付与しません"]) assert.ok(doc.includes(expected), expected);
});

test("PORT-05: a bind race cancels only the newly created lease and preserves the foreign listener", async context => {
  const { createPortAllocator } = await modulePromise;
  let occupied = false;
  const allocator = createPortAllocator({ stateRoot: await root(context), inspect: async (ports: number[]) => ports.map(port => ({ port, free: !occupied, owned: false, detail: "fixture" })), assertStopped: async () => {} });
  const owner = identity("/fixture/bind-race");
  const lease = await allocator.allocate(owner);
  occupied = true;
  await assert.rejects(allocator.release(owner, owner.owner, lease.allocationId), /PORT_IN_USE/);
  await allocator.release(owner, owner.owner, lease.allocationId, { rollback: true });
  assert.equal(await allocator.status(owner), null);
  assert.equal(occupied, true);
});
