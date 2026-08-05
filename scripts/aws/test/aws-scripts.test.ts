import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { findStackOutput, getAwsIdentity } from "../lib/aws";
import { verifySeedAdminAuthentication } from "../lib/auth-smoke";
import {
  DEFAULT_AWS_REGION,
  resolveAwsRuntimeConfig,
} from "../lib/config";
import { isAffirmativeConfirmation } from "../lib/confirmation";
import {
  assertDirectFunctionUrlDenied,
  assertOacPostProbeResponse,
  endpointUrl,
  fetchWithTimeout,
  isHealthyPayload,
  OAC_POST_PROBE_BODY,
} from "../lib/http";
import {
  invokeOperationsLambda,
  parseOperationsResult,
  validateMigrationStatus,
} from "../lib/operations";
import { hasZeroCapacityDatapoint } from "../lib/metrics";
import { redactSecrets } from "../lib/process";
import { parseSeedAdminArguments } from "../lib/seed-input";

test("AWS config uses low-cost deployment defaults", () => {
  assert.deepEqual(resolveAwsRuntimeConfig({}), {
    region: DEFAULT_AWS_REGION,
    profile: undefined,
    expectedAccountId: undefined,
    dataStackName: "ZoomGovDemoDataStack",
    webStackName: "ZoomGovDemoWebStack",
  });
});

test("AWS config honors explicit account guard and stack names", () => {
  assert.deepEqual(
    resolveAwsRuntimeConfig({
      AWS_REGION: "ap-northeast-1",
      AWS_PROFILE: "demo",
      AWS_EXPECTED_ACCOUNT_ID: "123456789012",
      AWS_DATA_STACK_NAME: "Data",
      AWS_WEB_STACK_NAME: "Web",
    }),
    {
      region: "ap-northeast-1",
      profile: "demo",
      expectedAccountId: "123456789012",
      dataStackName: "Data",
      webStackName: "Web",
    },
  );

  assert.throws(
    () => resolveAwsRuntimeConfig({ AWS_REGION: "us-west-2" }),
    /fixed to 'ap-northeast-1'/,
  );
});

test("CloudFormation output lookup uses the exact output key", () => {
  const response = {
    Stacks: [
      {
        Outputs: [
          { OutputKey: "ApplicationUrl", OutputValue: "https://example.com" },
          { OutputKey: "FunctionName", OutputValue: "web-function" },
        ],
      },
    ],
  };

  assert.equal(
    findStackOutput(response, "ApplicationUrl"),
    "https://example.com",
  );
  assert.equal(findStackOutput(response, "Missing"), undefined);
});

test("operations result accepts only the agreed migration states", () => {
  const pending = parseOperationsResult({
    ok: true,
    action: "migration-status",
    status: "pending",
    pendingMigrations: ["20260805040000_example"],
  });

  assert.equal(validateMigrationStatus(pending), "pending");
  assert.throws(
    () =>
      validateMigrationStatus({
        ok: true,
        action: "migration-status",
        status: "pending",
        pendingMigrations: [],
      }),
    /no verified migration identifiers/,
  );
  assert.throws(
    () =>
      parseOperationsResult({
        ok: true,
        action: "migration-status",
        status: "drift",
      }),
    /unknown migration status/,
  );
  assert.throws(
    () =>
      validateMigrationStatus({
        ok: true,
        action: "migration-status",
        message: "connection failed",
      }),
    /neither 'up-to-date' nor a confirmed 'pending'/,
  );
});

test("seed argument parser rejects password arguments and normalizes email", () => {
  assert.deepEqual(
    parseSeedAdminArguments([
      "--email",
      "Admin@Example.COM",
      "--name",
      "Demo Admin",
    ]),
    { email: "admin@example.com", name: "Demo Admin" },
  );
  assert.throws(
    () =>
      parseSeedAdminArguments([
        "--email",
        "admin@example.com",
        "--name",
        "Admin",
        "--password",
        "do-not-accept",
      ]),
    /Password options are not supported/,
  );
});

test("health contract and endpoint resolution match the deployed API", () => {
  const baseUrl = new URL("https://example.cloudfront.net/");
  assert.equal(
    endpointUrl(baseUrl, "/api/health").toString(),
    "https://example.cloudfront.net/api/health",
  );
  assert.equal(
    isHealthyPayload({ status: "ok", database: { configured: true } }),
    true,
  );
  assert.equal(
    isHealthyPayload({ status: "ok", database: { configured: false } }),
    false,
  );
});

