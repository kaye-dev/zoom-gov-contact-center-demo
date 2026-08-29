import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminAccessBaseSnapshot } from "../lib/admin-access-rehearsal";
import type { NeonRehearsal } from "../lib/neon-rehearsal";
import {
  createReviewedMigrationOperationDigest,
  runReviewedMigrationApplication,
  type ReviewedMigrationSourceEvidence,
  type ReviewedMigrationWorkflowDependencies,
} from "../lib/reviewed-migration-workflow";

const gitCommitSha = "a".repeat(40);
const targetFingerprint = "b".repeat(64);
const reviewedPlanDigest = "c".repeat(64);
const canonicalDeploymentId = "dpl_canonical123";
const source: AdminAccessBaseSnapshot = {
  schemaVersion: 1,
  userCount: 2,
  userRoleDigest: "d".repeat(64),
};
const evidence: ReviewedMigrationSourceEvidence = {
  reviewedPlanDigest,
  source,
};
const expectedOperationDigest = createReviewedMigrationOperationDigest({
  gitCommitSha,
  targetFingerprint,
  reviewedPlanDigest,
  canonicalDeploymentId,
  source,
});

test("operation digest binds the current canonical deployment", () => {
  const changed = createReviewedMigrationOperationDigest({
    gitCommitSha,
    targetFingerprint,
    reviewedPlanDigest,
    canonicalDeploymentId: "dpl_changed456",
    source,
  });
  assert.notEqual(changed, expectedOperationDigest);
});
const rehearsal: NeonRehearsal = {
  branchId: "br-rehearsal",
  branchName: "rehearsal/deploy-test",
  parentBranchId: "br-production",
  parentLsn: "0/1234",
  endpointId: "ep-rehearsal",
  directUrl: "clone-database",
};

function workflow(overrides: {
  inspect?: ReviewedMigrationWorkflowDependencies["inspectReviewedSource"];
  apply?: ReviewedMigrationWorkflowDependencies["applyMigrations"];
  cleanup?: ReviewedMigrationWorkflowDependencies["deleteRehearsal"];
  maintenance?: ReviewedMigrationWorkflowDependencies["assertMaintenanceActive"];
  postVerify?: ReviewedMigrationWorkflowDependencies["verifyPostMigration"];
} = {}) {
  const applied: string[] = [];
  let createCount = 0;
  let cleanupCount = 0;
  let productionAttemptCount = 0;
  const dependencies: ReviewedMigrationWorkflowDependencies = {
    productionDirectUrl: "production-database",
    expectedOperationDigest,
    gitCommitSha,
    targetFingerprint,
    canonicalDeploymentId,
    inspectReviewedSource:
      overrides.inspect ?? (async () => evidence),
    assertMaintenanceActive:
      overrides.maintenance ?? (async () => undefined),
    createRehearsal: async () => {
      createCount += 1;
      return rehearsal;
    },
    deleteRehearsal:
      overrides.cleanup ??
      (async () => {
        cleanupCount += 1;
      }),
    applyMigrations:
      overrides.apply ??
      ((directUrl) => {
        applied.push(directUrl);
      }),
    verifyUpToDate: async () => undefined,
    verifyPostMigration:
      overrides.postVerify ?? (async () => undefined),
    onProductionAttempt: () => {
      productionAttemptCount += 1;
    },
  };
  return {
    dependencies,
    applied,
    createCount: () => createCount,
    cleanupCount: () => cleanupCount,
    productionAttemptCount: () => productionAttemptCount,
  };
}

test("reviewed workflow applies to the clone, verifies cleanup, then applies Production once", async () => {
  const state = workflow();
  const result = await runReviewedMigrationApplication(state.dependencies);

  assert.deepEqual(state.applied, ["clone-database", "production-database"]);
  assert.equal(state.cleanupCount(), 1);
  assert.equal(state.productionAttemptCount(), 1);
  assert.match(result.rehearsalEvidenceDigest, /^[0-9a-f]{64}$/u);
});

test("clone apply or verification failure cleans up and never applies Production", async () => {
  const state = workflow({
    apply: (directUrl) => {
      state.applied.push(directUrl);
      if (directUrl === "clone-database") {
        throw new Error("synthetic clone migration failure");
      }
    },
  });

  await assert.rejects(
    runReviewedMigrationApplication(state.dependencies),
    /synthetic clone migration failure/u,
  );
  assert.deepEqual(state.applied, ["clone-database"]);
  assert.equal(state.cleanupCount(), 1);
  assert.equal(state.productionAttemptCount(), 0);
});

