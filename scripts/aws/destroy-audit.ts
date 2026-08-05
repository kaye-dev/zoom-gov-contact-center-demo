import { readFileSync, writeFileSync } from "node:fs";

import { findStackOutput } from "./lib/aws";
import {
  awsGlobalArguments,
  resolveAwsRuntimeConfig,
  type AwsRuntimeConfig,
} from "./lib/config";
import { parseJson, runCommand } from "./lib/process";

type DestroyTargets = {
  databaseClusterIdentifier: string;
  secretIdentifiers: string[];
};

type StackResourceSummary = {
  PhysicalResourceId?: unknown;
  ResourceType?: unknown;
};

function asRecord(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${description} had an unexpected shape.`);
  }

  return value as Record<string, unknown>;
}

function runAws(
  config: AwsRuntimeConfig,
  serviceArguments: readonly string[],
): { status: number; stdout: string; stderr: string } {
  return runCommand("aws", [
    ...serviceArguments,
    ...awsGlobalArguments(config),
    "--output",
    "json",
  ]);
}

function captureTargets(config: AwsRuntimeConfig): DestroyTargets {
  const result = runAws(config, [
    "cloudformation",
    "list-stack-resources",
    "--stack-name",
    config.dataStackName,
  ]);

  if (result.status !== 0) {
    throw new Error(
      `Could not inspect DataStack resources before deletion.\n${result.stderr.trim()}`,
    );
  }

  const response = asRecord(
    parseJson(result.stdout, "CloudFormation resource response"),
    "CloudFormation resource response",
  );
  if (!Array.isArray(response.StackResourceSummaries)) {
    throw new Error("CloudFormation resource response did not contain resources.");
  }

  const resources = response.StackResourceSummaries as StackResourceSummary[];
  const physicalIds = (resourceType: string): string[] =>
    resources
      .filter((resource) => resource.ResourceType === resourceType)
      .map((resource) => resource.PhysicalResourceId)
      .filter(
        (physicalId): physicalId is string =>
          typeof physicalId === "string" && physicalId.trim() !== "",
      );
  const databaseClusters = physicalIds("AWS::RDS::DBCluster");
  const secrets = physicalIds("AWS::SecretsManager::Secret");

  if (databaseClusters.length !== 1) {
    throw new Error(
      `Expected one DataStack DB cluster, found ${databaseClusters.length}.`,
    );
  }
  if (secrets.length !== 2) {
    throw new Error(`Expected two DataStack secrets, found ${secrets.length}.`);
  }

  return {
    databaseClusterIdentifier: databaseClusters[0],
    secretIdentifiers: secrets,
  };
}

function parseTargets(value: unknown): DestroyTargets {
  const record = asRecord(value, "Destroy audit manifest");
  if (
    typeof record.databaseClusterIdentifier !== "string" ||
    !Array.isArray(record.secretIdentifiers) ||
    record.secretIdentifiers.length !== 2 ||
    !record.secretIdentifiers.every(
      (identifier) => typeof identifier === "string" && identifier.trim() !== "",
    )
  ) {
    throw new Error("Destroy audit manifest was invalid.");
  }

  return {
    databaseClusterIdentifier: record.databaseClusterIdentifier,
    secretIdentifiers: record.secretIdentifiers as string[],
  };
}

function isMissingError(stderr: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(stderr));
}

function verifyDatabaseDeleted(
  config: AwsRuntimeConfig,
  databaseClusterIdentifier: string,
): string[] {
  const residuals: string[] = [];
  const cluster = runAws(config, [
    "rds",
    "describe-db-clusters",
    "--db-cluster-identifier",
    databaseClusterIdentifier,
  ]);

  if (cluster.status === 0) {
    residuals.push(`DB cluster still exists: ${databaseClusterIdentifier}`);
  } else if (
    !isMissingError(cluster.stderr, [
      /DBClusterNotFound/i,
      /DBClusterNotFoundFault/i,
    ])
  ) {
    throw new Error(
      `Could not verify DB cluster deletion.\n${cluster.stderr.trim()}`,
    );
  } else {
    console.log(`Deleted DB cluster verified: ${databaseClusterIdentifier}`);
  }

  const snapshots = runAws(config, [
    "rds",
    "describe-db-cluster-snapshots",
    "--db-cluster-identifier",
    databaseClusterIdentifier,
  ]);
  if (snapshots.status !== 0) {
    throw new Error(
      `Could not inspect DB cluster snapshots.\n${snapshots.stderr.trim()}`,
    );
  }

  const snapshotResponse = asRecord(
    parseJson(snapshots.stdout, "RDS snapshot response"),
    "RDS snapshot response",
  );
  if (!Array.isArray(snapshotResponse.DBClusterSnapshots)) {
    throw new Error("RDS snapshot response did not contain DBClusterSnapshots.");
  }

  if (snapshotResponse.DBClusterSnapshots.length > 0) {
    residuals.push(
      `${snapshotResponse.DBClusterSnapshots.length} DB cluster snapshot(s) remain for ${databaseClusterIdentifier}`,
    );
  } else {
    console.log(`No DB cluster snapshots remain: ${databaseClusterIdentifier}`);
  }

  return residuals;
}

function verifySecretsDeleted(
  config: AwsRuntimeConfig,
  secretIdentifiers: readonly string[],
): string[] {
  const residuals: string[] = [];

  for (const secretIdentifier of secretIdentifiers) {
    const secret = runAws(config, [
      "secretsmanager",
      "describe-secret",
      "--secret-id",
      secretIdentifier,
    ]);

    if (secret.status === 0) {
      residuals.push(`Secret still exists: ${secretIdentifier}`);
    } else if (!isMissingError(secret.stderr, [/ResourceNotFoundException/i])) {
      throw new Error(
        `Could not verify secret deletion for '${secretIdentifier}'.\n${secret.stderr.trim()}`,
      );
    } else {
      console.log(`Deleted secret verified: ${secretIdentifier}`);
    }
  }

  return residuals;
}

function reportBootstrapAssets(config: AwsRuntimeConfig): void {
  const toolkit = runAws(config, [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    "CDKToolkit",
  ]);
  if (toolkit.status !== 0) {
    throw new Error(
      `Could not inspect the shared CDK bootstrap stack.\n${toolkit.stderr.trim()}`,
    );
  }

  const bucketName = findStackOutput(
    parseJson(toolkit.stdout, "CDK bootstrap stack response"),
    "BucketName",
  );
  if (!bucketName) {
    throw new Error("CDKToolkit did not contain the BucketName output.");
  }

  const objects = runAws(config, [
    "s3api",
    "list-objects-v2",
    "--bucket",
    bucketName,
  ]);
  if (objects.status !== 0) {
    throw new Error(
      `Could not inspect the shared CDK asset bucket '${bucketName}'.\n${objects.stderr.trim()}`,
    );
  }

  const objectResponse = asRecord(
    parseJson(objects.stdout, "CDK asset bucket response"),
    "CDK asset bucket response",
  );
  const contents = objectResponse.Contents;
  if (contents !== undefined && !Array.isArray(contents)) {
    throw new Error("CDK asset bucket response had an invalid Contents field.");
  }

  console.log(
    `Shared CDK asset bucket '${bucketName}' currently contains ${
      Array.isArray(contents) ? contents.length : 0
    } object(s).`,
  );
  console.log(
    "The bootstrap bucket may be shared by other CDK apps; no assets were deleted automatically.",
  );
}

function verifyTargets(config: AwsRuntimeConfig, targets: DestroyTargets): void {
  const residuals = [
    ...verifyDatabaseDeleted(config, targets.databaseClusterIdentifier),
    ...verifySecretsDeleted(config, targets.secretIdentifiers),
  ];

  reportBootstrapAssets(config);

  if (residuals.length > 0) {
    throw new Error(`Residual AWS resources found:\n- ${residuals.join("\n- ")}`);
  }

  console.log("No exact DataStack DB cluster, snapshot, or secret targets remain.");
}

function main(): void {
  const [command, manifestPath, ...extraArguments] = process.argv.slice(2);
  if (!manifestPath || extraArguments.length > 0) {
    throw new Error(
      "Usage: destroy-audit.ts capture|verify <manifest-path>",
    );
  }

  const config = resolveAwsRuntimeConfig();
  if (command === "capture") {
    writeFileSync(manifestPath, JSON.stringify(captureTargets(config)), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    console.log("Captured exact DB cluster and secret targets for post-destroy audit.");
    return;
  }

  if (command === "verify") {
    verifyTargets(
      config,
      parseTargets(parseJson(readFileSync(manifestPath, "utf8"), "Destroy audit manifest")),
    );
    return;
  }

  throw new Error("Destroy audit command must be 'capture' or 'verify'.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Destroy audit failed.");
  process.exitCode = 1;
}