test("AWS smoke POST includes the exact payload hash", async () => {
  let capturedRequest: Request | undefined;
  const response = await fetchWithTimeout(
    new URL("https://example.cloudfront.net/api/oac-payload-probe"),
    1_000,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: OAC_POST_PROBE_BODY,
    },
    async (input, init) => {
      capturedRequest = new Request(input, init);
      return Response.json({ ok: true });
    },
  );

  assert.ok(capturedRequest);
  assert.equal(await capturedRequest.clone().text(), OAC_POST_PROBE_BODY);
  assert.equal(
    capturedRequest.headers.get("x-amz-content-sha256"),
    createHash("sha256").update(OAC_POST_PROBE_BODY).digest("hex"),
  );
  await assertOacPostProbeResponse(response);
});

test("direct Function URL must remain private", () => {
  assert.doesNotThrow(() =>
    assertDirectFunctionUrlDenied(new Response(null, { status: 403 })),
  );
  assert.throws(
    () => assertDirectFunctionUrlDenied(new Response(null, { status: 200 })),
    /expected 403/,
  );
});

test("Aurora pause verification requires an explicit zero-capacity datapoint", () => {
  assert.equal(
    hasZeroCapacityDatapoint({
      Datapoints: [{ Minimum: 0.5 }, { Minimum: 0 }],
    }),
    true,
  );
  assert.equal(
    hasZeroCapacityDatapoint({ Datapoints: [{ Minimum: 0.5 }] }),
    false,
  );
  assert.equal(hasZeroCapacityDatapoint({ Datapoints: [] }), false);
  assert.equal(hasZeroCapacityDatapoint(null), false);
});

