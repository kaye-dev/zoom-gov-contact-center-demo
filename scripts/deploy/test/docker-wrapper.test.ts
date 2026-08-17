import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
  DEPLOY_CONFIG_PARAMETER,
  DEPLOY_CONTEXT_COMPLETION_MARKER,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_VERCEL_TOKEN_PARAMETER,
} from "../lib/aws-config";

const projectRoot = resolve(import.meta.dirname, "../../..");
const deployScript = join(projectRoot, "deploy.sh");
const setupDeployAwsScript = join(projectRoot, "setup-deploy-aws.sh");

test("Docker build context archives the exact resolved Git SHA", () => {
  const source = readFileSync(deployScript, "utf8");
  assert.match(
    source,
    /archive --format=tar "\$\{DEPLOY_GIT_SHA\}"/,
  );
  assert.ok(!source.includes("archive --format=tar HEAD"));
});

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

test("setup wrapper builds a non-empty argument array under Bash nounset", () => {
  const result = spawnSync(
    "/bin/bash",
    [
      "-uc",
      [
        `source ${shellQuote(setupDeployAwsScript)}`,
        "parse_setup_wrapper_arguments --profile demo-keien-01",
        'DEPLOY_AWS_PROFILE="${SETUP_REQUESTED_PROFILE}"',
        "build_setup_container_arguments",
        `printf '<%s>\\n' "\${SETUP_CONTAINER_ARGUMENTS[@]}"`,
      ].join("\n"),
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "<node>",
      "<--import>",
      "<tsx>",
      "<scripts/deploy/setup-aws.ts>",
      "<--profile>",
      "<demo-keien-01>",
      "",
    ].join("\n"),
  );
});

function initializeWrapperFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "zoom-deploy-wrapper-"));
  copyFileSync(deployScript, join(root, "deploy.sh"));
  chmodSync(join(root, "deploy.sh"), 0o755);
  writeFileSync(
    join(root, ".env.example"),
    "DEPLOY_AWS_PROFILE=\nLOCAL_VALUE=preserved\n",
    "utf8",
  );
  writeFileSync(join(root, ".gitignore"), ".env\n.env.tmp.*\n", "utf8");
  const git = (...arguments_: string[]) =>
    spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(git("config", "user.email", "test@example.com").status, 0);
  assert.equal(git("config", "user.name", "Deploy Test").status, 0);
  assert.equal(git("add", "deploy.sh", ".env.example", ".gitignore").status, 0);
  assert.equal(git("commit", "--quiet", "-m", "fixture").status, 0);
  return root;
}

function runFixture(root: string, body: string) {
  return spawnSync("bash", ["-c", `source ./deploy.sh\n${body}`], {
    cwd: root,
    encoding: "utf8",
  });
}

function runFixtureAsync(root: string, body: string): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn("bash", ["-c", `source ./deploy.sh\n${body}`], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectProcess);
    child.once("close", (status) => {
      resolveProcess({ status, stdout, stderr });
    });
  });
}