test("unverified clone cleanup blocks Production even after a successful rehearsal", async () => {
  const state = workflow({
    cleanup: async () => {
      throw new Error("synthetic cleanup failure");
    },
  });

  await assert.rejects(
    runReviewedMigrationApplication(state.dependencies),
    /cleanup could not be verified/u,
  );
  assert.deepEqual(state.applied, ["clone-database"]);
  assert.equal(state.productionAttemptCount(), 0);
});

test("Production semantic TOCTOU after rehearsal blocks Production apply", async () => {
  let productionReads = 0;
  const state = workflow({
    inspect: async (directUrl) => {
      if (directUrl === "clone-database") {
        return evidence;
      }
      productionReads += 1;
      if (productionReads === 1) {
        return evidence;
      }
      return {
        reviewedPlanDigest,
        source: { ...source, userCount: source.userCount + 1 },
      };
    },
  });

  await assert.rejects(
    runReviewedMigrationApplication(state.dependencies),
    /operation evidence changed|source differs/u,
  );
  assert.deepEqual(state.applied, ["clone-database"]);
  assert.equal(state.cleanupCount(), 1);
  assert.equal(state.productionAttemptCount(), 0);
});

test("maintenance gate fails before creating or mutating a rehearsal", async () => {
  let created = false;
  const state = workflow({
    maintenance: async () => {
      throw new Error("maintenance inactive");
    },
  });
  state.dependencies.createRehearsal = async () => {
    created = true;
    return rehearsal;
  };

  await assert.rejects(
    runReviewedMigrationApplication(state.dependencies),
    /maintenance inactive/u,
  );
  assert.equal(created, false);
  assert.deepEqual(state.applied, []);
  assert.equal(state.productionAttemptCount(), 0);
});

test("second maintenance gate failure after cleanup blocks Production", async () => {
  let checks = 0;
  const state = workflow({
    maintenance: async () => {
      checks += 1;
      if (checks === 2) {
        throw new Error("maintenance changed after rehearsal");
      }
    },
  });

  await assert.rejects(
    runReviewedMigrationApplication(state.dependencies),
    /maintenance changed after rehearsal/u,
  );
  assert.equal(state.createCount(), 1);
  assert.equal(state.cleanupCount(), 1);
  assert.deepEqual(state.applied, ["clone-database"]);
  assert.equal(state.productionAttemptCount(), 0);
});

test("unapproved operation digest blocks before creating the clone", async () => {
  const state = workflow();
  state.dependencies.expectedOperationDigest = "e".repeat(64);

  await assert.rejects(
    runReviewedMigrationApplication(state.dependencies),
    /operation evidence changed after approval/u,
  );
  assert.equal(state.createCount(), 0);
  assert.equal(state.cleanupCount(), 0);
  assert.deepEqual(state.applied, []);
  assert.equal(state.productionAttemptCount(), 0);
});

test("clone source mismatch is cleaned up before any migration apply", async () => {
  const state = workflow({
    inspect: async (directUrl) =>
      directUrl === "clone-database"
        ? {
            reviewedPlanDigest,
            source: { ...source, userRoleDigest: "e".repeat(64) },
          }
        : evidence,
  });

  await assert.rejects(
    runReviewedMigrationApplication(state.dependencies),
    /source differs from the approved Production snapshot/u,
  );
  assert.equal(state.createCount(), 1);
  assert.equal(state.cleanupCount(), 1);
  assert.deepEqual(state.applied, []);
  assert.equal(state.productionAttemptCount(), 0);
});

test("Production post-verification failure never retries or rolls back", async () => {
  const state = workflow({
    postVerify: async (directUrl) => {
      if (directUrl === "production-database") {
        throw new Error("synthetic Production verification failure");
      }
    },
  });

  await assert.rejects(
    runReviewedMigrationApplication(state.dependencies),
    /synthetic Production verification failure/u,
  );
  assert.deepEqual(state.applied, ["clone-database", "production-database"]);
  assert.equal(state.cleanupCount(), 1);
  assert.equal(state.productionAttemptCount(), 1);
});