test("seed verification signs in, checks admin access, and removes its temporary user", async () => {
  const visited: string[] = [];
  let verificationEmail = "";
  const baseUrl = new URL("https://example.cloudfront.net/");

  await verifySeedAdminAuthentication(
    baseUrl,
    "admin@example.com",
    "safe-test-password",
    async (url, _timeout, init = {}) => {
      const path = url.pathname;
      visited.push(`${init.method ?? "GET"} ${path}`);

      if (path === "/api/auth/sign-in/email") {
        return Response.json(
          { user: { email: "admin@example.com" } },
          { headers: { "set-cookie": "session=test-token; Path=/; HttpOnly" } },
        );
      }
      if (path === "/api/auth/get-session") {
        assert.equal(new Headers(init.headers).get("cookie"), "session=test-token");
        return Response.json({
          user: { email: "admin@example.com", role: "admin" },
        });
      }
      if (path === "/api/admin/password-reset-requests") {
        return Response.json({ requests: [] });
      }
      if (path === "/admin/users") {
        return new Response("<html><body>Admin users</body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (path === "/api/admin/users") {
        const body = JSON.parse(String(init.body)) as { email: string };
        verificationEmail = body.email;
        return Response.json(
          { user: { id: "verification-user", email: body.email } },
          { status: 201 },
        );
      }
      if (path === "/api/auth/admin/remove-user") {
        assert.deepEqual(JSON.parse(String(init.body)), {
          userId: "verification-user",
        });
        return Response.json({ success: true });
      }
      if (path === "/api/auth/sign-out") {
        return Response.json({ success: true });
      }

      return new Response(null, { status: 404 });
    },
  );

  assert.match(verificationEmail, /^aws-verification-.+@example\.invalid$/);
  assert.deepEqual(visited, [
    "POST /api/auth/sign-in/email",
    "GET /api/auth/get-session",
    "GET /api/admin/password-reset-requests",
    "GET /admin/users",
    "POST /api/admin/users",
    "POST /api/auth/admin/remove-user",
    "POST /api/auth/sign-out",
  ]);
});

test("secret redaction removes every occurrence", () => {
  assert.equal(
    redactSecrets("secret appeared twice: secret", ["secret"]),
    "[REDACTED] appeared twice: [REDACTED]",
  );
});

test("confirmation defaults to refusal unless y or yes is entered", () => {
  assert.equal(isAffirmativeConfirmation("y"), true);
  assert.equal(isAffirmativeConfirmation("YES"), true);
  assert.equal(isAffirmativeConfirmation(""), false);
  assert.equal(isAffirmativeConfirmation("n"), false);
  assert.equal(isAffirmativeConfirmation("later"), false);
});

test("Lambda invocation keeps seed password out of process arguments", () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "zoom-gov-aws-test-"));
  const awsStub = join(fixtureDirectory, "aws");
  const argumentsLog = join(fixtureDirectory, "arguments.log");
  const secret = "not-in-process-arguments";
  const originalPath = process.env.PATH;
  const originalArgumentsLog = process.env.AWS_STUB_ARGUMENTS_LOG;

  writeFileSync(
    awsStub,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${AWS_STUB_ARGUMENTS_LOG}"
if [[ "$1" == "cloudformation" ]]; then
  printf '%s\\n' '{"Stacks":[{"Outputs":[{"OutputKey":"OperationsFunctionName","OutputValue":"operations"}]}]}'
  exit 0
fi
response_path="\${!#}"
printf '%s' '{"ok":true,"action":"seed-admin","message":"seeded"}' > "\${response_path}"
printf '%s\\n' '{"StatusCode":200}'
`,
    { mode: 0o700 },
  );
  chmodSync(awsStub, 0o700);

  try {
    process.env.PATH = `${fixtureDirectory}:${originalPath ?? ""}`;
    process.env.AWS_STUB_ARGUMENTS_LOG = argumentsLog;

    const result = invokeOperationsLambda(resolveAwsRuntimeConfig({}), {
      action: "seed-admin",
      email: "admin@example.com",
      name: "Admin",
      password: secret,
    });

    assert.equal(result.ok, true);
    assert.doesNotMatch(readFileSync(argumentsLog, "utf8"), new RegExp(secret));
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalArgumentsLog === undefined) {
      delete process.env.AWS_STUB_ARGUMENTS_LOG;
    } else {
      process.env.AWS_STUB_ARGUMENTS_LOG = originalArgumentsLog;
    }
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
});

test("AWS identity guard rejects a different seed target account", () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "zoom-gov-account-test-"));
  const awsStub = join(fixtureDirectory, "aws");
  const originalPath = process.env.PATH;

  writeFileSync(
    awsStub,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' '{"Account":"123456789012","Arn":"arn:aws:iam::123456789012:user/demo","UserId":"AIDATEST"}'
`,
    { mode: 0o700 },
  );
  chmodSync(awsStub, 0o700);

  try {
    process.env.PATH = `${fixtureDirectory}:${originalPath ?? ""}`;
    assert.equal(
      getAwsIdentity(
        resolveAwsRuntimeConfig({
          AWS_EXPECTED_ACCOUNT_ID: "123456789012",
        }),
      ).account,
      "123456789012",
    );
    assert.throws(
      () =>
        getAwsIdentity(
          resolveAwsRuntimeConfig({
            AWS_EXPECTED_ACCOUNT_ID: "999999999999",
          }),
        ),
      /AWS account mismatch/,
    );
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
});

