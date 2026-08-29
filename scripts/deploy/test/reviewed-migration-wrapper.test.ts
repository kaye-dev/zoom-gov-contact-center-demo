import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  assertReviewedMaintenanceConfiguration,
  assertReviewedMaintenancePublicState,
} from "../reviewed-migration";

const projectRoot = resolve(import.meta.dirname, "../../..");
const script = join(
  projectRoot,
  "scripts",
  "deploy",
  "reviewed-migrate-production.sh",
);
const entrypoint = join(
  projectRoot,
  "scripts",
  "deploy",
  "reviewed-migration.ts",
);
const deployScript = join(projectRoot, "deploy.sh");
const deployEntrypoint = join(projectRoot, "scripts", "deploy", "main.ts");

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

test("one-time wrapper preserves the normal deploy CLI and immutable stdin runner", () => {
  const contents = readFileSync(script, "utf8");
  assert.ok((lstatSync(script).mode & 0o111) !== 0);
  assert.match(contents, /source "\$\{REVIEWED_MIGRATION_PROJECT_ROOT\}\/deploy\.sh"/u);
  assert.match(contents, /requested_profile="\$\(parse_deploy_arguments "\$@"\)"/u);
  assert.match(
    contents,
    /stream_ssm_context \| docker run \\\n    "\$\{container_arguments\[@\]\}"/u,
  );
  assert.match(
    contents,
    /local container_arguments=\(\s+--rm --init --interactive --user 0/u,
  );
  assert.match(
    contents,
    /"\$\{DEPLOY_RUNNER_IMAGE\}" \\\n+    sh -ceu "\$\{DEPLOY_PRIVATE_OUTPUT_ENTRYPOINT\}" sh \\\n+    node --import tsx scripts\/deploy\/reviewed-migration\.ts/u,
  );
  assert.doesNotMatch(contents, /hard_delete=true|DATABASE_URL=/u);
  assert.match(
    contents,
    /DEPLOY_INTERNAL_EXPECTED_GIT_SHA="\$\{DEPLOY_GIT_SHA\}"/u,
  );
  assert.match(
    contents,
    /DEPLOY_INTERNAL_EXPECTED_TARGET_FINGERPRINT="\$\{REVIEWED_TARGET_FINGERPRINT\}"/u,
  );
  assert.match(contents, /DEPLOY_INTERNAL_SKIP_ENV_PROMPT=1/u);
  const validate = contents.indexOf("run_reviewed_migration_phase validate");
  const approval = contents.indexOf("confirm_reviewed_migration", validate);
  const apply = contents.indexOf("run_reviewed_migration_phase \\\n    apply", approval);
  const deploy = contents.indexOf('"${SCRIPT_DIRECTORY}/deploy.sh"', apply);
  assert.ok(validate >= 0 && approval > validate && apply > approval && deploy > apply);
});

test("reviewed entrypoint is import-safe and reuses full provider validation", () => {
  const contents = readFileSync(entrypoint, "utf8");
  const providerValidation = contents.indexOf("verifyStoredDeploymentTarget(");
  const phaseBranch = contents.indexOf('if (phase === "validate")');
  assert.ok(providerValidation >= 0 && providerValidation < phaseBranch);
  assert.match(contents, /pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/u);

  const imported = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      "import('./scripts/deploy/reviewed-migration.ts').then(() => console.log('imported'))",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, "imported\n");
});

test("normal deploy handoff keeps the approved target fingerprint on validate", () => {
  const wrapper = readFileSync(deployScript, "utf8");
  const entrypointSource = readFileSync(deployEntrypoint, "utf8");
  assert.match(
    wrapper,
    /run_deploy_phase \\\n\s+validate \\\n\s+"\$\{validate_directory\}" \\\n\s+"\$\{DEPLOY_INTERNAL_EXPECTED_TARGET_FINGERPRINT:-\}"/u,
  );
  assert.match(
    entrypointSource,
    /phase === "validate" &&\s+process\.env\.DEPLOY_EXPECTED_TARGET_FINGERPRINT === undefined/u,
  );
});

test("reviewed migration requires non-expiring maintenance and exact canonical 503", () => {
  const enabled = {
    environment: "PRODUCTION" as const,
    version: 1 as const,
    mode: "ENABLED" as const,
    scheduledStartAt: null,
    scheduledEndAt: null,
    revision: 1,
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
  const expected = {
    environment: "PRODUCTION" as const,
    status: 503 as const,
  };
  assert.doesNotThrow(() =>
    assertReviewedMaintenanceConfiguration(enabled, expected),
  );
  assert.doesNotThrow(() =>
    assertReviewedMaintenancePublicState(expected, expected),
  );

  assert.throws(
    () =>
      assertReviewedMaintenanceConfiguration(
        { ...enabled, mode: "SCHEDULED" },
        { ...expected, retryAfter: "Sun, 30 Aug 2026 01:00:00 GMT" },
      ),
    /non-expiring Production maintenance/u,
  );
  assert.throws(
    () =>
      assertReviewedMaintenancePublicState(expected, {
        ...expected,
        status: 200,
      }),
    /verified maintenance response/u,
  );
});

test("one-time wrapper rejects GitHub Actions before local setup", () => {
  const rejected = spawnSync(
    "/bin/bash",
    [
      "-c",
      [
        `source ${shellQuote(script)}`,
        "GITHUB_ACTIONS=true",
        "assert_reviewed_local_context",
      ].join("\n"),
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /restricted to an interactive local runner/u);
});

test("reviewed validate output parser accepts only the exact three digest fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "zoom-reviewed-output-"));
  const valid = join(directory, "valid");
  const invalid = join(directory, "invalid");
  const digestA = "a".repeat(64);
  const digestB = "b".repeat(64);
  const digestC = "c".repeat(64);
  try {
    writeFileSync(
      valid,
      [
        `target-fingerprint=${digestA}`,
        `reviewed-plan-digest=${digestB}`,
        `operation-digest=${digestC}`,
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    writeFileSync(
      invalid,
      [
        `target-fingerprint=${digestA}`,
        `reviewed-plan-digest=${digestB}`,
        `operation-digest=${digestC}`,
        "unexpected=value",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );

    const accepted = spawnSync(
      "/bin/bash",
      [
        "-c",
        [
          `source ${shellQuote(script)}`,
          `parse_reviewed_validate_output ${shellQuote(valid)}`,
          "printf '%s\\n%s\\n%s\\n' \"${REVIEWED_TARGET_FINGERPRINT}\" \"${REVIEWED_PLAN_DIGEST}\" \"${REVIEWED_OPERATION_DIGEST}\"",
        ].join("\n"),
      ],
      { cwd: projectRoot, encoding: "utf8" },
    );
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(accepted.stdout, `${digestA}\n${digestB}\n${digestC}\n`);

    const rejected = spawnSync(
      "/bin/bash",
      [
        "-c",
        [
          `source ${shellQuote(script)}`,
          `parse_reviewed_validate_output ${shellQuote(invalid)}`,
        ].join("\n"),
      ],
      { cwd: projectRoot, encoding: "utf8" },
    );
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /unsupported result field/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