test("explicit profile wins without evaluating an unsafe .env assignment", () => {
  const root = initializeWrapperFixture();
  const sentinel = join(root, "must-not-exist");
  try {
    writeFileSync(
      join(root, ".env"),
      `DEPLOY_AWS_PROFILE=$(touch ${sentinel})\n`,
      "utf8",
    );
    const result = runFixture(
      root,
      "list_aws_profiles() { printf 'cli-profile\\nenv-profile\\n'; }\nresolve_aws_profile cli-profile\nprintf '%s' \"${DEPLOY_AWS_PROFILE}\"",
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "cli-profile");
    assert.equal(spawnSync("test", ["-e", sentinel]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing selected profile fails without falling back", () => {
  const root = initializeWrapperFixture();
  try {
    writeFileSync(join(root, ".env"), "DEPLOY_AWS_PROFILE=missing\n", "utf8");
    const result = runFixture(
      root,
      "list_aws_profiles() { printf 'default\\n'; }\nresolve_aws_profile ''",
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not exist\. No fallback profile was used/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid .env profile assignment is rejected without evaluation", () => {
  const root = initializeWrapperFixture();
  const sentinel = join(root, "must-not-exist");
  try {
    writeFileSync(
      join(root, ".env"),
      `DEPLOY_AWS_PROFILE=$(touch ${sentinel})\n`,
      "utf8",
    );
    const result = runFixture(
      root,
      "list_aws_profiles() { printf 'default\\n'; }\nresolve_aws_profile ''",
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid DEPLOY_AWS_PROFILE assignment/);
    assert.equal(spawnSync("test", ["-e", sentinel]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("profile resolution rejects .env symlinks and explicit empty values", () => {
  const root = initializeWrapperFixture();
  try {
    writeFileSync(join(root, "target-env"), "DEPLOY_AWS_PROFILE=default\n", "utf8");
    symlinkSync("target-env", join(root, ".env"));
    const symlinkResult = runFixture(
      root,
      "list_aws_profiles() { printf 'default\\n'; }\nresolve_aws_profile default",
    );
    assert.notEqual(symlinkResult.status, 0);
    assert.match(symlinkResult.stderr, /regular, non-symlink/);

    const emptyResult = runFixture(root, "parse_deploy_arguments --profile ''");
    assert.notEqual(emptyResult.status, 0);
    assert.match(emptyResult.stderr, /non-empty value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(".env creation preserves the template and uses mode 0600", () => {
  const root = initializeWrapperFixture();
  try {
    const result = runFixture(
      root,
      "DEPLOY_AWS_PROFILE=splai-prd\ncreate_env_file",
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(join(root, ".env"), "utf8"),
      "DEPLOY_AWS_PROFILE=splai-prd\nLOCAL_VALUE=preserved\n",
    );
    assert.equal(lstatSync(join(root, ".env")).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-interactive deployment skips an absent optional .env and continues", () => {
  const root = initializeWrapperFixture();
  try {
    const result = runFixture(
      root,
      "DEPLOY_AWS_PROFILE=splai-prd\nDEPLOY_ENV_WAS_ABSENT=1\nmaybe_create_env_file\nprintf continued",
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "continued");
    assert.match(result.stderr, /skipped the optional profile save/);
    assert.equal(spawnSync("test", ["-e", join(root, ".env")]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an existing .env is neither prompted for nor modified", () => {
  const root = initializeWrapperFixture();
  const existing = "DEPLOY_AWS_PROFILE=existing\nLOCAL_VALUE=keep-me\n";
  try {
    writeFileSync(join(root, ".env"), existing, { mode: 0o600 });
    const result = runFixture(
      root,
      "DEPLOY_AWS_PROFILE=splai-prd\nDEPLOY_ENV_WAS_ABSENT=0\nmaybe_create_env_file\nprintf continued",
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "continued");
    assert.equal(result.stderr, "");
    assert.equal(readFileSync(join(root, ".env"), "utf8"), existing);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent .env creation never overwrites the winner", async () => {
  const root = initializeWrapperFixture();
  try {
    const [first, second] = await Promise.all([
      runFixtureAsync(root, "DEPLOY_AWS_PROFILE=first\ncreate_env_file"),
      runFixtureAsync(root, "DEPLOY_AWS_PROFILE=second\ncreate_env_file"),
    ]);
    assert.deepEqual(
      [first.status, second.status].sort((left, right) =>
        Number(left) - Number(right),
      ),
      [0, 1],
    );
    const contents = readFileSync(join(root, ".env"), "utf8");
    assert.match(contents, /^DEPLOY_AWS_PROFILE=(?:first|second)$/m);
    assert.equal((contents.match(/^DEPLOY_AWS_PROFILE=/gm) ?? []).length, 1);
    assert.equal(lstatSync(join(root, ".env")).isSymbolicLink(), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preflight returns 78 and setup guidance for exact missing parameters", () => {
  const missing = [
    DEPLOY_CONFIG_PARAMETER,
    DEPLOY_VERCEL_TOKEN_PARAMETER,
    DEPLOY_NEON_API_KEY_PARAMETER,
    DEPLOY_ADMIN_PASSWORD_PARAMETER,
  ];
  const input = `${JSON.stringify({ Parameters: [], InvalidParameters: missing })}\n${DEPLOY_CONTEXT_COMPLETION_MARKER}\n`;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/deploy/preflight-aws.ts"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      input,
      env: {
        ...process.env,
        DEPLOY_AWS_ACCOUNT_ID: "123456789012",
        DEPLOY_AWS_PROFILE: "splai-prd",
      },
    },
  );
  assert.equal(result.status, 78);
  assert.match(result.stderr, /\.\/setup-deploy-aws\.sh --profile splai-prd/);
  for (const name of missing) {
    assert.ok(result.stderr.includes(name));
  }
});

test("valid-looking SSM stdout without the success marker is rejected", () => {
  const syntheticSecret = "synthetic-partial-secret";
  const input = JSON.stringify({
    Parameters: [
      {
        Name: DEPLOY_VERCEL_TOKEN_PARAMETER,
        Type: "SecureString",
        Value: syntheticSecret,
        Version: 1,
      },
    ],
    InvalidParameters: [],
  });
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/deploy/preflight-aws.ts"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      input,
      env: {
        ...process.env,
        DEPLOY_AWS_ACCOUNT_ID: "123456789012",
        DEPLOY_AWS_PROFILE: "splai-prd",
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /did not complete successfully/);
  assert.ok(!result.stderr.includes(syntheticSecret));
});

test("SSM stream emits its completion marker only after the AWS helper succeeds", () => {
  const root = initializeWrapperFixture();
  const syntheticSecret = "synthetic-partial-secret";
  try {
    const success = runFixture(
      root,
      "run_aws_helper() { printf '{\"ok\":true}'; }\nstream_ssm_context",
    );
    assert.equal(success.status, 0, success.stderr);
    assert.equal(
      success.stdout,
      `{\"ok\":true}\n${DEPLOY_CONTEXT_COMPLETION_MARKER}\n`,
    );

    const failure = runFixture(
      root,
      `run_aws_helper() { printf '{\"secret\":\"${syntheticSecret}\"}'; return 255; }\nstream_ssm_context`,
    );
    assert.notEqual(failure.status, 0);
    assert.ok(!failure.stdout.includes(DEPLOY_CONTEXT_COMPLETION_MARKER));
    assert.ok(!failure.stderr.includes(syntheticSecret));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release output carries both new and previous deployment IDs fail-closed", () => {
  const root = initializeWrapperFixture();
  const output = join(root, "release-result");
  try {
    writeFileSync(
      output,
      "deployment-id=dpl_current123\nprevious-deployment-id=dpl_previous456\n",
      "utf8",
    );
    const parsed = runFixture(
      root,
      `parse_release_output ${shellQuote(output)}\nprintf '%s|%s' "\${DEPLOY_RELEASE_ID}" "\${DEPLOY_PREVIOUS_RELEASE_ID}"`,
    );
    assert.equal(parsed.status, 0, parsed.stderr);
    assert.equal(parsed.stdout, "dpl_current123|dpl_previous456");

    writeFileSync(
      output,
      "deployment-id=dpl_current123\nprevious-deployment-id=none\n",
      "utf8",
    );
    const noPrevious = runFixture(
      root,
      `parse_release_output ${shellQuote(output)}\nprintf '%s' "\${DEPLOY_PREVIOUS_RELEASE_ID}"`,
    );
    assert.equal(noPrevious.status, 0, noPrevious.stderr);
    assert.equal(noPrevious.stdout, "none");

    writeFileSync(output, "deployment-id=dpl_current123\n", "utf8");
    const incomplete = runFixture(
      root,
      `parse_release_output ${shellQuote(output)}`,
    );
    assert.notEqual(incomplete.status, 0);
    assert.match(incomplete.stderr, /release phase result is incomplete/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validate output carries a strict target fingerprint for every later phase", () => {
  const root = initializeWrapperFixture();
  const output = join(root, "validate-result");
  const planDigest = "a".repeat(64);
  const targetFingerprint = "b".repeat(64);
  try {
    writeFileSync(
      output,
      `migration-required=true\nplan-digest=${planDigest}\ntarget-fingerprint=${targetFingerprint}\n`,
      "utf8",
    );
    const parsed = runFixture(
      root,
      `parse_validate_output ${shellQuote(output)}\nprintf '%s|%s|%s' "\${DEPLOY_MIGRATION_REQUIRED}" "\${DEPLOY_PLAN_DIGEST}" "\${DEPLOY_TARGET_FINGERPRINT}"`,
    );
    assert.equal(parsed.status, 0, parsed.stderr);
    assert.equal(parsed.stdout, `true|${planDigest}|${targetFingerprint}`);

    writeFileSync(
      output,
      `migration-required=true\nplan-digest=${planDigest}\n`,
      "utf8",
    );
    const incomplete = runFixture(
      root,
      `parse_validate_output ${shellQuote(output)}`,
    );
    assert.notEqual(incomplete.status, 0);
    assert.match(incomplete.stderr, /validate phase result is incomplete/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("test fixture paths are shell-quoted safely", () => {
  const quoted = shellQuote("a'b");
  const result = spawnSync("bash", ["-c", `printf %s ${quoted}`], {
    encoding: "utf8",
  });
  assert.equal(result.stdout, "a'b");
});