test("destroy audit captures exact targets and fails on a residual cluster", () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "zoom-gov-destroy-test-"));
  const awsStub = join(fixtureDirectory, "aws");
  const manifestPath = join(fixtureDirectory, "targets.json");
  const environment = {
    ...process.env,
    PATH: `${fixtureDirectory}:${process.env.PATH ?? ""}`,
  };

  writeFileSync(
    awsStub,
    `#!/usr/bin/env bash
set -euo pipefail
case "$1:$2" in
  cloudformation:list-stack-resources)
    printf '%s\\n' '{"StackResourceSummaries":[{"ResourceType":"AWS::RDS::DBCluster","PhysicalResourceId":"demo-cluster"},{"ResourceType":"AWS::SecretsManager::Secret","PhysicalResourceId":"secret-database"},{"ResourceType":"AWS::SecretsManager::Secret","PhysicalResourceId":"secret-auth"}]}'
    ;;
  rds:describe-db-clusters)
    if [[ "\${AWS_STUB_RESIDUAL:-0}" == "1" ]]; then
      printf '%s\\n' '{"DBClusters":[{"DBClusterIdentifier":"demo-cluster"}]}'
    else
      printf '%s\\n' 'DBClusterNotFoundFault: cluster not found' >&2
      exit 254
    fi
    ;;
  rds:describe-db-cluster-snapshots)
    printf '%s\\n' '{"DBClusterSnapshots":[]}'
    ;;
  secretsmanager:describe-secret)
    printf '%s\\n' 'ResourceNotFoundException: secret not found' >&2
    exit 254
    ;;
  cloudformation:describe-stacks)
    printf '%s\\n' '{"Stacks":[{"Outputs":[{"OutputKey":"BucketName","OutputValue":"cdk-assets"}]}]}'
    ;;
  s3api:list-objects-v2)
    printf '%s\\n' '{"Contents":[{"Key":"asset-one"},{"Key":"asset-two"}]}'
    ;;
  *)
    printf 'Unexpected AWS command: %s\\n' "$*" >&2
    exit 2
    ;;
esac
`,
    { mode: 0o700 },
  );
  chmodSync(awsStub, 0o700);

  try {
    const capture = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/aws/destroy-audit.ts",
        "capture",
        manifestPath,
      ],
      { cwd: process.cwd(), encoding: "utf8", env: environment },
    );
    assert.equal(capture.status, 0, capture.stderr);
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")), {
      databaseClusterIdentifier: "demo-cluster",
      secretIdentifiers: ["secret-database", "secret-auth"],
    });

    const verified = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/aws/destroy-audit.ts",
        "verify",
        manifestPath,
      ],
      { cwd: process.cwd(), encoding: "utf8", env: environment },
    );
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /No exact DataStack DB cluster/);
    assert.match(verified.stdout, /contains 2 object\(s\)/);

    const residual = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/aws/destroy-audit.ts",
        "verify",
        manifestPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...environment, AWS_STUB_RESIDUAL: "1" },
      },
    );
    assert.equal(residual.status, 1);
    assert.match(residual.stderr, /DB cluster still exists: demo-cluster/);
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
});

test("migration CLI reserves approval exit code only for confirmed pending status", () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "zoom-gov-migration-test-"));
  const awsStub = join(fixtureDirectory, "aws");
  const environment = {
    ...process.env,
    PATH: `${fixtureDirectory}:${process.env.PATH ?? ""}`,
  };

  writeFileSync(
    awsStub,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1:$2" == "cloudformation:describe-stacks" ]]; then
  printf '%s\\n' '{"Stacks":[{"Outputs":[{"OutputKey":"OperationsFunctionName","OutputValue":"operations"}]}]}'
  exit 0
fi
if [[ "$1:$2" != "lambda:invoke" ]]; then
  printf 'Unexpected AWS command: %s\\n' "$*" >&2
  exit 2
fi
response_path="\${!#}"
case "\${AWS_STUB_MIGRATION_STATUS:-up-to-date}" in
  up-to-date)
    printf '%s' '{"ok":true,"action":"migration-status","status":"up-to-date"}' > "\${response_path}"
    ;;
  pending)
    printf '%s' '{"ok":true,"action":"migration-status","status":"pending","pendingMigrations":["20260805040000_example"]}' > "\${response_path}"
    ;;
  error)
    printf '%s' '{"ok":false,"action":"migration-status","message":"Unsafe migration state detected: drift"}' > "\${response_path}"
    ;;
  connection)
    printf '%s' '{"ok":false,"action":"migration-status","message":"Database connection failed"}' > "\${response_path}"
    ;;
esac
printf '%s\\n' '{"StatusCode":200}'
`,
    { mode: 0o700 },
  );
  chmodSync(awsStub, 0o700);

  const runStatus = (status: string) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/aws/operations.ts",
        "migration-status",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...environment, AWS_STUB_MIGRATION_STATUS: status },
      },
    );

  try {
    const upToDate = runStatus("up-to-date");
    assert.equal(upToDate.status, 0, upToDate.stderr);
    assert.match(upToDate.stdout, /up to date/);

    const pending = runStatus("pending");
    assert.equal(pending.status, 10);
    assert.match(pending.stderr, /Pending Prisma migrations/);
    assert.match(pending.stderr, /20260805040000_example/);

    const unsafe = runStatus("error");
    assert.equal(unsafe.status, 1);
    assert.match(unsafe.stderr, /Unsafe migration state detected: drift/);

    const connection = runStatus("connection");
    assert.equal(connection.status, 1);
    assert.match(connection.stderr, /Database connection failed/);
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
});
