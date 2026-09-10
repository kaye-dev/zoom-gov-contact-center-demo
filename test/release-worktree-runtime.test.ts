import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createPortAllocator } from "../scripts/development-port-allocation.mjs";
import { releaseWorktreeRuntime } from "../scripts/release-worktree-runtime.mjs";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const free = async (ports: number[]) => ports.map(port => ({ port, free: true, owned: false, detail: "fixture" }));
async function fixture(t: test.TestContext) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "release-runtime-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkout = path.join(root, "checkout");
  await mkdir(path.join(checkout, ".codex"), { recursive: true });
  const common = path.join(root, "common.git");
  const identity = { checkout, gitCommonDirectory: common, mode: "worktree", runtimeId: hash(checkout).slice(0, 12), owner: hash(`${common}\0${checkout}`) };
  const allocator = createPortAllocator({ stateRoot: path.join(root, "ports"), inspect: free, assertStopped: async () => {} });
  const lease = await allocator.allocate(identity);
  const manifest = path.join(checkout, ".codex/runtime.local.env");
  const content = `RUNTIME_CHECKOUT_PATH=${checkout}\nRUNTIME_ID=${identity.runtimeId}\nRUNTIME_GIT_COMMON_DIR=${common}\nRUNTIME_MODE=worktree\nHOST_PORT=${lease.appPort}\nPOSTGRES_PORT=15432\nSTUDIO_PORT=25555\n`;
  await writeFile(manifest, content);
  const runtimeStateRoot = path.join(root, "runtime");
  const legacyPath = path.join(runtimeStateRoot, hash(common).slice(0, 12), "slot-0.lease");
  await mkdir(path.dirname(legacyPath), { recursive: true });
  await writeFile(legacyPath, `RUNTIME_ID=${identity.runtimeId}\nRUNTIME_CHECKOUT_PATH=${checkout}\nRUNTIME_SLOT=0\n`);
  const options = { resolveIdentity: async () => identity, allocator, inspect: free, assertStopped: async () => {}, runtimeStateRoot };
  return { checkout, identity, allocator, manifest, content, legacyPath, options };
}

test("release removes both reservations and manifest, allowing a fresh allocation", async t => {
  const f = await fixture(t);
  await releaseWorktreeRuntime(f.checkout, f.options);
  assert.equal(await f.allocator.status(f.identity), null);
  await assert.rejects(readFile(f.manifest), { code: "ENOENT" });
  await assert.rejects(readFile(f.legacyPath), { code: "ENOENT" });
  assert.equal((await f.allocator.allocate(f.identity)).created, true);
});

test("busy ports, retained sessions and foreign leases preserve allocations", async t => {
  const f = await fixture(t);
  await assert.rejects(releaseWorktreeRuntime(f.checkout, { ...f.options, inspect: async (ports: number[]) => ports.map(port => ({ port, free: false, owned: false, detail: "busy" })) }), /PORT_IN_USE/);
  const confirmation = path.join(f.checkout, ".codex/confirmation-session.local.json");
  await writeFile(confirmation, "{}");
  await assert.rejects(releaseWorktreeRuntime(f.checkout, f.options), /confirmation session remains/);
  await rm(confirmation);
  await writeFile(f.legacyPath, "RUNTIME_ID=foreign\nRUNTIME_CHECKOUT_PATH=/foreign\nRUNTIME_SLOT=0\n");
  await assert.rejects(releaseWorktreeRuntime(f.checkout, f.options), /lease owner mismatch/);
  assert.ok(await f.allocator.status(f.identity));
  assert.equal(await readFile(f.manifest, "utf8"), f.content);
});
