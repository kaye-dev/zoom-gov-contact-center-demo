import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  assertCommandSucceeded,
  type CommandResult,
  type CommandRunner,
} from "./process";

export const AWS_CLEANUP_ACCOUNT = "686112929630";
export const AWS_CLEANUP_REGION = "ap-northeast-1";
export const AWS_DATA_STACK = "ZoomGovDemoDataStack";
export const AWS_WEB_STACK = "ZoomGovDemoWebStack";
export const AWS_TOOLKIT_STACK = "CDKToolkit";

export type VersionedObject = {
  key: string;
  versionId: string;
};

export type AwsCleanupPlan = {
  account: string;
  principal: string;
  region: string;
  dataStackStatus: string;
  toolkitStackStatus: string;
  bootstrapBucket: string;
  assetVersions: VersionedObject[];
  toolkitResources: string[];
  ecrRepositories: string[];
  kmsKeyId?: string;
  kmsAlias?: string;
  hash: string;
};

export function captureAwsCleanupPlan(
  runner: CommandRunner,
  profile: string | undefined = process.env.AWS_PROFILE,
): AwsCleanupPlan {
  const identity = runAwsJson(runner, profile, [
    "sts",
    "get-caller-identity",
  ]);
  const account = readString(identity, "Account", "AWS identity account");
  const principal = readString(identity, "Arn", "AWS identity ARN");
  if (account !== AWS_CLEANUP_ACCOUNT) {
    throw new Error(
      `AWS account mismatch: expected ${AWS_CLEANUP_ACCOUNT}, received ${account}.`,
    );
  }

  const stackListing = runAwsJson(runner, profile, [
    "cloudformation",
    "list-stacks",
  ]);
  const stackSummaries = readArray(
    stackListing,
    "StackSummaries",
    "CloudFormation stack summaries",
  );
  const activeStackNames = stackSummaries
    .filter(
      (summary) =>
        isRecord(summary) && summary.StackStatus !== "DELETE_COMPLETE",
    )
    .map((summary) =>
      isRecord(summary) && typeof summary.StackName === "string"
        ? summary.StackName
        : "[invalid-stack-record]",
    )
    .sort();
  const expectedActiveStacks = [AWS_DATA_STACK, AWS_TOOLKIT_STACK].sort();
  if (JSON.stringify(activeStackNames) !== JSON.stringify(expectedActiveStacks)) {
    throw new Error(
      `Unexpected active CloudFormation stacks: ${activeStackNames.join(", ") || "none"}.`,
    );
  }
  const webStackActive = stackSummaries.some(
    (summary) =>
      isRecord(summary) &&
      summary.StackName === AWS_WEB_STACK &&
      summary.StackStatus !== "DELETE_COMPLETE",
  );
  if (webStackActive) {
    throw new Error(`${AWS_WEB_STACK} is not DELETE_COMPLETE/absent.`);
  }

  const dataStack = describeStack(runner, profile, AWS_DATA_STACK);
  const dataStackStatus = readString(
    dataStack,
    "StackStatus",
    `${AWS_DATA_STACK} status`,
  );
  if (dataStackStatus !== "ROLLBACK_COMPLETE") {
    throw new Error(
      `${AWS_DATA_STACK} must be ROLLBACK_COMPLETE, not ${dataStackStatus}.`,
    );
  }
  const dataResources = runAwsJson(runner, profile, [
    "cloudformation",
    "list-stack-resources",
    "--stack-name",
    AWS_DATA_STACK,
  ]);
  const summaries = readArray(
    dataResources,
    "StackResourceSummaries",
    "DataStack resources",
  );
  const unexpectedResources = summaries.filter((resource) => {
    if (!isRecord(resource)) {
      return true;
    }
    return resource.ResourceStatus !== "DELETE_COMPLETE";
  });
  if (unexpectedResources.length > 0) {
    throw new Error(
      "DataStack contains an application resource that is not DELETE_COMPLETE; no AWS deletion was started.",
    );
  }

  const toolkitStack = describeStack(runner, profile, AWS_TOOLKIT_STACK);
  const toolkitStackStatus = readString(
    toolkitStack,
    "StackStatus",
    `${AWS_TOOLKIT_STACK} status`,
  );
  if (!/^(?:CREATE|UPDATE)_COMPLETE$/.test(toolkitStackStatus)) {
    throw new Error(
      `${AWS_TOOLKIT_STACK} is in unexpected state ${toolkitStackStatus}.`,
    );
  }
  const toolkitResourceResponse = runAwsJson(runner, profile, [
    "cloudformation",
    "list-stack-resources",
    "--stack-name",
    AWS_TOOLKIT_STACK,
  ]);
  const toolkitResourceRecords = readArray(
    toolkitResourceResponse,
    "StackResourceSummaries",
    "CDKToolkit resources",
  ).map((resource) => {
    if (
      !isRecord(resource) ||
      typeof resource.LogicalResourceId !== "string" ||
      typeof resource.ResourceType !== "string" ||
      typeof resource.PhysicalResourceId !== "string" ||
      !/^(?:CREATE|UPDATE)_COMPLETE$/.test(String(resource.ResourceStatus))
    ) {
      throw new Error("CDKToolkit contains an invalid or incomplete resource.");
    }
    return {
      logicalId: resource.LogicalResourceId,
      type: resource.ResourceType,
      id: resource.PhysicalResourceId,
    };
  });
  const toolkitKmsParameter = readStackParameter(
    toolkitStack,
    "FileAssetsBucketKmsKeyId",
  );
  const toolkitQualifier = readStackParameter(toolkitStack, "Qualifier");
  if (toolkitQualifier !== "hnb659fds") {
    throw new Error(
      `CDKToolkit qualifier must be exactly hnb659fds, not '${toolkitQualifier}'.`,
    );
  }
  validateToolkitResourceWhitelist(
    toolkitResourceRecords,
    toolkitKmsParameter,
  );
  const toolkitResources = toolkitResourceRecords
    .map((resource) => `${resource.logicalId}:${resource.type}:${resource.id}`)
    .sort();
  const outputs = readArray(toolkitStack, "Outputs", "CDKToolkit outputs");
  const bucketOutput = outputs.find(
    (output) => isRecord(output) && output.OutputKey === "BucketName",
  );
  if (!isRecord(bucketOutput) || typeof bucketOutput.OutputValue !== "string") {
    throw new Error("CDKToolkit BucketName output is missing.");
  }
  const bootstrapBucket = bucketOutput.OutputValue;
  if (!/^cdk-[a-z0-9]+-assets-686112929630-ap-northeast-1$/.test(bootstrapBucket)) {
    throw new Error(`Unexpected CDK bootstrap bucket '${bootstrapBucket}'.`);
  }
  if (
    !toolkitResourceRecords.some(
      (resource) =>
        resource.type === "AWS::S3::Bucket" && resource.id === bootstrapBucket,
    )
  ) {
    throw new Error("The CDK bucket is not owned by the inspected CDKToolkit stack.");
  }

  const versionsResult = runAwsJson(runner, profile, [
    "s3api",
    "list-object-versions",
    "--bucket",
    bootstrapBucket,
  ]);
  const deleteMarkers = optionalArray(versionsResult, "DeleteMarkers");
  if (deleteMarkers.length > 0) {
    throw new Error("The CDK bucket contains unexpected delete markers.");
  }
  const versions = optionalArray(versionsResult, "Versions").map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.Key !== "string" ||
      !entry.Key ||
      typeof entry.VersionId !== "string" ||
      !entry.VersionId
    ) {
      throw new Error("The CDK bucket returned an invalid object version.");
    }
    return { key: entry.Key, versionId: entry.VersionId };
  });
  if (versions.length !== 3) {
    throw new Error(
      `Expected exactly 3 CDK asset object versions, found ${versions.length}.`,
    );
  }
  if (new Set(versions.map((item) => `${item.key}\0${item.versionId}`)).size !== 3) {
    throw new Error("The CDK asset object-version list contains duplicates.");
  }

  const repositoryResponse = runAwsJson(runner, profile, [
    "ecr",
    "describe-repositories",
  ]);
  const allowedRepositories = new Set(
    toolkitResourceRecords
      .filter((resource) => resource.type === "AWS::ECR::Repository")
      .map((resource) => resource.id),
  );
  const ecrRepositories = optionalArray(repositoryResponse, "repositories")
    .map((repository) => {
      if (!isRecord(repository) || typeof repository.repositoryName !== "string") {
        throw new Error("ECR returned an invalid repository record.");
      }
      return repository.repositoryName;
    })
    .sort();
  if (ecrRepositories.some((name) => !allowedRepositories.has(name))) {
    throw new Error(
      `Unexpected ECR repository exists: ${ecrRepositories.filter((name) => !allowedRepositories.has(name)).join(", ")}`,
    );
  }
  for (const repository of ecrRepositories) {
    const images = runAwsJson(runner, profile, [
      "ecr",
      "describe-images",
      "--repository-name",
      repository,
    ]);
    if (optionalArray(images, "imageDetails").length > 0) {
      throw new Error(`ECR repository '${repository}' is not empty.`);
    }
  }

  assertOnlyToolkitScopedResources(
    runner,
    profile,
    toolkitResourceRecords,
  );

  const assetVersions = [...versions].sort((left, right) =>
    `${left.key}\0${left.versionId}`.localeCompare(
      `${right.key}\0${right.versionId}`,
    ),
  );
  const base = {
    account,
    principal,
    region: AWS_CLEANUP_REGION,
    dataStackStatus,
    toolkitStackStatus,
    bootstrapBucket,
    assetVersions,
    toolkitResources,
    ecrRepositories,
    kmsKeyId: toolkitResourceRecords.find(
      (resource) => resource.logicalId === "FileAssetsBucketEncryptionKey",
    )?.id,
    kmsAlias: toolkitResourceRecords.find(
      (resource) => resource.logicalId === "FileAssetsBucketEncryptionKeyAlias",
    )?.id,
  };
  return {
    ...base,
    hash: createHash("sha256").update(JSON.stringify(base)).digest("hex"),
  };
}

