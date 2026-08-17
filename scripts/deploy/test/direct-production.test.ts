import assert from "node:assert/strict";
import { test } from "node:test";

import type { StoredDeploymentConfig } from "../lib/aws-config";
import { loadNeonConnectionContext } from "../lib/neon-api";
import {
  createMigrationPlan,
  findUnsafeExpandCompatibleStatements,
  readReviewedMigrationChain,
} from "../lib/migrations";
import type { CommandRunner } from "../lib/process";
import {
  assertExistingProductionAuthSecret,
  assertProductionEnvironmentReady,
  clearAwsCredentialEnvironment,
  createDeploymentTargetFingerprint,
  createDirectProductionDeployArguments,
  createSecretFreeBuildEnvironment,
  missingDeploymentParametersMutationMessage,
  parseProductionEnvironmentAudit,
  readExpectedPreviousDeploymentId,
  runCanonicalDeploymentBoundSmoke,
  shouldRequireLocalMigrationApproval,
  validateCanonicalDeploymentResult,
  validateProductionDeploymentEvidence,
} from "../main";

const neonConfig = {
  projectId: "green-star-22081727",
  projectName: "zoom-gov-contact-center-demo",
  branchId: "br-production",
  databaseName: "app",
  roleName: "app_owner",
  regionId: "aws-ap-southeast-1",
  expectedPlan: "free",
} as const;

const storedConfig: StoredDeploymentConfig = {
  schemaVersion: 1,
  policyVersion: "demo-v1",
  aws: { accountId: "123456789012", region: "ap-northeast-1" },
  vercel: {
    orgId: "team_abc123",
    projectId: "prj_abc123",
    projectName: "zoom-gov-contact-center-demo",
    canonicalOrigin: "https://example.test",
    expectedPlan: "hobby",
  },
  neon: {
    projectId: neonConfig.projectId,
    projectName: neonConfig.projectName,
    branchId: neonConfig.branchId,
    databaseName: neonConfig.databaseName,
    roleName: neonConfig.roleName,
    regionId: neonConfig.regionId,
    expectedPlan: neonConfig.expectedPlan,
  },
  admin: { email: "admin@example.test" },
  kmsKeyArn:
    "arn:aws:kms:ap-northeast-1:123456789012:key/11111111-2222-3333-4444-555555555555",
  secretVersions: { vercelToken: 1, neonApiKey: 2, adminPassword: 3 },
};

function neonResponse(url: URL, ownerName: string = neonConfig.roleName): unknown {
  const projectPrefix = `/api/v2/projects/${neonConfig.projectId}`;
  if (url.pathname === projectPrefix) {
    return {
      project: {
        id: neonConfig.projectId,
        name: neonConfig.projectName,
        region_id: neonConfig.regionId,
        org_id: "org-production",
      },
    };
  }
  if (url.pathname === "/api/v2/organizations/org-production") {
    return { id: "org-production", plan: "free" };
  }
  if (url.pathname === `${projectPrefix}/branches/${neonConfig.branchId}`) {
    return {
      branch: {
        id: neonConfig.branchId,
        project_id: neonConfig.projectId,
      },
    };
  }
  if (
    url.pathname ===
    `${projectPrefix}/branches/${neonConfig.branchId}/databases/${neonConfig.databaseName}`
  ) {
    return {
      database: {
        branch_id: neonConfig.branchId,
        name: neonConfig.databaseName,
        owner_name: ownerName,
      },
    };
  }
  if (
    url.pathname ===
    `${projectPrefix}/branches/${neonConfig.branchId}/roles/${neonConfig.roleName}`
  ) {
    return {
      role: {
        branch_id: neonConfig.branchId,
        name: neonConfig.roleName,
      },
    };
  }
  if (url.pathname === `${projectPrefix}/endpoints`) {
    return {
      endpoints: [
        {
          id: "ep-production",
          project_id: neonConfig.projectId,
          branch_id: neonConfig.branchId,
          region_id: neonConfig.regionId,
          type: "read_write",
          current_state: "active",
          disabled: false,
          host: "ep-production.ap-southeast-1.aws.neon.tech",
        },
      ],
    };
  }
  if (url.pathname === `${projectPrefix}/connection_uri`) {
    const pooled = url.searchParams.get("pooled") === "true";
    assert.equal(url.searchParams.get("branch_id"), neonConfig.branchId);
    assert.equal(url.searchParams.get("endpoint_id"), "ep-production");
    assert.equal(url.searchParams.get("database_name"), neonConfig.databaseName);
    assert.equal(url.searchParams.get("role_name"), neonConfig.roleName);
    return {
      uri: `postgresql://${neonConfig.roleName}:p%40ss@ep-production${pooled ? "-pooler" : ""}.ap-southeast-1.aws.neon.tech/${neonConfig.databaseName}?sslmode=require`,
    };
  }
  throw new Error(`Unexpected Neon API request: ${url.pathname}`);
}

