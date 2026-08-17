import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORKFLOW_PATH = resolve(
  PROJECT_ROOT,
  ".github/workflows/production-deploy.yml",
);
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

const jobNames = [
  "validate_and_plan",
  "production_migration",
  "production_deploy",
  "canonical_smoke",
] as const;

function jobBlock(jobName: (typeof jobNames)[number]): string {
  const startMarker = `  ${jobName}:\n`;
  const start = workflow.indexOf(startMarker);
  assert.notEqual(start, -1, `missing workflow job: ${jobName}`);
  const laterStarts = jobNames
    .map((candidate) => workflow.indexOf(`  ${candidate}:\n`, start + 1))
    .filter((index) => index > start);
  const end = laterStarts.length > 0 ? Math.min(...laterStarts) : workflow.length;
  return workflow.slice(start, end);
}

test("GitHub Actions builds the archived SHA before requesting AWS OIDC", () => {
  assert.doesNotMatch(workflow, /actions\/setup-node@/u);
  assert.doesNotMatch(workflow, /^\s+(?:npm|npx|node|vercel)\s/imu);

  for (const match of workflow.matchAll(/^\s*uses:\s+[^@\s]+@([^\s#]+)/gmu)) {
    assert.match(match[1], /^[0-9a-f]{40}$/u, "external actions must use a full SHA");
  }

  for (const jobName of jobNames) {
    const block = jobBlock(jobName);
    const archive = block.indexOf('git archive --format=tar "${GITHUB_SHA}"');
    const build = block.indexOf("docker build");
    const oidc = block.indexOf("aws-actions/configure-aws-credentials@");
    const sts = block.indexOf("aws sts get-caller-identity");
    const parameters = block.indexOf("aws ssm get-parameters");
    const parametersSucceeded = block.indexOf("2>/dev/null; then", parameters);
    const completionMarker = block.indexOf(
      "ZOOM_DEPLOY_SSM_CONTEXT_COMPLETE_V1",
      parametersSucceeded,
    );
    const successReturn = block.indexOf("return 0", completionMarker);
    const successBranchEnd = block.indexOf("\n            fi", successReturn);
    const failureBranch = block.indexOf(
      "SSM GetParameters failed",
      successBranchEnd,
    );
    const failureReturn = block.indexOf("return 1", failureBranch);
    const phase = block.indexOf("stream_ssm_context | docker run");
    assert.ok(
      archive >= 0 &&
        archive < build &&
        build < oidc &&
        oidc < sts &&
        sts < parameters &&
        parameters < phase,
      `${jobName} must archive and build before OIDC, then use only host AWS CLI before the phase container`,
    );
    assert.ok(
      (block.match(/set -euo pipefail/gu)?.length ?? 0) >= 2,
      `${jobName} build and SSM pipeline must both fail closed`,
    );
    assert.ok(
      parameters >= 0 &&
        block.slice(parameters - 3, parameters) === "if " &&
        parameters < parametersSucceeded &&
        parametersSucceeded < completionMarker &&
        completionMarker < successReturn &&
        successReturn < successBranchEnd &&
        successBranchEnd < failureBranch &&
        failureBranch < failureReturn &&
        failureReturn < phase,
      `${jobName} must emit the marker only inside the successful GetParameters branch and return failure without it`,
    );
    assert.equal(
      block.match(/ZOOM_DEPLOY_SSM_CONTEXT_COMPLETE_V1/gu)?.length,
      1,
      `${jobName} must not expose another marker path for failed GetParameters`,
    );
    assert.doesNotMatch(block, /aws ssm get-parameters[\s\S]*?\|\|\s*true/u);
  }
});

test("phase containers receive only the marked SSM stdin and non-secret metadata", () => {
  assert.doesNotMatch(workflow, /DEPLOY_CONTEXT_SOURCE=aws/u);
  assert.equal(
    workflow.match(/DEPLOY_CONTEXT_SOURCE=stdin/gu)?.length,
    jobNames.length,
  );
  assert.equal(
    workflow.match(/ZOOM_DEPLOY_SSM_CONTEXT_COMPLETE_V1/gu)?.length,
    jobNames.length,
  );
  assert.doesNotMatch(
    workflow,
    /--env\s+"(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GITHUB_TOKEN|ACTIONS_ID_TOKEN)/u,
  );
  assert.doesNotMatch(workflow, /--env-file|\/(?:root|home\/node)\/\.aws|~\/\.aws/u);

  const volumeLines = workflow
    .split("\n")
    .filter((line) => line.includes("--volume"));
  assert.ok(volumeLines.length >= jobNames.length);
  assert.ok(
    volumeLines.every((line) => line.includes("${output_directory}:/deploy-output")),
    "the private phase-output directory must be the only bind mount",
  );

  for (const parameter of [
    "DEPLOY_CONFIG_PARAMETER",
    "DEPLOY_VERCEL_TOKEN_PARAMETER",
    "DEPLOY_NEON_API_KEY_PARAMETER",
    "DEPLOY_ADMIN_PASSWORD_PARAMETER",
  ]) {
    const reference = `"${"${"}${parameter}}"`;
    assert.equal(
      workflow.split(reference).length - 1,
      jobNames.length,
      `${parameter} must be requested exactly once in each job`,
    );
  }
});

test("only strictly validated non-secret phase results become job outputs", () => {
  const validate = jobBlock("validate_and_plan");
  const release = jobBlock("production_deploy");
  const migration = jobBlock("production_migration");
  const smoke = jobBlock("canonical_smoke");

  for (const key of [
    "migration-required",
    "plan-digest",
    "target-fingerprint",
  ]) {
    assert.match(validate, new RegExp(key, "u"));
  }
  for (const key of ["deployment-id", "previous-deployment-id"]) {
    assert.match(release, new RegExp(key, "u"));
  }
  assert.match(validate, /stat -c '%u:%g:%a'/u);
  assert.match(release, /stat -c '%u:%g:%a'/u);
  assert.match(validate, /:\$\(id -g\):600/u);
  assert.match(release, /:\$\(id -g\):600/u);
  assert.match(validate, />> "\$\{GITHUB_OUTPUT\}"/u);
  assert.match(release, />> "\$\{GITHUB_OUTPUT\}"/u);
  assert.doesNotMatch(migration, /GITHUB_OUTPUT/u);
  assert.doesNotMatch(smoke, /GITHUB_OUTPUT/u);
  assert.match(migration, /\[\[ ! -e "\$\{output_directory\}\/result"/u);
  assert.match(smoke, /\[\[ ! -e "\$\{output_directory\}\/result"/u);
  assert.equal(
    workflow.match(/DEPLOY_EXPECTED_TARGET_FINGERPRINT=/gu)?.length,
    3,
  );
  assert.equal(workflow.match(/DEPLOY_EXPECTED_PLAN_DIGEST=/gu)?.length, 1);
  assert.equal(workflow.match(/DEPLOY_EXPECTED_DEPLOYMENT_ID=/gu)?.length, 1);
  assert.equal(
    workflow.match(/DEPLOY_EXPECTED_PREVIOUS_DEPLOYMENT_ID=/gu)?.length,
    1,
  );
});