export function renderAwsCleanupPlan(plan: AwsCleanupPlan): string {
  return [
    "AWS cleanup target (irreversible):",
    `Account: ${plan.account}`,
    `Principal: ${plan.principal}`,
    `Region: ${plan.region}`,
    `${AWS_DATA_STACK}: ${plan.dataStackStatus} (stack record only)`,
    `${AWS_TOOLKIT_STACK}: ${plan.toolkitStackStatus}`,
    `Retained CDK bucket: ${plan.bootstrapBucket}`,
    `Confirmed asset object versions: ${plan.assetVersions.length}`,
    ...plan.assetVersions.map(
      (item, index) => `${index + 1}. s3://${plan.bootstrapBucket}/${item.key} version ${item.versionId}`,
    ),
    `Cleanup plan SHA-256: ${plan.hash}`,
    `CDKToolkit resources: ${plan.toolkitResources.length}`,
    ...plan.toolkitResources.map(
      (resource, index) => `  ${index + 1}. ${resource}`,
    ),
    `Empty ECR repositories owned by CDKToolkit: ${plan.ecrRepositories.join(", ") || "none"}`,
    `CDK KMS key scheduled for deletion: ${plan.kmsKeyId ?? "none (external/AWS-managed key)"}`,
    `CDK KMS alias: ${plan.kmsAlias ?? "none"}`,
    "AWS CLI profile and SSO configuration are not deletion targets.",
    "Database migrations are not reversible by this cleanup.",
  ].join("\n");
}