test("Neon REST validation proves every stored target and retrieves both dynamic URIs", async () => {
  const token = "synthetic-neon-api-key";
  const urls: URL[] = [];
  const request = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input));
    urls.push(url);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    assert.equal(url.href.includes(token), false);
    return Response.json(neonResponse(url));
  };

  const context = await loadNeonConnectionContext(
    neonConfig,
    token,
    request,
  );
  assert.equal(context.organizationId, "org-production");
  assert.equal(context.database.endpointId, "ep-production");
  assert.match(context.database.pooledHost, /-pooler\./u);
  assert.doesNotMatch(context.database.directHost, /-pooler\./u);
  assert.equal(urls.filter((url) => url.pathname.endsWith("connection_uri")).length, 2);
});

test("Neon REST target mismatches and error bodies fail closed without exposing secrets", async () => {
  await assert.rejects(
    loadNeonConnectionContext(
      neonConfig,
      "synthetic-neon-api-key",
      async (input) => {
        const url = new URL(String(input));
        return Response.json(neonResponse(url, "wrong_owner"));
      },
    ),
    /database does not match/u,
  );

  const secret = "synthetic-neon-api-key-never-log";
  await assert.rejects(
    loadNeonConnectionContext(
      neonConfig,
      secret,
      async () =>
        new Response(JSON.stringify({ detail: secret }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 403/u);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});

test("reviewed migration manifest exactly classifies the current SHA-verified chain", () => {
  const migrations = readReviewedMigrationChain(process.cwd());
  assert.deepEqual(
    migrations.map(({ name, classification }) => ({ name, classification })),
    [
      {
        name: "20260623105657_init",
        classification: "bootstrap-only",
      },
      {
        name: "20260804090000_add_site_settings",
        classification: "expand-compatible",
      },
      {
        name: "20260804150000_add_zoom_virtual_agent_web_tag",
        classification: "expand-compatible",
      },
      {
        name: "20260805040000_split_phone_and_chat_settings",
        classification: "destructive-reviewed",
      },
      {
        name: "20260816090000_add_site_maintenance_settings",
        classification: "expand-compatible",
      },
    ],
  );
});

test("expand-compatible SQL allowlist accepts only reviewed forward-compatible forms", () => {
  assert.deepEqual(
    findUnsafeExpandCompatibleStatements(`
      BEGIN;
      CREATE TYPE "PublicState" AS ENUM ('NEW', 'READY');
      CREATE TABLE "new_records" (
        "id" INTEGER NOT NULL,
        "state" "PublicState" NOT NULL,
        CONSTRAINT "new_records_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX "new_records_state_idx" ON "new_records"("state");
      INSERT INTO "new_records" ("id", "state") VALUES (1, 'NEW');
      ALTER TABLE "new_records"
        ADD CONSTRAINT "new_records_id_check" CHECK ("id" > 0);
      ALTER TABLE "existing_records" ADD COLUMN "optional_note" TEXT;
      ALTER TYPE "PublicState" ADD VALUE 'ARCHIVED' AFTER 'READY';
      COMMIT;
    `),
    [],
  );
});

test("expand-compatible SQL allowlist rejects data changes and unsafe or unknown DDL", () => {
  for (const sql of [
    'ALTER TABLE "existing_records" ALTER COLUMN "name" SET NOT NULL;',
    'ALTER TABLE "existing_records" ADD COLUMN "name" TEXT NOT NULL;',
    'ALTER TABLE "existing_records" ADD COLUMN "name" TEXT DEFAULT \'x\';',
    'ALTER TABLE "existing_records" ADD CONSTRAINT "existing_check" CHECK (true);',
    'CREATE INDEX "existing_name_idx" ON "existing_records"("name");',
    'INSERT INTO "existing_records" ("name") VALUES (\'x\');',
    'UPDATE "existing_records" SET "name" = \'x\';',
    'DELETE FROM "existing_records";',
    'DROP TABLE "existing_records";',
    'VACUUM "existing_records";',
  ]) {
    const unsafe = findUnsafeExpandCompatibleStatements(sql);
    assert.equal(unsafe.length, 1, sql);
    assert.match(unsafe[0] ?? "", /;$/u, sql);
  }
});

test("non-expand migration classifications block an existing database", async () => {
  const migrations = readReviewedMigrationChain(process.cwd());
  const applied = migrations.slice(0, 3).map((migration) => ({
    name: migration.name,
    checksum: migration.hash,
    finished: true,
    rolledBack: false,
    logs: null,
  }));
  const runner: CommandRunner = {
    run(_command, arguments_) {
      return arguments_.includes("status")
        ? {
            status: 1,
            stdout: "The following migrations have not yet been applied",
            stderr: "",
          }
        : {
            status: 2,
            stdout: "DROP TABLE existing_data;",
            stderr: "",
          };
    },
  };
  await assert.rejects(
    createMigrationPlan({
      projectRoot: process.cwd(),
      directUrl: "postgresql://redacted.invalid/database",
      runner,
      inspect: async () => ({
        migrationsTableExists: true,
        migrations: applied,
        userTables: ["existing_data"],
        userObjects: ["table:existing_data"],
        tablesWithData: ["existing_data"],
      }),
    }),
    /Only reviewed expand-compatible migrations/u,
  );
});

test("Production deploy arguments directly assign domains and carry immutable metadata", () => {
  const link = { orgId: "team_abc123", projectId: "prj_abc123" };
  const commitSha = "a".repeat(40);
  const arguments_ = createDirectProductionDeployArguments(
    link,
    commitSha,
    "123456789",
  );
  assert.deepEqual(arguments_.slice(0, 4), ["deploy", "--prod", "--yes", "--json"]);
  assert.equal(arguments_.includes("--skip-domain"), false);
  assert.equal(arguments_.includes("promote"), false);
  assert.ok(arguments_.includes(`deployCommitSha=${commitSha}`));
  assert.ok(arguments_.includes("githubRunId=123456789"));
});

test("previous Production deployment output accepts only a deployment ID or none", () => {
  assert.equal(
    readExpectedPreviousDeploymentId("dpl_previous123"),
    "dpl_previous123",
  );
  assert.equal(readExpectedPreviousDeploymentId("none"), undefined);
  assert.throws(
    () => readExpectedPreviousDeploymentId(""),
    /DEPLOY_EXPECTED_PREVIOUS_DEPLOYMENT_ID is invalid/u,
  );
  assert.throws(
    () => readExpectedPreviousDeploymentId("https://example.test"),
    /DEPLOY_EXPECTED_PREVIOUS_DEPLOYMENT_ID is invalid/u,
  );
});

test("canonical deployment lookup never treats free-form provider errors as no previous deployment", () => {
  const link = { orgId: "team_abc123", projectId: "prj_abc123" };
  assert.deepEqual(
    validateCanonicalDeploymentResult(
      {
        status: 0,
        stdout: JSON.stringify({
          id: "dpl_current123",
          url: "demo.vercel.app",
          projectId: link.projectId,
          readyState: "READY",
          target: "production",
        }),
        stderr: "",
      },
      link,
    ),
    { id: "dpl_current123", url: "demo.vercel.app" },
  );
  for (const stderr of [
    "404 Not Found",
    "Deployment does not exist",
    "Authorization failed: project not found",
  ]) {
    assert.throws(
      () =>
        validateCanonicalDeploymentResult(
          { status: 1, stdout: "", stderr },
          link,
        ),
      /Vercel canonical deployment API failed/u,
      stderr,
    );
  }
  assert.throws(
    () =>
      validateCanonicalDeploymentResult(
        {
          status: 0,
          stdout: JSON.stringify({
            id: "invalid-id",
            url: "demo.vercel.app",
            projectId: link.projectId,
            readyState: "READY",
            target: "production",
          }),
          stderr: "",
        },
        link,
      ),
    /did not prove a READY deployment/u,
  );
});

test("target fingerprint canonicalizes the complete non-secret stored config", () => {
  const reordered: StoredDeploymentConfig = {
    secretVersions: {
      adminPassword: 3,
      neonApiKey: 2,
      vercelToken: 1,
    },
    kmsKeyArn: storedConfig.kmsKeyArn,
    admin: { email: storedConfig.admin.email },
    neon: {
      expectedPlan: storedConfig.neon.expectedPlan,
      regionId: storedConfig.neon.regionId,
      roleName: storedConfig.neon.roleName,
      databaseName: storedConfig.neon.databaseName,
      branchId: storedConfig.neon.branchId,
      projectName: storedConfig.neon.projectName,
      projectId: storedConfig.neon.projectId,
    },
    vercel: {
      expectedPlan: storedConfig.vercel.expectedPlan,
      canonicalOrigin: storedConfig.vercel.canonicalOrigin,
      projectName: storedConfig.vercel.projectName,
      projectId: storedConfig.vercel.projectId,
      orgId: storedConfig.vercel.orgId,
    },
    aws: {
      region: storedConfig.aws.region,
      accountId: storedConfig.aws.accountId,
    },
    policyVersion: storedConfig.policyVersion,
    schemaVersion: storedConfig.schemaVersion,
  };
  const fingerprint = createDeploymentTargetFingerprint(storedConfig);
  assert.match(fingerprint, /^[0-9a-f]{64}$/u);
  assert.equal(createDeploymentTargetFingerprint(reordered), fingerprint);
  assert.notEqual(
    createDeploymentTargetFingerprint({
      ...storedConfig,
      neon: { ...storedConfig.neon, branchId: "br-other" },
    }),
    fingerprint,
  );
  assert.notEqual(
    createDeploymentTargetFingerprint({
      ...storedConfig,
      secretVersions: { ...storedConfig.secretVersions, neonApiKey: 4 },
    }),
    fingerprint,
  );
});

test("missing SSM messaging never rewrites the history of an earlier phase", () => {
  assert.equal(
    missingDeploymentParametersMutationMessage("validate"),
    "Production環境変数更新、DB migration、Production deployは開始されていません。",
  );
  for (const phase of ["migrate", "release", "smoke"] as const) {
    const message = missingDeploymentParametersMutationMessage(phase);
    assert.match(message, new RegExp(`この${phase} phase`), phase);
    assert.match(message, /先行phase/u, phase);
    assert.doesNotMatch(
      message,
      /^Production環境変数更新、DB migration、Production deployは開始されていません。$/u,
      phase,
    );
  }
});

test("pending migration exits for local approval but remains an Actions job output", () => {
  assert.equal(
    shouldRequireLocalMigrationApproval("pending", {
      DEPLOY_CONTEXT_SOURCE: "stdin",
    }),
    true,
  );
  assert.equal(
    shouldRequireLocalMigrationApproval("pending", {
      DEPLOY_CONTEXT_SOURCE: "stdin",
      GITHUB_ACTIONS: "true",
    }),
    false,
  );
  assert.equal(
    shouldRequireLocalMigrationApproval("up-to-date", {
      DEPLOY_CONTEXT_SOURCE: "stdin",
    }),
    false,
  );
});

test("canonical smoke remains bound to the expected deployment before and after requests", async () => {
  const expected = "dpl_attempt123";
  let smokeCount = 0;
  let readCount = 0;
  await assert.doesNotReject(
    runCanonicalDeploymentBoundSmoke(
      expected,
      () => {
        readCount += 1;
        return { id: expected };
      },
      async () => {
        smokeCount += 1;
      },
    ),
  );
  assert.equal(readCount, 2);
  assert.equal(smokeCount, 1);

  smokeCount = 0;
  await assert.rejects(
    runCanonicalDeploymentBoundSmoke(
      expected,
      () => ({ id: "dpl_changed456" }),
      async () => {
        smokeCount += 1;
      },
    ),
    /No smoke requests were sent/u,
  );
  assert.equal(smokeCount, 0);

  const deployments = [expected, "dpl_changed456"];
  await assert.rejects(
    runCanonicalDeploymentBoundSmoke(
      expected,
      () => ({ id: deployments.shift() ?? "dpl_missing" }),
      async () => {
        smokeCount += 1;
      },
    ),
    /changed to 'dpl_changed456' after smoke/u,
  );
  assert.equal(smokeCount, 1);
});

test("Production evidence and existing auth secret are both fail-closed", () => {
  const link = { orgId: "team_abc123", projectId: "prj_abc123" };
  const deploymentUrl = new URL("https://demo-production.vercel.app");
  const commitSha = "b".repeat(40);
  const inspected = {
    id: "dpl_production123",
    url: deploymentUrl.hostname,
    name: "demo",
    target: "production",
    readyState: "READY",
  };
  const api = {
    ...inspected,
    projectId: link.projectId,
    regions: ["sin1"],
    meta: { deployCommitSha: commitSha, githubRunId: "987654321" },
  };
  assert.equal(
    validateProductionDeploymentEvidence(
      JSON.stringify(inspected),
      JSON.stringify(api),
      link,
      "demo",
      deploymentUrl,
      commitSha,
      "987654321",
    ).id,
    inspected.id,
  );
  assert.throws(
    () =>
      validateProductionDeploymentEvidence(
        JSON.stringify(inspected),
        JSON.stringify({ ...api, regions: ["iad1"] }),
        link,
        "demo",
        deploymentUrl,
        commitSha,
        "987654321",
      ),
    /did not verify/u,
  );

  const authAudit = parseProductionEnvironmentAudit(
    JSON.stringify({
      envs: [
        {
          key: "BETTER_AUTH_SECRET",
          type: "sensitive",
          target: ["production"],
        },
      ],
    }),
  );
  assert.doesNotThrow(() => assertExistingProductionAuthSecret(authAudit));
  assert.throws(
    () =>
      assertExistingProductionAuthSecret(
        parseProductionEnvironmentAudit(JSON.stringify({ envs: [] })),
      ),
    /never creates or reads it/u,
  );
});

test("quality child processes do not inherit cloud or provider credentials", () => {
  const ambient: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: "/usr/bin",
    AWS_ACCESS_KEY_ID: "synthetic-access-key",
    AWS_SECRET_ACCESS_KEY: "synthetic-secret-key",
    AWS_SESSION_TOKEN: "synthetic-session-token",
    AWS_PROFILE: "ambient-profile",
    AWS_CONTAINER_AUTHORIZATION_TOKEN: "synthetic-container-token",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-oidc-token",
    ACTIONS_RUNTIME_TOKEN: "synthetic-actions-token",
    GITHUB_TOKEN: "synthetic-github-token",
    VERCEL_TOKEN: "synthetic-vercel-token",
    NEON_API_KEY: "synthetic-neon-key",
    DATABASE_URL: "postgresql://pooled.invalid/app",
    DATABASE_URL_UNPOOLED: "postgresql://direct.invalid/app",
    BETTER_AUTH_SECRET: "synthetic-auth-secret",
  };
  const sanitized = createSecretFreeBuildEnvironment(ambient);
  assert.deepEqual(sanitized, { NODE_ENV: "test", PATH: "/usr/bin" });
  assert.equal(ambient.AWS_ACCESS_KEY_ID, "synthetic-access-key");

  clearAwsCredentialEnvironment(ambient);
  assert.equal(ambient.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(ambient.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
  assert.equal(ambient.VERCEL_TOKEN, "synthetic-vercel-token");
});

test("Production environment audit follows pagination and rejects a forbidden second-page variable", () => {
  const link = { orgId: "team_abc123", projectId: "prj_abc123" };
  const requests: string[] = [];
  const runner: CommandRunner = {
    run(command, arguments_) {
      assert.equal(command, "vercel");
      const endpoint = arguments_[1];
      assert.ok(endpoint);
      requests.push(endpoint);
      const url = new URL(endpoint, "https://api.vercel.test");
      assert.equal(url.searchParams.get("limit"), "100");
      const secondPage = url.searchParams.get("until") === "200";
      return {
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          envs: [
            secondPage
              ? {
                  key: "FORBIDDEN_PRODUCTION_FLAG",
                  type: "encrypted",
                  target: ["production"],
                }
              : {
                  key: "BETTER_AUTH_SECRET",
                  type: "sensitive",
                  target: ["production"],
                },
          ],
          pagination: {
            count: 1,
            next: secondPage ? null : 200,
            prev: secondPage ? 300 : null,
          },
        }),
      };
    },
  };

  assert.throws(
    () => assertProductionEnvironmentReady(runner, link, { NODE_ENV: "test" }),
    /outside the reviewed allowlist/u,
  );
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0]!, "https://api.vercel.test").searchParams.has("until"), false);
  assert.equal(new URL(requests[1]!, "https://api.vercel.test").searchParams.get("until"), "200");
});

test("Production environment audit rejects a pagination cycle", () => {
  const link = { orgId: "team_abc123", projectId: "prj_abc123" };
  let requestCount = 0;
  const runner: CommandRunner = {
    run(_command, arguments_) {
      requestCount += 1;
      const endpoint = arguments_[1];
      assert.ok(endpoint);
      const secondPage = new URL(
        endpoint,
        "https://api.vercel.test",
      ).searchParams.has("until");
      return {
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          envs: [
            {
              key: secondPage ? "PAGE_TWO" : "PAGE_ONE",
              type: "encrypted",
              target: ["preview"],
            },
          ],
          pagination: {
            count: 1,
            next: 200,
            prev: secondPage ? 300 : null,
          },
        }),
      };
    },
  };

  assert.throws(
    () => assertProductionEnvironmentReady(runner, link, { NODE_ENV: "test" }),
    /did not make forward progress/u,
  );
  assert.equal(requestCount, 2);
});
