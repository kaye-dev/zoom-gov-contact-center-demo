import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// All test-file workers in one runner share reservations, just like checkouts in
// normal use. Independent private roots would race each other at the real bind.
export const artifactTestStateRoot = path.join(realpathSync(tmpdir()), `zoom-artifact-test-ports-${process.ppid}`);
export function artifactTestEnvironment(root: string, common: string, environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...environment, NODE_ENV: "test", DEVELOPMENT_PORT_STATE_ROOT: artifactTestStateRoot,
    DEV_RUNTIME_GIT_DIR_OVERRIDE: path.join(root, "scripts"), DEV_RUNTIME_GIT_COMMON_DIR_OVERRIDE: common };
}
export async function releaseArtifactTestPorts(root: string, common: string) {
  const { createPortAllocator } = await import("../../scripts/development-port-allocation.mjs");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const identity = { checkout: root, gitCommonDirectory: common, mode: "worktree", runtimeId: hash(root).slice(0, 12), owner: hash(`${common}\0${root}`) };
  const allocator = createPortAllocator({ stateRoot: artifactTestStateRoot });
  await allocator.release(identity, identity.owner);
}