function assertOnlyToolkitScopedResources(
  runner: CommandRunner,
  profile: string | undefined,
  toolkitResources: readonly { logicalId: string; type: string; id: string }[],
): void {
  const allowedSsm = new Set(
    toolkitResources
      .filter((resource) => resource.type === "AWS::SSM::Parameter")
      .map((resource) => resource.id),
  );
  const allowedIam = new Set(
    toolkitResources
      .filter((resource) => resource.type.startsWith("AWS::IAM::"))
      .map((resource) => resource.id),
  );
  const allowedKms = new Set(
    toolkitResources
      .filter((resource) => resource.type.startsWith("AWS::KMS::"))
      .map((resource) => resource.id),
  );
  const parameters = optionalArray(
    runAwsJson(runner, profile, ["ssm", "describe-parameters"]),
    "Parameters",
  )
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.Name !== "string") {
        throw new Error("SSM returned an invalid parameter record.");
      }
      return entry.Name;
    })
    .filter((name) => /zoomgovdemo|cdk|hnb659fds/i.test(name));
  const roles = optionalArray(
    runAwsJson(runner, profile, ["iam", "list-roles"]),
    "Roles",
  )
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.RoleName !== "string") {
        throw new Error("IAM returned an invalid role record.");
      }
      return entry.RoleName;
    })
    .filter((name) => /zoomgovdemo|cdk|hnb659fds/i.test(name));
  const aliasRecords = optionalArray(
    runAwsJson(runner, profile, ["kms", "list-aliases"]),
    "Aliases",
  ).filter(
    (entry) =>
      !isRecord(entry) ||
      typeof entry.AliasName !== "string" ||
      /zoomgovdemo|cdk|hnb659fds/i.test(entry.AliasName),
  );
  const aliases = aliasRecords.map((entry) =>
    isRecord(entry) && typeof entry.AliasName === "string"
      ? entry.AliasName
      : "[invalid]",
  );
  const keyId = toolkitResources.find(
    (resource) => resource.logicalId === "FileAssetsBucketEncryptionKey",
  )?.id;
  const alias = toolkitResources.find(
    (resource) => resource.logicalId === "FileAssetsBucketEncryptionKeyAlias",
  )?.id;
  if (keyId && alias) {
    const aliasRecord = aliasRecords.find(
      (entry) => isRecord(entry) && entry.AliasName === alias,
    );
    if (!isRecord(aliasRecord) || aliasRecord.TargetKeyId !== keyId) {
      throw new Error("The CDK KMS alias does not target the stack-owned key.");
    }
    const key = runAwsJson(runner, profile, [
      "kms",
      "describe-key",
      "--key-id",
      keyId,
    ]);
    const metadata = isRecord(key.KeyMetadata) ? key.KeyMetadata : undefined;
    if (
      metadata?.KeyId !== keyId ||
      metadata.KeyManager !== "CUSTOMER" ||
      metadata.KeyState !== "Enabled" ||
      typeof metadata.Arn !== "string" ||
      !metadata.Arn.startsWith(
        `arn:aws:kms:${AWS_CLEANUP_REGION}:${AWS_CLEANUP_ACCOUNT}:key/`,
      )
    ) {
      throw new Error("The CDK KMS key identity/state could not be proven.");
    }
  }
  const unexpected = [
    ...parameters.filter((name) => !allowedSsm.has(name)),
    ...roles.filter((name) => !allowedIam.has(name)),
    ...aliases.filter((name) => !allowedKms.has(name)),
  ];
  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected scoped SSM/IAM/KMS resources exist: ${unexpected.join(", ")}`,
    );
  }
}

function validateToolkitResourceWhitelist(
  resources: readonly { logicalId: string; type: string; id: string }[],
  kmsParameter: string,
): void {
  const expected = new Map<string, string>([
    ["StagingBucket", "AWS::S3::Bucket"],
    ["StagingBucketPolicy", "AWS::S3::BucketPolicy"],
    ["ContainerAssetsRepository", "AWS::ECR::Repository"],
    ["FilePublishingRole", "AWS::IAM::Role"],
    ["ImagePublishingRole", "AWS::IAM::Role"],
    ["LookupRole", "AWS::IAM::Role"],
    ["FilePublishingRoleDefaultPolicy", "AWS::IAM::Policy"],
    ["ImagePublishingRoleDefaultPolicy", "AWS::IAM::Policy"],
    ["DeploymentActionRole", "AWS::IAM::Role"],
    ["CloudFormationExecutionRole", "AWS::IAM::Role"],
    ["CdkBootstrapVersion", "AWS::SSM::Parameter"],
  ]);
  if (kmsParameter === "") {
    expected.set("FileAssetsBucketEncryptionKey", "AWS::KMS::Key");
    expected.set("FileAssetsBucketEncryptionKeyAlias", "AWS::KMS::Alias");
  }
  const actual = new Map(resources.map((resource) => [resource.logicalId, resource.type]));
  const unexpected = resources.filter(
    (resource) => expected.get(resource.logicalId) !== resource.type,
  );
  const missing = [...expected].filter(
    ([logicalId, type]) => actual.get(logicalId) !== type,
  );
  if (
    unexpected.length > 0 ||
    missing.length > 0 ||
    actual.size !== resources.length
  ) {
    throw new Error(
      [
        `CDKToolkit does not exactly match the reviewed modern bootstrap resource set (KMS parameter '${kmsParameter || "create-new-key"}').`,
        `Unexpected: ${unexpected.map((item) => `${item.logicalId}:${item.type}:${item.id}`).join(", ") || "none"}`,
        `Missing: ${missing.map(([logicalId, type]) => `${logicalId}:${type}`).join(", ") || "none"}`,
      ].join("\n"),
    );
  }
  for (const resource of resources) {
    const exactIds = new Map<string, string>([
      [
        "StagingBucket",
        "cdk-hnb659fds-assets-686112929630-ap-northeast-1",
      ],
      [
        "StagingBucketPolicy",
        "cdk-hnb659fds-assets-686112929630-ap-northeast-1",
      ],
      [
        "ContainerAssetsRepository",
        "cdk-hnb659fds-container-assets-686112929630-ap-northeast-1",
      ],
      [
        "FilePublishingRole",
        "cdk-hnb659fds-file-publishing-role-686112929630-ap-northeast-1",
      ],
      [
        "ImagePublishingRole",
        "cdk-hnb659fds-image-publishing-role-686112929630-ap-northeast-1",
      ],
      [
        "LookupRole",
        "cdk-hnb659fds-lookup-role-686112929630-ap-northeast-1",
      ],
      [
        "FilePublishingRoleDefaultPolicy",
        "cdk-hnb659fds-file-publishing-role-default-policy-686112929630-ap-northeast-1",
      ],
      [
        "ImagePublishingRoleDefaultPolicy",
        "cdk-hnb659fds-image-publishing-role-default-policy-686112929630-ap-northeast-1",
      ],
      [
        "DeploymentActionRole",
        "cdk-hnb659fds-deploy-role-686112929630-ap-northeast-1",
      ],
      [
        "CloudFormationExecutionRole",
        "cdk-hnb659fds-cfn-exec-role-686112929630-ap-northeast-1",
      ],
      ["CdkBootstrapVersion", "/cdk-bootstrap/hnb659fds/version"],
      ["FileAssetsBucketEncryptionKeyAlias", "alias/cdk-hnb659fds-assets-key"],
    ]);
    const exactId = exactIds.get(resource.logicalId);
    if (exactId !== undefined && resource.id !== exactId) {
      throw new Error(
        `Unexpected CDKToolkit physical ID for ${resource.logicalId}: '${resource.id}'.`,
      );
    }
    if (
      resource.logicalId === "FileAssetsBucketEncryptionKey" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        resource.id,
      )
    ) {
      throw new Error(`Unexpected CDK KMS key ID '${resource.id}'.`);
    }
    if (
      resource.type === "AWS::ECR::Repository" &&
      !/^cdk-hnb659fds-container-assets-686112929630-ap-northeast-1$/.test(
        resource.id,
      )
    ) {
      throw new Error(`Unexpected CDK ECR repository '${resource.id}'.`);
    }
  }
}

export function executeAwsCleanup(
  runner: CommandRunner,
  plan: AwsCleanupPlan,
  profile: string | undefined = process.env.AWS_PROFILE,
): void {
  const { hash, ...unsignedPlan } = plan;
  if (
    createHash("sha256").update(JSON.stringify(unsignedPlan)).digest("hex") !==
      hash ||
    plan.account !== AWS_CLEANUP_ACCOUNT ||
    plan.region !== AWS_CLEANUP_REGION ||
    plan.assetVersions.length !== 3
  ) {
    throw new Error("AWS cleanup plan invariants are invalid.");
  }

  runAwsChecked(runner, profile, [
    "cloudformation",
    "delete-stack",
    "--stack-name",
    AWS_DATA_STACK,
  ]);
  runAwsChecked(runner, profile, [
    "cloudformation",
    "wait",
    "stack-delete-complete",
    "--stack-name",
    AWS_DATA_STACK,
  ]);

  for (const object of plan.assetVersions) {
    if (!object.key || !object.versionId) {
      throw new Error("Refusing to delete an empty S3 key or version ID.");
    }
    runAwsChecked(runner, profile, [
      "s3api",
      "delete-object",
      "--bucket",
      plan.bootstrapBucket,
      "--key",
      object.key,
      "--version-id",
      object.versionId,
    ]);
  }

  const bucketAfterObjects = runAwsJson(runner, profile, [
    "s3api",
    "list-object-versions",
    "--bucket",
    plan.bootstrapBucket,
  ]);
  if (
    optionalArray(bucketAfterObjects, "Versions").length > 0 ||
    optionalArray(bucketAfterObjects, "DeleteMarkers").length > 0
  ) {
    throw new Error(
      "The CDK bucket is not empty after deleting the confirmed versions. Cleanup stopped before deleting CDKToolkit.",
    );
  }

  runAwsChecked(runner, profile, [
    "cloudformation",
    "delete-stack",
    "--stack-name",
    AWS_TOOLKIT_STACK,
  ]);
  runAwsChecked(runner, profile, [
    "cloudformation",
    "wait",
    "stack-delete-complete",
    "--stack-name",
    AWS_TOOLKIT_STACK,
  ]);

  const retainedBucketContents = runAwsJson(runner, profile, [
    "s3api",
    "list-object-versions",
    "--bucket",
    plan.bootstrapBucket,
  ]);
  if (
    optionalArray(retainedBucketContents, "Versions").length > 0 ||
    optionalArray(retainedBucketContents, "DeleteMarkers").length > 0
  ) {
    throw new Error("The retained CDK bucket is no longer empty; it was not deleted.");
  }
  runAwsChecked(runner, profile, [
    "s3api",
    "delete-bucket",
    "--bucket",
    plan.bootstrapBucket,
  ]);

  assertAwsCleanupComplete(runner, plan, profile);
}

export function assertAwsCleanupComplete(
  runner: CommandRunner,
  plan: AwsCleanupPlan,
  profile: string | undefined = process.env.AWS_PROFILE,
): void {
  for (const stack of [AWS_DATA_STACK, AWS_TOOLKIT_STACK]) {
    const result = runAws(runner, profile, [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stack,
    ]);
    if (result.status === 0 || !/does not exist|not exist/i.test(result.stderr)) {
      throw new Error(`AWS stack record still exists or could not be disproved: ${stack}`);
    }
  }
  const bucket = runAws(runner, profile, [
    "s3api",
    "head-bucket",
    "--bucket",
    plan.bootstrapBucket,
  ]);
  if (bucket.status === 0 || !/404|not found|nosuchbucket/i.test(bucket.stderr)) {
    throw new Error("The retained CDK bucket still exists or could not be disproved.");
  }

  const repositories = runAwsJson(runner, profile, [
    "ecr",
    "describe-repositories",
  ]);
  const residualRepositories = optionalArray(repositories, "repositories").filter(
    (repository) => {
      if (!isRecord(repository) || typeof repository.repositoryName !== "string") {
        return true;
      }
      return /zoomgovdemo|cdk-|hnb659fds/i.test(repository.repositoryName);
    },
  );
  const parameters = runAwsJson(runner, profile, [
    "ssm",
    "describe-parameters",
  ]);
  const residualParameters = optionalArray(parameters, "Parameters").filter(
    (parameter) =>
      !isRecord(parameter) ||
      typeof parameter.Name !== "string" ||
      /zoomgovdemo|cdk|hnb659fds/i.test(parameter.Name),
  );
  const roles = runAwsJson(runner, profile, ["iam", "list-roles"]);
  const residualRoles = optionalArray(roles, "Roles").filter(
    (role) =>
      !isRecord(role) ||
      typeof role.RoleName !== "string" ||
      /zoomgovdemo|cdk|hnb659fds/i.test(role.RoleName),
  );
  const aliases = runAwsJson(runner, profile, ["kms", "list-aliases"]);
  const residualAliases = optionalArray(aliases, "Aliases").filter(
    (alias) =>
      !isRecord(alias) ||
      typeof alias.AliasName !== "string" ||
      /zoomgovdemo|cdk|hnb659fds/i.test(alias.AliasName),
  );

  if (plan.kmsKeyId) {
    const key = runAwsJson(runner, profile, [
      "kms",
      "describe-key",
      "--key-id",
      plan.kmsKeyId,
    ]);
    const metadata = isRecord(key.KeyMetadata) ? key.KeyMetadata : undefined;
    if (
      metadata?.KeyId !== plan.kmsKeyId ||
      metadata.KeyState !== "PendingDeletion" ||
      (typeof metadata.DeletionDate !== "string" &&
        typeof metadata.DeletionDate !== "number")
    ) {
      throw new Error(
        `CDK KMS key '${plan.kmsKeyId}' was not verified as PendingDeletion with a scheduled deletion date. No stronger deletion was attempted.`,
      );
    }
  }

  const residuals = [
    ["ECR", residualRepositories],
    ["SSM", residualParameters],
    ["IAM", residualRoles],
    ["KMS", residualAliases],
  ] as const;
  const found = residuals.filter(([, values]) => values.length > 0);
  if (found.length > 0) {
    throw new Error(
      `Unexpected AWS residuals remain (${found.map(([name, values]) => `${name}:${values.length}`).join(", ")}). No stronger deletion was attempted.`,
    );
  }
}

export function removeLocalAwsArtifacts(projectRoot: string): string[] {
  const targets = inspectLocalAwsArtifacts(projectRoot);
  for (const target of targets) {
    rmSync(target, { recursive: true, force: false });
  }
  return targets;
}

export function inspectLocalAwsArtifacts(projectRoot: string): string[] {
  const targets = [join(projectRoot, ".aws-artifacts"), join(projectRoot, "cdk.out")];
  const existingTargets = targets.filter(pathExistsWithoutFollowingLinks);
  const resolvedRoot = realpathSync(projectRoot);
  for (const target of existingTargets) {
    const parent = realpathSync(resolve(target, ".."));
    const targetStat = lstatSync(target);
    if (
      parent !== resolvedRoot ||
      targetStat.isSymbolicLink() ||
      !targetStat.isDirectory()
    ) {
      throw new Error(`Refusing to remove unexpected AWS artifact path '${target}'.`);
    }
    validateArtifactTree(target, target);
  }
  return existingTargets;
}

function pathExistsWithoutFollowingLinks(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function validateArtifactTree(root: string, current: string): void {
  const stat = lstatSync(current);
  if (stat.isSymbolicLink()) {
    const link = readlinkSync(current);
    if (isAbsolute(link)) {
      throw new Error(`AWS artifact tree contains an absolute symlink: ${current}`);
    }
    const destination = resolve(current, "..", link);
    const relativePath = relative(root, destination);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(`AWS artifact symlink escapes its target directory: ${current}`);
    }
    return;
  }
  if (!stat.isDirectory()) {
    if (stat.isFile()) {
      return;
    }
    throw new Error(
      `AWS artifact tree contains an unsupported file type: ${current}`,
    );
  }
  for (const entry of readdirSync(current)) {
    validateArtifactTree(root, join(current, entry));
  }
}

function describeStack(
  runner: CommandRunner,
  profile: string | undefined,
  name: string,
): Record<string, unknown> {
  const value = runAwsJson(runner, profile, [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    name,
  ]);
  const stacks = readArray(value, "Stacks", `${name} stacks`);
  if (stacks.length !== 1 || !isRecord(stacks[0])) {
    throw new Error(`Expected exactly one stack record for ${name}.`);
  }
  return stacks[0];
}

function readStackParameter(
  stack: Record<string, unknown>,
  key: string,
): string {
  const parameters = readArray(stack, "Parameters", "CDKToolkit parameters");
  const parameter = parameters.find(
    (candidate) => isRecord(candidate) && candidate.ParameterKey === key,
  );
  if (!isRecord(parameter) || typeof parameter.ParameterValue !== "string") {
    throw new Error(`CDKToolkit parameter '${key}' is missing.`);
  }
  return parameter.ParameterValue;
}

function runAwsJson(
  runner: CommandRunner,
  profile: string | undefined,
  arguments_: readonly string[],
): Record<string, unknown> {
  const result = runAws(runner, profile, arguments_);
  assertCommandSucceeded(result, `aws ${arguments_.slice(0, 2).join(" ")}`);
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new Error(`aws ${arguments_.slice(0, 2).join(" ")} returned invalid JSON.`);
  }
}

function runAwsChecked(
  runner: CommandRunner,
  profile: string | undefined,
  arguments_: readonly string[],
): void {
  assertCommandSucceeded(
    runAws(runner, profile, arguments_),
    `aws ${arguments_.slice(0, 2).join(" ")}`,
  );
}

function runAws(
  runner: CommandRunner,
  profile: string | undefined,
  arguments_: readonly string[],
): CommandResult {
  return runner.run(
    "aws",
    [
      ...arguments_,
      "--region",
      AWS_CLEANUP_REGION,
      "--output",
      "json",
      "--no-cli-pager",
      ...(profile ? ["--profile", profile] : []),
    ],
    { env: { ...process.env, AWS_PAGER: "" } },
  );
}

function readString(
  value: Record<string, unknown>,
  key: string,
  description: string,
): string {
  if (typeof value[key] !== "string" || !value[key]) {
    throw new Error(`${description} is missing.`);
  }
  return value[key];
}

function readArray(
  value: Record<string, unknown>,
  key: string,
  description: string,
): unknown[] {
  if (!Array.isArray(value[key])) {
    throw new Error(`${description} is missing.`);
  }
  return value[key];
}

function optionalArray(value: Record<string, unknown>, key: string): unknown[] {
  const candidate = value[key];
  if (candidate === undefined) {
    return [];
  }
  if (!Array.isArray(candidate)) {
    throw new Error(`AWS response field '${key}' is not an array.`);
  }
  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
