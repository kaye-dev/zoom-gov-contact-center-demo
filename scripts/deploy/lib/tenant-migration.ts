import { createHash } from "node:crypto";

import {
  createMigrationPlan,
  createMigrationSnapshot,
  readReviewedMigrationChain,
  type MigrationPlan,
  type MigrationSnapshotOptions,
} from "./migrations";

// Exact immutable chain reviewed for the municipality-to-multi-tenant upgrade.
// Future migrations must not silently inherit this exception.
const CHAIN_DIGEST = "5d97c0451fd5a4a1173d97e37a6a4363a2cd95be1dda34638377adab5353ab1b";
const BASE_LENGTH = 17;
const CHAIN_LENGTH = 33;

export function isTenantMigrationPlan(plan: MigrationPlan): boolean {
  return plan.pending.some((migration) => migration.classification !== "expand-compatible");
}

export async function createDeploymentMigrationPlan(
  options: MigrationSnapshotOptions,
): Promise<MigrationPlan> {
  const plan = await createMigrationSnapshot(options);
  if (!isTenantMigrationPlan(plan)) return createMigrationPlan(options);
  const chain = readReviewedMigrationChain(options.projectRoot);
  const digest = createHash("sha256").update(JSON.stringify(chain.map((item) => ({
    name: item.name, sha256: item.hash, classification: item.classification,
  })))).digest("hex");
  if (digest !== CHAIN_DIGEST || chain.length !== CHAIN_LENGTH ||
      plan.appliedNames.length !== BASE_LENGTH ||
      plan.pending.length !== CHAIN_LENGTH - BASE_LENGTH ||
      plan.appliedNames.some((name, index) => name !== chain[index]?.name) ||
      plan.pending.some((item, index) => item.hash !== chain[BASE_LENGTH + index]?.hash)) {
    throw new Error("Pending migrations do not match the reviewed tenant upgrade window. Production was not changed.");
  }
  return plan;
}

export type TenantUpgradeDependencies = {
  productionUrl: string;
  plan: MigrationPlan;
  inspect(url: string): Promise<MigrationPlan>;
  createClone(): Promise<{ directUrl: string }>;
  deleteClone(clone: { directUrl: string }): Promise<void>;
  apply(url: string): void;
  verify(url: string): Promise<void>;
  beforeProduction(): Promise<void>;
  capture(url: string): Promise<string>;
  verifyData(url: string): Promise<void>;
};

/** Rehearse the exact plan and require verified cleanup before Production. */
export async function applyTenantUpgrade(deps: TenantUpgradeDependencies): Promise<void> {
  const assertPlan = async (url: string) => {
    if ((await deps.inspect(url)).planHash !== deps.plan.planHash) {
      throw new Error("Tenant migration source changed after approval. Production was not changed.");
    }
  };
  await assertPlan(deps.productionUrl);
  const source = await deps.capture(deps.productionUrl);
  const clone = await deps.createClone();
  try {
    await assertPlan(clone.directUrl);
    if (await deps.capture(clone.directUrl) !== source) throw new Error("Clone data differs from Production.");
    deps.apply(clone.directUrl);
    await deps.verify(clone.directUrl);
    await deps.verifyData(clone.directUrl);
  } finally {
    await deps.deleteClone(clone);
  }
  await assertPlan(deps.productionUrl);
  if (await deps.capture(deps.productionUrl) !== source) throw new Error("Production data changed during rehearsal.");
  await deps.beforeProduction();
  deps.apply(deps.productionUrl);
  await deps.verify(deps.productionUrl);
  await deps.verifyData(deps.productionUrl);
}
