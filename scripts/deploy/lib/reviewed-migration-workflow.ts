import { createHash } from "node:crypto";

import type { AdminAccessBaseSnapshot } from "./admin-access-rehearsal";
import type { NeonRehearsal } from "./neon-rehearsal";

export type ReviewedMigrationSourceEvidence = {
  reviewedPlanDigest: string;
  source: AdminAccessBaseSnapshot;
};

export type ReviewedMigrationWorkflowDependencies = {
  productionDirectUrl: string;
  expectedOperationDigest: string;
  gitCommitSha: string;
  targetFingerprint: string;
  canonicalDeploymentId: string;
  inspectReviewedSource(
    directUrl: string,
  ): Promise<ReviewedMigrationSourceEvidence>;
  assertMaintenanceActive(): Promise<void>;
  createRehearsal(): Promise<NeonRehearsal>;
  deleteRehearsal(rehearsal: NeonRehearsal): Promise<void>;
  applyMigrations(directUrl: string): void;
  verifyUpToDate(directUrl: string): Promise<void>;
  verifyPostMigration(
    directUrl: string,
    source: AdminAccessBaseSnapshot,
  ): Promise<void>;
  onProductionAttempt?(): void;
};

export type ReviewedMigrationWorkflowResult = {
  rehearsalEvidenceDigest: string;
};

/**
 * Runs the exact reviewed migration only after an isolated clone succeeds and
 * the Production evidence is unchanged. Cleanup is a gate: an unverified
 * rehearsal branch never falls through to Production.
 */
export async function runReviewedMigrationApplication(
  dependencies: ReviewedMigrationWorkflowDependencies,
): Promise<ReviewedMigrationWorkflowResult> {
  assertWorkflowInputs(dependencies);
  await dependencies.assertMaintenanceActive();
  const initialProduction = await dependencies.inspectReviewedSource(
    dependencies.productionDirectUrl,
  );
  assertExpectedOperationDigest(dependencies, initialProduction);

  const rehearsal = await dependencies.createRehearsal();
  let rehearsalError: unknown;
  let rehearsalEvidenceDigest: string | undefined;
  try {
    const rehearsalSource = await dependencies.inspectReviewedSource(
      rehearsal.directUrl,
    );
    assertSameSourceEvidence(initialProduction, rehearsalSource);
    dependencies.applyMigrations(rehearsal.directUrl);
    await dependencies.verifyUpToDate(rehearsal.directUrl);
    await dependencies.verifyPostMigration(
      rehearsal.directUrl,
      rehearsalSource.source,
    );
    rehearsalEvidenceDigest = sha256(
      JSON.stringify({
        schemaVersion: 1,
        operationDigest: dependencies.expectedOperationDigest,
        reviewedPlanDigest: rehearsalSource.reviewedPlanDigest,
        sourceDigest: rehearsalSource.source.userRoleDigest,
        parentBranchId: rehearsal.parentBranchId,
        parentLsn: rehearsal.parentLsn,
        branchId: rehearsal.branchId,
        endpointId: rehearsal.endpointId,
      }),
    );
  } catch (error) {
    rehearsalError = error;
  }

  try {
    await dependencies.deleteRehearsal(rehearsal);
  } catch (cleanupError) {
    if (rehearsalError !== undefined) {
      throw new AggregateError(
        [rehearsalError, cleanupError],
        "The reviewed migration rehearsal and its cleanup both failed. Production was not changed.",
      );
    }
    throw new Error(
      "The reviewed migration rehearsal cleanup could not be verified. Production was not changed.",
      { cause: cleanupError },
    );
  }
  if (rehearsalError !== undefined) {
    throw rehearsalError;
  }
  if (rehearsalEvidenceDigest === undefined) {
    throw new Error(
      "The reviewed migration rehearsal did not produce verifiable evidence. Production was not changed.",
    );
  }

  await dependencies.assertMaintenanceActive();
  const executionProduction = await dependencies.inspectReviewedSource(
    dependencies.productionDirectUrl,
  );
  assertExpectedOperationDigest(dependencies, executionProduction);
  assertSameSourceEvidence(initialProduction, executionProduction);

  dependencies.onProductionAttempt?.();
  dependencies.applyMigrations(dependencies.productionDirectUrl);
  await dependencies.verifyUpToDate(dependencies.productionDirectUrl);
  await dependencies.verifyPostMigration(
    dependencies.productionDirectUrl,
    executionProduction.source,
  );
  return { rehearsalEvidenceDigest };
}

