import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
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
const deployDockerfile = join(projectRoot, "Dockerfile.deploy");
const deployScript = join(projectRoot, "deploy.sh");
const setupDeployAwsScript = join(projectRoot, "setup-deploy-aws.sh");

test("deployment runner includes the Linux quality-gate tools", () => {
  const source = readFileSync(deployDockerfile, "utf8");
  assert.match(source, /procps=2:4\.0\.2-3/);
  assert.match(source, /zsh=5\.9-4\+b15/);
});

test("deployment phases use an init process to reap descendants", () => {
  const source = readFileSync(deployScript, "utf8");
  assert.match(
    source,
    /local container_arguments=\(\s+--rm --init --interactive --user 0/,
  );
});

test("deployment phases make Colima bind-mounted output private before execution", () => {
  const source = readFileSync(deployScript, "utf8");
  assert.match(
    source,
    /DEPLOY_PRIVATE_OUTPUT_ENTRYPOINT='chmod 700 \/deploy-output && exec "\$@"'/u,
  );
  assert.match(
    source,
    /"\$\{DEPLOY_RUNNER_IMAGE\}" \\\n+[ \t]+sh -ceu "\$\{DEPLOY_PRIVATE_OUTPUT_ENTRYPOINT\}" sh \\\n+[ \t]+node --no-warnings --import tsx scripts\/deploy\/main\.ts/u,
  );
});

test("deployment runner suppresses default Node warnings for concise handling", () => {
  const source = readFileSync(deployDockerfile, "utf8");
  assert.match(
    source,
    /CMD \["node", "--no-warnings", "--import", "tsx", "scripts\/deploy\/main\.ts"\]/u,
  );
});

test("deployment phases receive the wrapper-selected log style", () => {
  const source = readFileSync(deployScript, "utf8");
  assert.match(source, /--env "DEPLOY_LOG_STYLE=\$\{DEPLOY_LOG_STYLE\}"/u);
});

test("deployment output uses the Git metadata directory shared by Colima", () => {
  const source = readFileSync(deployScript, "utf8");
  assert.match(source, /rev-parse --absolute-git-dir/u);
  assert.match(
    source,
    /mktemp -d "\$\{DEPLOY_GIT_DIRECTORY\}\/zoom-deploy-output\.XXXXXX"/u,
  );
  assert.doesNotMatch(
    source,
    /\$\{TMPDIR:-\/tmp\}\/zoom-deploy-output/u,
  );
});

test("Docker build context archives the exact resolved Git SHA", () => {
  const source = readFileSync(deployScript, "utf8");
  assert.match(
    source,
    /archive --format=tar "\$\{DEPLOY_GIT_SHA\}"/,
  );
  assert.ok(!source.includes("archive --format=tar HEAD"));
});

test("reviewed handoff rejects a changed Git snapshot before rebuilding", () => {
  const root = initializeWrapperFixture();
  const approvedSha = "a".repeat(40);
  const changedSha = "b".repeat(40);
  try {
    const accepted = runFixture(
      root,
      [
        `DEPLOY_GIT_SHA=${approvedSha}`,
        "DEPLOY_GIT_BRANCH=codex/reviewed",
        `DEPLOY_INTERNAL_EXPECTED_GIT_SHA=${approvedSha}`,
        "DEPLOY_INTERNAL_EXPECTED_GIT_BRANCH=codex/reviewed",
        "assert_internal_deployment_snapshot",
      ].join("\n"),
    );
    assert.equal(accepted.status, 0, accepted.stderr);

    const rejected = runFixture(
      root,
      [
        `DEPLOY_GIT_SHA=${changedSha}`,
        "DEPLOY_GIT_BRANCH=codex/reviewed",
        `DEPLOY_INTERNAL_EXPECTED_GIT_SHA=${approvedSha}`,
        "DEPLOY_INTERNAL_EXPECTED_GIT_BRANCH=codex/reviewed",
        "assert_internal_deployment_snapshot",
      ].join("\n"),
    );
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Git HEAD changed after the reviewed/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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

test("interactive profile selection is passed to the setup container without --profile", () => {
  const result = spawnSync(
    "/bin/bash",
    [
      "-uc",
      [
        `source ${shellQuote(setupDeployAwsScript)}`,
        "SETUP_RECONFIGURE=0",
        'SETUP_ROTATE=""',
        "select_aws_profile_by_index 4 default splai-dev splai-prd demo-keien-01",
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

test("setup wrapper verifies the selected AWS session before building the runner image", () => {
  const source = readFileSync(setupDeployAwsScript, "utf8");
  assert.match(
    source,
    /resolve_aws_profile "\$\{SETUP_REQUESTED_PROFILE\}"\s+read_aws_account_id\s+build_deploy_runner_image/,
  );
});

test("AWS configuration stays read-only except for the exact SSO login cache", () => {
  const deploySource = readFileSync(deployScript, "utf8");
  const setupSource = readFileSync(setupDeployAwsScript, "utf8");

  assert.match(deploySource, /:\/root\/\.aws:ro/);
  assert.match(
    deploySource,
    /AWS_ROOT_CLI_CACHE_TMPFS="\/root\/\.aws\/cli\/cache:rw,noexec,nosuid,nodev,size=1m,mode=0700,uid=0,gid=0"/,
  );
  assert.equal(
    deploySource.match(/--tmpfs "\$\{AWS_ROOT_CLI_CACHE_TMPFS\}"/g)?.length,
    2,
  );
  assert.match(deploySource, /--user "\$\{host_uid\}:\$\{host_gid\}"/);
  assert.match(deploySource, /--env "HOME=\/aws-home"/);
  assert.match(
    deploySource,
    /--volume "\$\{sso_cache_directory\}:\/aws-home\/\.aws\/sso\/cache:rw"/,
  );
  assert.match(
    deploySource,
    /sso_cli_cache_tmpfs="\/aws-home\/\.aws\/cli\/cache:[^"]+uid=\$\{host_uid\},gid=\$\{host_gid\}"/,
  );
  assert.match(
    deploySource,
    /sso login \\\n+    --profile "\$\{DEPLOY_AWS_PROFILE\}" \\\n+    --use-device-code \\\n+    --no-browser/,
  );
  assert.match(setupSource, /:\/home\/node\/\.aws:ro/);
  assert.match(
    deploySource,
    /AWS_NODE_CLI_CACHE_TMPFS="\/home\/node\/\.aws\/cli\/cache:rw,noexec,nosuid,nodev,size=1m,mode=0700,uid=1000,gid=1000"/,
  );
  assert.match(setupSource, /--tmpfs "\$\{AWS_NODE_CLI_CACHE_TMPFS\}"/);
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

type StubResponse = {
  output?: string;
  status?: number;
};

type MemoryPreflightScenario = {
  memory?: StubResponse[];
  contexts?: StubResponse[];
  endpoints?: StubResponse[];
  statuses?: StubResponse[];
  activeContainers?: StubResponse[];
  containerList?: string;
  interactive?: boolean;
  answer?: string;
  colimaAvailable?: boolean;
  stopStatus?: number;
  startStatus?: number;
  dockerVersionStatus?: number;
  environment?: string[];
  after?: string;
};

function colimaStatusJson(
  memory: number,
  endpoint = "unix:///Users/test/.colima/default/docker.sock",
  runtime = "docker",
): string {
  return JSON.stringify({
    display_name: "colima",
    runtime,
    docker_socket: endpoint,
    memory,
  });
}

function stubSequence(
  root: string,
  label: string,
  responses: StubResponse[],
): string {
  const values = responses.length > 0 ? responses : [{ output: "" }];
  const branches = values.map((response, index) => {
    const marker = join(root, `${label}-${index}`);
    const output = response.output
      ? `printf '%s\\n' ${shellQuote(response.output)}`
      : ":";
    return [
      `if [[ ! -e ${shellQuote(marker)} ]]; then`,
      `  : > ${shellQuote(marker)}`,
      `  ${output}`,
      `  return ${response.status ?? 0}`,
      "fi",
    ].join("\n");
  });
  const last = values.at(-1) ?? { output: "" };
  branches.push(
    last.output ? `printf '%s\\n' ${shellQuote(last.output)}` : ":",
    `return ${last.status ?? 0}`,
  );
  return branches.join("\n");
}

function runMemoryPreflightFixture(
  root: string,
  scenario: MemoryPreflightScenario = {},
) {
  const endpoint = "unix:///Users/test/.colima/default/docker.sock";
  const stopArguments = join(root, "colima-stop-arguments");
  const startArguments = join(root, "colima-start-arguments");
  const contextArguments = join(root, "docker-context-arguments");
  const statusArguments = join(root, "colima-status-arguments");
  const colimaUnavailable = scenario.colimaAvailable === false
    ? [
        "command() {",
        '  if [[ "$1" == "-v" && "$2" == "colima" ]]; then return 1; fi',
        '  builtin command "$@"',
        "}",
      ].join("\n")
    : "";
  const body = [
    ...(scenario.environment ?? []),
    colimaUnavailable,
    "docker() {",
    '  if [[ "$1" == "info" && "$2" == "--format" ]]; then',
    stubSequence(
      root,
      "docker-memory",
      scenario.memory ?? [
        { output: "2000000000" },
        { output: "2000000000" },
        { output: "4200000000" },
      ],
    ),
    "  fi",
    '  if [[ "$1" == "context" && "$2" == "show" ]]; then',
    stubSequence(
      root,
      "docker-context",
      scenario.contexts ?? [{ output: "colima" }],
    ),
    "  fi",
    '  if [[ "$1" == "context" && "$2" == "inspect" ]]; then',
    `    printf '<%s>\\n' "$@" >> ${shellQuote(contextArguments)}`,
    stubSequence(
      root,
      "docker-endpoint",
      scenario.endpoints ?? [{ output: endpoint }],
    ),
    "  fi",
    '  if [[ "$1" == "ps" && "$2" == "--quiet" ]]; then',
    stubSequence(
      root,
      "docker-containers",
      scenario.activeContainers ?? [{ output: "" }],
    ),
    "  fi",
    '  if [[ "$1" == "ps" && "$2" == "--format" ]]; then',
    scenario.containerList
      ? `    printf '%s\\n' ${shellQuote(scenario.containerList)}`
      : "    :",
    "    return 0",
    "  fi",
    '  if [[ "$1" == "version" ]]; then',
    `    return ${scenario.dockerVersionStatus ?? 0}`,
    "  fi",
    '  printf "unexpected docker command: %s\\n" "$*" >&2',
    "  return 97",
    "}",
    "colima() {",
    '  if [[ "$1" == "status" ]]; then',
    `    printf '<%s>\\n' "$@" >> ${shellQuote(statusArguments)}`,
    stubSequence(
      root,
      "colima-status",
      scenario.statuses ?? [
        { output: colimaStatusJson(2_147_483_648) },
        { output: colimaStatusJson(2_147_483_648) },
        { output: colimaStatusJson(4_294_967_296) },
      ],
    ),
    "  fi",
    '  if [[ "$1" == "stop" ]]; then',
    `    printf '<%s>\\n' "$@" > ${shellQuote(stopArguments)}`,
    `    return ${scenario.stopStatus ?? 0}`,
    "  fi",
    '  if [[ "$1" == "start" ]]; then',
    `    printf '<%s>\\n' "$@" > ${shellQuote(startArguments)}`,
    `    return ${scenario.startStatus ?? 0}`,
    "  fi",
    '  printf "unexpected colima command: %s\\n" "$*" >&2',
    "  return 96",
    "}",
    `is_interactive_terminal() { return ${scenario.interactive === false ? 1 : 0}; }`,
    scenario.answer === undefined
      ? "ensure_deploy_runner_memory"
      : `ensure_deploy_runner_memory <<< ${shellQuote(scenario.answer)}`,
    scenario.after ?? "",
  ].filter(Boolean).join("\n");
  return {
    result: runFixture(root, body),
    stopArguments,
    startArguments,
    contextArguments,
    statusArguments,
  };
}

test("MEM-01: Docker memoryが閾値以上ならColimaを呼ばず継続する", () => {
  for (const memory of ["4000000000", "4000000001", "8307826688"]) {
    const root = initializeWrapperFixture();
    const colimaMarker = join(root, "unexpected-colima");
    try {
      const result = runFixture(
        root,
        [
          `docker() { [[ "$1" == "info" ]] && printf '%s\\n' ${memory}; }`,
          `colima() { : > ${shellQuote(colimaMarker)}; return 1; }`,
          "ensure_deploy_runner_memory",
          "printf continued",
        ].join("\n"),
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /continued$/u);
      assert.equal(spawnSync("test", ["-e", colimaMarker]).status, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const root = initializeWrapperFixture();
  try {
    const { result } = runMemoryPreflightFixture(root, {
      memory: [{ output: "3999999999" }],
      interactive: false,
    });
    assert.notEqual(result.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MEM-02: active contextとColima statusのprofile runtime socketが完全一致する", () => {
  for (const fixture of [
    {
      context: "colima",
      endpoint: "unix:///Users/test/.colima/default/docker.sock",
      profile: "default",
    },
    {
      context: "colima-team",
      endpoint: "unix:///Users/test/.colima/team/docker.sock",
      profile: "team",
    },
  ]) {
    const root = initializeWrapperFixture();
    try {
      const { result, statusArguments } = runMemoryPreflightFixture(root, {
        contexts: [{ output: fixture.context }],
        endpoints: [{ output: fixture.endpoint }],
        statuses: [{ output: colimaStatusJson(2_147_483_648, fixture.endpoint) }],
        activeContainers: [{ output: "container-id" }],
      });
      assert.notEqual(result.status, 0);
      assert.match(
        readFileSync(statusArguments, "utf8"),
        new RegExp(`<status>\\n<${fixture.profile}>\\n<--json>`, "u"),
      );
      assert.match(result.stderr, /Active Docker containers/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  for (const status of [
    colimaStatusJson(2_147_483_648, "unix:///wrong/docker.sock"),
    colimaStatusJson(2_147_483_648, undefined, "containerd"),
    '{"runtime":"docker","docker_socket":"unix:///x","memory":"invalid"}',
    '{"runtime":"docker","runtime":"docker","docker_socket":"unix:///x","memory":2147483648}',
  ]) {
    const root = initializeWrapperFixture();
    try {
      const { result, stopArguments } = runMemoryPreflightFixture(root, {
        statuses: [{ output: status }],
      });
      assert.notEqual(result.status, 0);
      assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("MEM-03: Docker endpoint override時はColima変更前に停止する", () => {
  for (const environment of [
    ["DOCKER_HOST=unix:///explicit/docker.sock"],
    ["DOCKER_CONTEXT=colima"],
    ["DOCKER_HOST=unix:///explicit/docker.sock", "DOCKER_CONTEXT=colima"],
  ]) {
    const root = initializeWrapperFixture();
    try {
      const { result, stopArguments } = runMemoryPreflightFixture(root, { environment });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /explicitly overrides Docker endpoint ownership/u);
      assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("MEM-04: 非Colimaまたは所有権不一致は変更せず停止する", () => {
  const cases: MemoryPreflightScenario[] = [
    { contexts: [{ output: "desktop-linux" }] },
    { contexts: [{ output: "colima" }], endpoints: [{ output: "tcp://remote:2375" }] },
    { colimaAvailable: false },
    { statuses: [{ status: 1 }] },
    { statuses: [{ output: colimaStatusJson(2_147_483_648, undefined, "containerd") }] },
    { statuses: [{ output: colimaStatusJson(2_147_483_648, "unix:///wrong/docker.sock") }] },
  ];
  for (const scenario of cases) {
    const root = initializeWrapperFixture();
    try {
      const { result, stopArguments } = runMemoryPreflightFixture(root, scenario);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Configure the current Docker engine/u);
      assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("MEM-05: 稼働コンテナがあればpromptとColima変更を行わない", () => {
  const root = initializeWrapperFixture();
  try {
    const { result, stopArguments } = runMemoryPreflightFixture(root, {
      activeContainers: [{ output: "one\ntwo" }],
      containerList: "one app image:one Up 1 minute\ntwo db image:two Paused",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /one app image:one/u);
    assert.match(result.stderr, /two db image:two/u);
    assert.doesNotMatch(result.stderr, /続行しますか/u);
    assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MEM-06: yとyesだけがColima変更を承認する", () => {
  for (const answer of ["y", "yes", "Y", "YES"]) {
    const root = initializeWrapperFixture();
    try {
      const { result, startArguments } = runMemoryPreflightFixture(root, { answer });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(spawnSync("test", ["-e", startArguments]).status, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  for (const answer of ["", "n", "later"]) {
    const root = initializeWrapperFixture();
    try {
      const { result, stopArguments } = runMemoryPreflightFixture(root, { answer });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /memory change was refused/u);
      assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("MEM-07: 非対話の低メモリColimaはpromptせず停止する", () => {
  const root = initializeWrapperFixture();
  try {
    const { result, stopArguments } = runMemoryPreflightFixture(root, {
      interactive: false,
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /続行しますか/u);
    assert.match(result.stderr, /interactive terminal is required/u);
    assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MEM-08: 承認後driftはColima停止前に拒否する", () => {
  const driftCases: MemoryPreflightScenario[] = [
    {
      answer: "y",
      contexts: [{ output: "colima" }, { output: "colima-team" }],
    },
    {
      answer: "y",
      endpoints: [
        { output: "unix:///Users/test/.colima/default/docker.sock" },
        { output: "unix:///Users/test/.colima/changed/docker.sock" },
      ],
    },
    {
      answer: "y",
      statuses: [
        { output: colimaStatusJson(2_147_483_648) },
        {
          output: colimaStatusJson(
            2_147_483_648,
            "unix:///Users/test/.colima/changed/docker.sock",
          ),
        },
      ],
    },
    {
      answer: "y",
      activeContainers: [{ output: "" }, { output: "new-container" }],
    },
  ];
  for (const scenario of driftCases) {
    const root = initializeWrapperFixture();
    try {
      const { result, stopArguments } = runMemoryPreflightFixture(root, scenario);
      assert.notEqual(result.status, 0);
      assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const root = initializeWrapperFixture();
  try {
    const continued = join(root, "continued-without-restart");
    const { result, stopArguments } = runMemoryPreflightFixture(root, {
      answer: "yes",
      memory: [{ output: "2000000000" }, { output: "4200000000" }],
      after: `: > ${shellQuote(continued)}`,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
    assert.equal(spawnSync("test", ["-e", continued]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const changedOwnerRoot = initializeWrapperFixture();
  try {
    const { result, stopArguments } = runMemoryPreflightFixture(changedOwnerRoot, {
      answer: "yes",
      memory: [{ output: "2000000000" }, { output: "4200000000" }],
      endpoints: [
        { output: "unix:///Users/test/.colima/default/docker.sock" },
        { output: "unix:///Users/test/.colima/changed/docker.sock" },
      ],
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ownership changed after approval/u);
    assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
  } finally {
    rmSync(changedOwnerRoot, { recursive: true, force: true });
  }
});

test("MEM-09: 承認済みprofileを4 GiBへ変更して再検証後に継続する", () => {
  for (const fixture of [
    {
      context: "colima",
      endpoint: "unix:///Users/test/.colima/default/docker.sock",
      profile: "default",
    },
    {
      context: "colima-team",
      endpoint: "unix:///Users/test/.colima/team/docker.sock",
      profile: "team",
    },
  ]) {
    const root = initializeWrapperFixture();
    const continued = join(root, "continued");
    try {
      const { result, stopArguments, startArguments } = runMemoryPreflightFixture(root, {
        answer: "yes",
        contexts: [{ output: fixture.context }],
        endpoints: [{ output: fixture.endpoint }],
        statuses: [
          { output: colimaStatusJson(2_147_483_648, fixture.endpoint) },
          { output: colimaStatusJson(2_147_483_648, fixture.endpoint) },
          { output: colimaStatusJson(4_294_967_296, fixture.endpoint) },
        ],
        after: `: > ${shellQuote(continued)}`,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        readFileSync(stopArguments, "utf8"),
        `<stop>\n<${fixture.profile}>\n`,
      );
      assert.equal(
        readFileSync(startArguments, "utf8"),
        `<start>\n<${fixture.profile}>\n<--memory>\n<4>\n<--save-config>\n`,
      );
      assert.equal(spawnSync("test", ["-e", continued]).status, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("MEM-10: Colima変更失敗はcloud操作前に停止する", () => {
  const cases: MemoryPreflightScenario[] = [
    { answer: "y", stopStatus: 1 },
    { answer: "y", startStatus: 1 },
    { answer: "y", dockerVersionStatus: 1 },
    {
      answer: "y",
      statuses: [
        { output: colimaStatusJson(2_147_483_648) },
        { output: colimaStatusJson(2_147_483_648) },
        { status: 1 },
      ],
    },
    {
      answer: "y",
      statuses: [
        { output: colimaStatusJson(2_147_483_648) },
        { output: colimaStatusJson(2_147_483_648) },
        { output: colimaStatusJson(4_294_967_296, "unix:///Users/test/.colima/other/docker.sock") },
      ],
    },
    {
      answer: "y",
      memory: [{ output: "2000000000" }],
      statuses: [
        { output: colimaStatusJson(2_147_483_648) },
        { output: colimaStatusJson(2_147_483_648) },
        { output: colimaStatusJson(4_294_967_296) },
      ],
    },
  ];
  for (const scenario of cases) {
    const root = initializeWrapperFixture();
    const cloudMarker = join(root, "cloud-operation");
    try {
      const { result } = runMemoryPreflightFixture(root, {
        ...scenario,
        after: `: > ${shellQuote(cloudMarker)}`,
      });
      assert.notEqual(result.status, 0);
      assert.equal(spawnSync("test", ["-e", cloudMarker]).status, 1);
      assert.match(result.stderr, /profile 'default'|Docker memory|ownership/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("MEM-11: 構成済み4 GiB以上は低い値へ再設定しない", () => {
  const root = initializeWrapperFixture();
  try {
    const { result, stopArguments } = runMemoryPreflightFixture(root, {
      statuses: [{ output: colimaStatusJson(8_589_934_592) }],
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already has at least 4 GiB configured/u);
    assert.equal(spawnSync("test", ["-e", stopArguments]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MEM-12: memory preflightはAWSとrunner buildより前に実行される", () => {
  const source = readFileSync(deployScript, "utf8");
  assert.match(
    source,
    /require_clean_worktree\s+ensure_deploy_runner_memory\s+resolve_aws_profile "\$\{requested_profile\}"\s+read_aws_account_id\s+log_wrapper_step "Immutable deploy runner imageを準備しています"\s+build_deploy_runner_image/u,
  );
  const root = initializeWrapperFixture();
  const cloudMarker = join(root, "cloud-operation");
  try {
    const { result } = runMemoryPreflightFixture(root, {
      interactive: false,
      after: `: > ${shellQuote(cloudMarker)}`,
    });
    assert.notEqual(result.status, 0);
    assert.equal(spawnSync("test", ["-e", cloudMarker]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MEM-DOC-01: runbookはColima memory preflight契約を固定する", () => {
  for (const path of [
    "docs/deploy/vercel-neon/initial-deploy.md",
    "docs/deploy/vercel-neon/redeploy.md",
  ]) {
    const runbook = readFileSync(join(projectRoot, path), "utf8");
    assert.match(runbook, /4 GB-class/u);
    assert.match(runbook, /Colima[^\n]*4 GiB/u);
    assert.match(runbook, /\[y\/N\]/u);
    assert.match(runbook, /稼働container/u);
    assert.match(runbook, /Colima以外/u);
    assert.match(runbook, /再検証/u);
    assert.match(runbook, /AWS、DB、Vercel/u);
    assert.match(runbook, /colima status <profile>/u);
  }
});

test("pending migration phase returns 75 without changing caller errexit", () => {
  const root = initializeWrapperFixture();
  const output = join(root, "phase-output");
  try {
    mkdirSync(output, { mode: 0o700 });
    const common = [
      "DEPLOY_AWS_ACCOUNT_ID=123456789012",
      "DEPLOY_AWS_PROFILE=deploy-test",
      "DEPLOY_RUNNER_IMAGE=deploy-test:fixture",
      "DEPLOY_LOG_STYLE=plain",
      "read_aws_account_id() { :; }",
      "stream_ssm_context() { :; }",
      "docker() { return 75; }",
    ];
    const disabled = runFixture(
      root,
      [
        ...common,
        "set +e",
        `run_deploy_phase validate ${shellQuote(output)}`,
        "phase_status=$?",
        "case $- in *e*) exit 90 ;; esac",
        `printf 'captured:%s' "\${phase_status}"`,
      ].join("\n"),
    );
    assert.equal(disabled.status, 0, disabled.stderr);
    assert.equal(disabled.stdout, "captured:75");

    const enabled = runFixture(
      root,
      [
        ...common,
        "set -e",
        `if run_deploy_phase validate ${shellQuote(output)}; then`,
        "  phase_status=0",
        "else",
        "  phase_status=$?",
        "fi",
        "case $- in *e*) : ;; *) exit 91 ;; esac",
        `printf 'captured:%s' "\${phase_status}"`,
      ].join("\n"),
    );
    assert.equal(enabled.status, 0, enabled.stderr);
    assert.equal(enabled.stdout, "captured:75");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("interactive deployment logs use ANSI unless color is disabled", () => {
  const root = initializeWrapperFixture();
  try {
    const colored = runFixture(
      root,
      [
        "is_deploy_color_terminal() { return 0; }",
        "unset NO_COLOR",
        "TERM=xterm-256color",
        "resolve_deploy_log_style",
        "DEPLOY_LOG_STYLE=ansi",
        "log_wrapper_success complete",
      ].join("\n"),
    );
    assert.equal(colored.status, 0, colored.stderr);
    assert.match(
      colored.stdout,
      /^ansi\n\u001B\[1;32m✓ complete\u001B\[0m\n$/u,
    );

    const noColor = runFixture(
      root,
      [
        "is_deploy_color_terminal() { return 0; }",
        "NO_COLOR=",
        "TERM=xterm-256color",
        "resolve_deploy_log_style",
      ].join("\n"),
    );
    assert.equal(noColor.status, 0, noColor.stderr);
    assert.equal(noColor.stdout, "plain\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-interactive and dumb terminals keep deployment logs plain", () => {
  const root = initializeWrapperFixture();
  try {
    const nonInteractive = runFixture(
      root,
      [
        "is_deploy_color_terminal() { return 1; }",
        "unset NO_COLOR",
        "TERM=xterm-256color",
        "resolve_deploy_log_style",
      ].join("\n"),
    );
    assert.equal(nonInteractive.status, 0, nonInteractive.stderr);
    assert.equal(nonInteractive.stdout, "plain\n");

    const dumbTerminal = runFixture(
      root,
      [
        "is_deploy_color_terminal() { return 0; }",
        "unset NO_COLOR",
        "TERM=dumb",
        "resolve_deploy_log_style",
      ].join("\n"),
    );
    assert.equal(dumbTerminal.status, 0, dumbTerminal.stderr);
    assert.equal(dumbTerminal.stdout, "plain\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AWS cache mountpoint creation is private and rejects symlinks", () => {
  const root = initializeWrapperFixture();
  const awsHome = join(root, "aws-home");
  const awsDirectory = join(awsHome, ".aws");
  try {
    mkdirSync(awsDirectory, { recursive: true, mode: 0o700 });
    const created = runFixture(
      root,
      `HOME=${shellQuote(awsHome)}\nprepare_aws_host_directory`,
    );
    assert.equal(created.status, 0, created.stderr);
    assert.equal(created.stdout, `${awsDirectory}\n`);
    assert.equal(lstatSync(join(awsDirectory, "cli")).mode & 0o777, 0o700);
    assert.equal(
      lstatSync(join(awsDirectory, "cli", "cache")).mode & 0o777,
      0o700,
    );
    const createdSso = runFixture(
      root,
      `HOME=${shellQuote(awsHome)}\nprepare_aws_sso_cache_directory`,
    );
    assert.equal(createdSso.status, 0, createdSso.stderr);
    assert.equal(createdSso.stdout, `${join(awsDirectory, "sso", "cache")}\n`);
    assert.equal(lstatSync(join(awsDirectory, "sso")).mode & 0o777, 0o700);
    assert.equal(
      lstatSync(join(awsDirectory, "sso", "cache")).mode & 0o777,
      0o700,
    );

    rmSync(join(awsDirectory, "cli", "cache"), { recursive: true });
    symlinkSync("../outside", join(awsDirectory, "cli", "cache"));
    const rejected = runFixture(
      root,
      `HOME=${shellQuote(awsHome)}\nprepare_aws_host_directory`,
    );
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /cache directory is unavailable or unsafe/);

    rmSync(join(awsDirectory, "cli", "cache"));
    mkdirSync(join(awsDirectory, "cli", "cache"), { mode: 0o700 });
    rmSync(join(awsDirectory, "sso", "cache"), { recursive: true });
    symlinkSync("../../outside", join(awsDirectory, "sso", "cache"));
    const rejectedSso = runFixture(
      root,
      `HOME=${shellQuote(awsHome)}\nprepare_aws_sso_cache_directory`,
    );
    assert.notEqual(rejectedSso.status, 0);
    assert.match(
      rejectedSso.stderr,
      /cache directory is unavailable or unsafe/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

test("AWS authentication failure identifies the selected profile without exposing AWS stderr", () => {
  const root = initializeWrapperFixture();
  const syntheticAwsError = "synthetic-aws-auth-error-secret";
  try {
    const result = runFixture(
      root,
      [
        "DEPLOY_AWS_PROFILE=demo-keien-01",
        `run_aws_helper() { printf '%s\\n' ${shellQuote(syntheticAwsError)} >&2; return 255; }`,
        "read_aws_account_id",
      ].join("\n"),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /profile 'demo-keien-01'/);
    assert.match(result.stderr, /aws sso login --profile demo-keien-01/);
    assert.ok(!result.stderr.includes(syntheticAwsError));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an expired interactive SSO session can login once and resume the original command", () => {
  const root = initializeWrapperFixture();
  const firstAttemptMarker = join(root, "first-sts-attempt");
  const loginMarker = join(root, "sso-login");
  try {
    const result = runFixture(
      root,
      [
        "DEPLOY_AWS_PROFILE=demo-keien-01",
        "is_interactive_terminal() { return 0; }",
        "aws_profile_uses_sso() { return 0; }",
        [
          "run_aws_helper() {",
          `  if [[ ! -e ${shellQuote(firstAttemptMarker)} ]]; then`,
          `    : > ${shellQuote(firstAttemptMarker)}`,
          "    printf '%s\\n' 'Error loading SSO Token: Token has expired and refresh failed' >&2",
          "    return 255",
          "  fi",
          "  printf '%s\\n' '444134576171'",
          "}",
        ].join("\n"),
        `run_aws_sso_login() { : > ${shellQuote(loginMarker)}; }`,
        "read_aws_account_id <<< 'y'",
        "printf '%s' \"${DEPLOY_AWS_ACCOUNT_ID}\"",
      ].join("\n"),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "444134576171");
    assert.equal(spawnSync("test", ["-e", loginMarker]).status, 0);
    assert.match(result.stderr, /ログインして処理を続行しますか\? \[y\/N\]/u);
    assert.match(result.stderr, /Continuing the original command/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("declining an expired SSO login stops without starting login", () => {
  const root = initializeWrapperFixture();
  const loginMarker = join(root, "must-not-login");
  try {
    const result = runFixture(
      root,
      [
        "DEPLOY_AWS_PROFILE=demo-keien-01",
        "is_interactive_terminal() { return 0; }",
        "aws_profile_uses_sso() { return 0; }",
        "run_aws_helper() { printf '%s\\n' 'Error loading SSO Token' >&2; return 255; }",
        `run_aws_sso_login() { : > ${shellQuote(loginMarker)}; }`,
        "read_aws_account_id <<< 'n'",
      ].join("\n"),
    );
    assert.notEqual(result.status, 0);
    assert.equal(spawnSync("test", ["-e", loginMarker]).status, 1);
    assert.match(result.stderr, /ログインして処理を続行しますか/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-interactive expired SSO sessions fail without starting login", () => {
  const root = initializeWrapperFixture();
  const loginMarker = join(root, "must-not-login");
  try {
    const result = runFixture(
      root,
      [
        "DEPLOY_AWS_PROFILE=demo-keien-01",
        "is_interactive_terminal() { return 1; }",
        "aws_profile_uses_sso() { return 0; }",
        "run_aws_helper() { printf '%s\\n' 'Error loading SSO Token' >&2; return 255; }",
        `run_aws_sso_login() { : > ${shellQuote(loginMarker)}; }`,
        "read_aws_account_id",
      ].join("\n"),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /aws sso login --profile demo-keien-01/);
    assert.equal(spawnSync("test", ["-e", loginMarker]).status, 1);
    assert.doesNotMatch(result.stderr, /ログインして処理を続行しますか/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-SSO authentication failures never start interactive SSO login", () => {
  const root = initializeWrapperFixture();
  const loginMarker = join(root, "must-not-login");
  try {
    const result = runFixture(
      root,
      [
        "DEPLOY_AWS_PROFILE=static-profile",
        "is_interactive_terminal() { return 0; }",
        "aws_profile_uses_sso() { return 1; }",
        "run_aws_helper() { printf '%s\\n' 'AccessDenied' >&2; return 255; }",
        `run_aws_sso_login() { : > ${shellQuote(loginMarker)}; }`,
        "read_aws_account_id <<< 'y'",
      ].join("\n"),
    );
    assert.notEqual(result.status, 0);
    assert.equal(spawnSync("test", ["-e", loginMarker]).status, 1);
    assert.doesNotMatch(result.stderr, /ログインして処理を続行しますか/u);
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

test("reviewed handoff suppresses only the duplicate optional .env prompt", () => {
  const root = initializeWrapperFixture();
  try {
    const result = runFixture(
      root,
      [
        "DEPLOY_AWS_PROFILE=splai-prd",
        "DEPLOY_ENV_WAS_ABSENT=1",
        "DEPLOY_INTERNAL_SKIP_ENV_PROMPT=1",
        "maybe_create_env_file",
        "printf continued",
      ].join("\n"),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "continued");
    assert.equal(result.stderr, "");
    assert.equal(spawnSync("test", ["-e", join(root, ".env")]).status, 1);
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