export function createReviewedMigrationOperationDigest(input: {
  gitCommitSha: string;
  targetFingerprint: string;
  reviewedPlanDigest: string;
  canonicalDeploymentId: string;
  source: AdminAccessBaseSnapshot;
}): string {
  if (
    !/^[0-9a-f]{40}$/u.test(input.gitCommitSha) ||
    !/^[0-9a-f]{64}$/u.test(input.targetFingerprint) ||
    !/^[0-9a-f]{64}$/u.test(input.reviewedPlanDigest) ||
    !/^dpl_[A-Za-z0-9]+$/u.test(input.canonicalDeploymentId) ||
    input.source.schemaVersion !== 1 ||
    !Number.isSafeInteger(input.source.userCount) ||
    input.source.userCount < 0 ||
    !/^[0-9a-f]{64}$/u.test(input.source.userRoleDigest)
  ) {
    throw new Error("The reviewed migration operation evidence is invalid.");
  }
  return sha256(
    JSON.stringify({
      schemaVersion: 1,
      batchId: "admin-access-v1",
      gitCommitSha: input.gitCommitSha,
      targetFingerprint: input.targetFingerprint,
      reviewedPlanDigest: input.reviewedPlanDigest,
      canonicalDeploymentId: input.canonicalDeploymentId,
      source: input.source,
    }),
  );
}

function assertExpectedOperationDigest(
  dependencies: Pick<
    ReviewedMigrationWorkflowDependencies,
    | "expectedOperationDigest"
    | "gitCommitSha"
    | "targetFingerprint"
    | "canonicalDeploymentId"
  >,
  evidence: ReviewedMigrationSourceEvidence,
): void {
  const actual = createReviewedMigrationOperationDigest({
    gitCommitSha: dependencies.gitCommitSha,
    targetFingerprint: dependencies.targetFingerprint,
    reviewedPlanDigest: evidence.reviewedPlanDigest,
    canonicalDeploymentId: dependencies.canonicalDeploymentId,
    source: evidence.source,
  });
  if (actual !== dependencies.expectedOperationDigest) {
    throw new Error(
      "The reviewed migration operation evidence changed after approval. Production was not changed.",
    );
  }
}

function assertSameSourceEvidence(
  expected: ReviewedMigrationSourceEvidence,
  actual: ReviewedMigrationSourceEvidence,
): void {
  if (
    actual.reviewedPlanDigest !== expected.reviewedPlanDigest ||
    actual.source.schemaVersion !== expected.source.schemaVersion ||
    actual.source.userCount !== expected.source.userCount ||
    actual.source.userRoleDigest !== expected.source.userRoleDigest
  ) {
    throw new Error(
      "The reviewed migration source differs from the approved Production snapshot. Production was not changed.",
    );
  }
}

function assertWorkflowInputs(
  dependencies: ReviewedMigrationWorkflowDependencies,
): void {
  if (
    !dependencies.productionDirectUrl ||
    !/^[0-9a-f]{64}$/u.test(dependencies.expectedOperationDigest) ||
    !/^[0-9a-f]{40}$/u.test(dependencies.gitCommitSha) ||
    !/^[0-9a-f]{64}$/u.test(dependencies.targetFingerprint) ||
    !/^dpl_[A-Za-z0-9]+$/u.test(dependencies.canonicalDeploymentId)
  ) {
    throw new Error("The reviewed migration workflow inputs are invalid.");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
