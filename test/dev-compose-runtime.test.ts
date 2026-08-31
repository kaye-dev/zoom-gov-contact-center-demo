import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const runtimeHelperPath = join(repositoryRoot, "scripts/dev-compose-runtime.zsh");
const wrapperPath = join(repositoryRoot, "dev-compose.sh");

type RuntimeFixture = {
  root: string;
  checkout: string;
  gitDirectory: string;
  gitCommonDirectory: string;
  stateRoot: string;
  stubDirectory: string;
};

function writeExecutable(path: string, body: string) {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

function createRuntimeFixture(mode: "local" | "worktree", commonRoot?: string): RuntimeFixture {
  const root = mkdtempSync(join(tmpdir(), "zoom-runtime-test-"));
  const checkout = join(root, "checkout");
  const commonDirectory = commonRoot ?? join(root, "common.git");
  const gitDirectory = mode === "local" ? commonDirectory : join(root, "linked.git");
  const stateRoot = join(root, "state");
  const stubDirectory = join(root, "bin");
  mkdirSync(checkout, { recursive: true });
  mkdirSync(commonDirectory, { recursive: true });
  mkdirSync(gitDirectory, { recursive: true });
  mkdirSync(stubDirectory, { recursive: true });
  writeExecutable(join(stubDirectory, "lsof"), "exit 1");
  writeExecutable(
    join(stubDirectory, "docker"),
    'if [ "$1" = "info" ]; then exit 1; fi\nexit 1',
  );
  return { root, checkout, gitDirectory, gitCommonDirectory: commonDirectory, stateRoot, stubDirectory };
}

function fixtureEnv(fixture: RuntimeFixture): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DEV_RUNTIME_CHECKOUT_OVERRIDE: fixture.checkout,
    DEV_RUNTIME_GIT_DIR_OVERRIDE: fixture.gitDirectory,
    DEV_RUNTIME_GIT_COMMON_DIR_OVERRIDE: fixture.gitCommonDirectory,
    DEV_RUNTIME_STATE_ROOT: fixture.stateRoot,
    PATH: `${fixture.stubDirectory}:${process.env.PATH ?? ""}`,
  };
}

function runHelper(fixture: RuntimeFixture, body: string) {
  return execFileSyncWithResult(
    "zsh",
    ["-c", `set -euo pipefail; source "$1"; ${body}`, "zsh", runtimeHelperPath],
    fixtureEnv(fixture),
  );
}

function execFileSyncWithResult(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", env });
}

function parseContext(output: string) {
  return Object.fromEntries(
    output
      .trim()
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function candidateSlot(path: string) {
  const digest = createHash("sha256").update(realpathSync(path)).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 800;
}

function repositoryStateRoot(fixture: RuntimeFixture) {
  const digest = createHash("sha256")
    .update(realpathSync(fixture.gitCommonDirectory))
    .digest("hex")
    .slice(0, 12);
  return join(fixture.stateRoot, digest);
}

test("RT-01: Local checkout uses the fixed runtime identity", (context) => {
  const fixture = createRuntimeFixture("local");
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  const result = runHelper(fixture, "dev_runtime_prepare; dev_runtime_print_context");
  assert.equal(result.status, 0, result.stderr);
  const runtime = parseContext(result.stdout);
  assert.deepEqual(
    {
      mode: runtime.RUNTIME_MODE,
      id: runtime.RUNTIME_ID,
      project: runtime.COMPOSE_PROJECT_NAME,
      web: runtime.HOST_PORT,
      database: runtime.POSTGRES_PORT,
      studio: runtime.STUDIO_PORT,
      origin: runtime.WEB_ORIGIN,
    },
    {
      mode: "local",
      id: "local",
      project: "zoom-gov-contact-center-demo",
      web: "3000",
      database: "5432",
      studio: "5555",
      origin: "http://localhost:3000",
    },
  );
});

test("RT-02: worktrees receive stable and distinct projects and port slots", (context) => {
  const sharedRoot = mkdtempSync(join(tmpdir(), "zoom-runtime-common-"));
  const common = join(sharedRoot, "common.git");
  mkdirSync(common, { recursive: true });
  const first = createRuntimeFixture("worktree", common);
  const second = createRuntimeFixture("worktree", common);
  context.after(() => {
    rmSync(first.root, { force: true, recursive: true });
    rmSync(second.root, { force: true, recursive: true });
    rmSync(sharedRoot, { force: true, recursive: true });
  });
  const firstResult = runHelper(first, "dev_runtime_prepare; dev_runtime_print_context");
  const secondResult = runHelper(second, "dev_runtime_prepare; dev_runtime_print_context");
  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  const firstRuntime = parseContext(firstResult.stdout);
  const secondRuntime = parseContext(secondResult.stdout);
  assert.notEqual(firstRuntime.RUNTIME_ID, secondRuntime.RUNTIME_ID);
  assert.notEqual(firstRuntime.COMPOSE_PROJECT_NAME, secondRuntime.COMPOSE_PROJECT_NAME);
  assert.notEqual(firstRuntime.HOST_PORT, secondRuntime.HOST_PORT);
  assert.equal(Number(firstRuntime.POSTGRES_PORT) - Number(firstRuntime.HOST_PORT), 12332);
  assert.equal(Number(firstRuntime.STUDIO_PORT) - Number(firstRuntime.HOST_PORT), 22455);

  const repeated = runHelper(first, "dev_runtime_prepare; dev_runtime_print_context");
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(parseContext(repeated.stdout).HOST_PORT, firstRuntime.HOST_PORT);
});

test("RT-03: concurrent colliding allocations are serialized into different slots", async (context) => {
  const sharedRoot = mkdtempSync(join(tmpdir(), "zoom-runtime-lock-"));
  const common = join(sharedRoot, "common.git");
  const stateRoot = join(sharedRoot, "state");
  mkdirSync(common, { recursive: true });
  const fixtures: RuntimeFixture[] = [];
  const bySlot = new Map<number, RuntimeFixture>();

  for (let index = 0; index < 2000; index += 1) {
    const fixture = createRuntimeFixture("worktree", common);
    fixture.stateRoot = stateRoot;
    const slot = candidateSlot(fixture.checkout);
    const existing = bySlot.get(slot);
    if (existing) {
      fixtures.push(existing, fixture);
      break;
    }
    bySlot.set(slot, fixture);
  }
  assert.equal(fixtures.length, 2, "failed to find a deterministic hash collision");
  context.after(() => {
    for (const fixture of new Set([...bySlot.values(), ...fixtures])) {
      rmSync(fixture.root, { force: true, recursive: true });
    }
    rmSync(sharedRoot, { force: true, recursive: true });
  });

  const command = 'set -euo pipefail; source "$1"; dev_runtime_prepare; dev_runtime_print_context';
  const [first, second] = await Promise.all(
    fixtures.map((fixture) =>
      execFileAsync("zsh", ["-c", command, "zsh", runtimeHelperPath], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: fixtureEnv(fixture),
      }),
    ),
  );
  const firstRuntime = parseContext(first.stdout);
  const secondRuntime = parseContext(second.stdout);
  assert.notEqual(firstRuntime.HOST_PORT, secondRuntime.HOST_PORT);
  assert.equal(
    Math.abs(Number(firstRuntime.HOST_PORT) - Number(secondRuntime.HOST_PORT)),
    1,
  );
});

test("RT-09: a manifest for another checkout fails closed", (context) => {
  const fixture = createRuntimeFixture("worktree");
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  const prepared = runHelper(fixture, "dev_runtime_prepare");
  assert.equal(prepared.status, 0, prepared.stderr);
  const manifest = join(fixture.checkout, ".codex/runtime.local.env");
  writeFileSync(
    manifest,
    readFileSync(manifest, "utf8").replace(
      `RUNTIME_CHECKOUT_PATH=${realpathSync(fixture.checkout)}`,
      "RUNTIME_CHECKOUT_PATH=/foreign/checkout",
    ),
  );
  const result = runHelper(fixture, "dev_runtime_prepare");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest identity does not match/u);
});

test("RT-09: active leases are preserved and stopped stale leases are reclaimed", (context) => {
  const activeFixture = createRuntimeFixture("worktree");
  const staleFixture = createRuntimeFixture("worktree");
  context.after(() => {
    rmSync(activeFixture.root, { force: true, recursive: true });
    rmSync(staleFixture.root, { force: true, recursive: true });
  });

  const activeSlot = candidateSlot(activeFixture.checkout);
  const activeOwner = join(activeFixture.root, "active-owner");
  mkdirSync(activeOwner, { recursive: true });
  const activeStateRoot = repositoryStateRoot(activeFixture);
  mkdirSync(activeStateRoot, { recursive: true });
  const activeLease = join(activeStateRoot, `slot-${activeSlot}.lease`);
  writeFileSync(
    activeLease,
    [
      "RUNTIME_SCHEMA_VERSION=1",
      "RUNTIME_ID=foreign-active",
      `RUNTIME_CHECKOUT_PATH=${activeOwner}`,
      `RUNTIME_SLOT=${activeSlot}`,
      "UPDATED_AT=2026-08-30T00:00:00Z",
      "",
    ].join("\n"),
  );
  const activeProbe = runHelper(
    activeFixture,
    `dev_runtime_resolve_identity; if dev_runtime_lease_is_reserved_by_other ${activeSlot}; then print reserved; else print available; fi`,
  );
  assert.equal(activeProbe.status, 0, activeProbe.stderr);
  assert.equal(activeProbe.stdout.trim(), "reserved");
  const activeResult = runHelper(
    activeFixture,
    "dev_runtime_prepare; dev_runtime_print_context",
  );
  assert.equal(activeResult.status, 0, activeResult.stderr);
  assert.equal(
    Number(parseContext(activeResult.stdout).HOST_PORT),
    3100 + ((activeSlot + 1) % 800),
  );
  assert.match(readFileSync(activeLease, "utf8"), /RUNTIME_ID=foreign-active/u);

  const staleSlot = candidateSlot(staleFixture.checkout);
  const staleStateRoot = repositoryStateRoot(staleFixture);
  mkdirSync(staleStateRoot, { recursive: true });
  const staleLease = join(staleStateRoot, `slot-${staleSlot}.lease`);
  writeFileSync(
    staleLease,
    [
      "RUNTIME_SCHEMA_VERSION=1",
      "RUNTIME_ID=foreign-stale",
      `RUNTIME_CHECKOUT_PATH=${join(staleFixture.root, "removed-owner")}`,
      `RUNTIME_SLOT=${staleSlot}`,
      "UPDATED_AT=2026-08-30T00:00:00Z",
      "",
    ].join("\n"),
  );
  const staleResult = runHelper(
    staleFixture,
    "dev_runtime_prepare; dev_runtime_print_context",
  );
  assert.equal(staleResult.status, 0, staleResult.stderr);
  const staleRuntime = parseContext(staleResult.stdout);
  assert.equal(Number(staleRuntime.HOST_PORT), 3100 + staleSlot);
  const reclaimedLease = readFileSync(staleLease, "utf8");
  assert.match(reclaimedLease, new RegExp(`RUNTIME_ID=${staleRuntime.RUNTIME_ID}`, "u"));
  assert.match(
    reclaimedLease,
    new RegExp(`RUNTIME_CHECKOUT_PATH=${realpathSync(staleFixture.checkout)}`, "u"),
  );
});

test("RT-05: Local status reports a foreign native listener without stopping it", (context) => {
  const fixture = createRuntimeFixture("local");
  const commandLog = join(fixture.root, "commands.log");
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  writeExecutable(
    join(fixture.stubDirectory, "lsof"),
    [
      'case "$*" in',
      '  *"-t -iTCP:3000"*) printf "4242\\n" ;;',
      '  *"-a -p 4242"*) printf "p4242\\nfcwd\\nn/foreign/checkout\\n" ;;',
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  );
  writeExecutable(join(fixture.stubDirectory, "ps"), 'printf "next-server (v16.3.0)\\n"');
  writeExecutable(join(fixture.stubDirectory, "curl"), "exit 0");
  writeExecutable(join(fixture.stubDirectory, "kill"), `printf 'kill\\n' >> '${commandLog}'`);
  const result = execFileSyncWithResult(
    "zsh",
    [wrapperPath, "status"],
    fixtureEnv(fixture),
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /expected .*checkout/u);
  assert.throws(() => readFileSync(commandLog, "utf8"), /ENOENT/u);
});

test("RT-04: Local ensure reuses an exact healthy native runtime without lifecycle calls", (context) => {
  const fixture = createRuntimeFixture("local");
  const dockerLog = join(fixture.root, "docker.log");
  const colimaLog = join(fixture.root, "colima.log");
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  writeExecutable(
    join(fixture.stubDirectory, "lsof"),
    [
      'case "$*" in',
      '  *"-t -iTCP:3000"*) printf "4242\\n" ;;',
      `  *"-a -p 4242"*) printf "p4242\\nfcwd\\nn${fixture.checkout}\\n" ;;`,
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  );
  writeExecutable(
    join(fixture.stubDirectory, "ps"),
    [
      'case "$*" in',
      '  *"command="*) printf "next-server (v16.3.0)\\n" ;;',
      '  *"lstart="*) printf "Sat Aug 30 12:00:00 2026\\n" ;;',
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  );
  writeExecutable(join(fixture.stubDirectory, "curl"), "exit 0");
  writeExecutable(
    join(fixture.stubDirectory, "docker"),
    `printf '%s\\n' "$*" >> '${dockerLog}'\nexit 1`,
  );
  writeExecutable(
    join(fixture.stubDirectory, "colima"),
    `printf '%s\\n' "$*" >> '${colimaLog}'\nexit 1`,
  );

  const result = execFileSyncWithResult("zsh", [wrapperPath, "ensure"], fixtureEnv(fixture));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Reusing healthy native Next\.js PID 4242/u);
  assert.match(result.stdout, /ACTIVE_RUNTIME_IDENTIFIER=4242/u);
  assert.doesNotMatch(readFileSync(dockerLog, "utf8"), /compose|\bup\b|restart|stop/u);
  assert.throws(() => readFileSync(colimaLog, "utf8"), /ENOENT/u);
});

test("RT-11: native configuration drift persists until an explicit refresh", (context) => {
  const fixture = createRuntimeFixture("local");
  const dockerLog = join(fixture.root, "docker.log");
  const colimaLog = join(fixture.root, "colima.log");
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  writeExecutable(
    join(fixture.stubDirectory, "lsof"),
    [
      'case "$*" in',
      '  *"-t -iTCP:3000"*) printf "4242\\n" ;;',
      `  *"-a -p 4242"*) printf "p4242\\nfcwd\\nn${fixture.checkout}\\n" ;;`,
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  );
  writeExecutable(
    join(fixture.stubDirectory, "ps"),
    [
      'case "$*" in',
      '  *"command="*) printf "next-server (v16.3.0)\\n" ;;',
      '  *"lstart="*) printf "Sat Aug 30 12:00:00 2026\\n" ;;',
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  );
  writeExecutable(join(fixture.stubDirectory, "curl"), "exit 0");
  writeExecutable(
    join(fixture.stubDirectory, "docker"),
    `printf '%s\\n' "$*" >> '${dockerLog}'\nexit 1`,
  );
  writeExecutable(
    join(fixture.stubDirectory, "colima"),
    `printf '%s\\n' "$*" >> '${colimaLog}'\nexit 1`,
  );

  const prepared = execFileSyncWithResult(
    "zsh",
    [wrapperPath, "prepare"],
    fixtureEnv(fixture),
  );
  assert.equal(prepared.status, 0, prepared.stderr);
  const manifest = join(fixture.checkout, ".codex/runtime.local.env");
  const appliedDigest = readFileSync(manifest, "utf8").match(
    /^RUNTIME_CONFIG_DIGEST=(.+)$/mu,
  )?.[1];
  assert.ok(appliedDigest);
  writeFileSync(join(fixture.checkout, "compose.yaml"), "services: {}\n");

  const ensureResult = execFileSyncWithResult(
    "zsh",
    [wrapperPath, "ensure"],
    fixtureEnv(fixture),
  );
  assert.notEqual(ensureResult.status, 0);
  assert.match(ensureResult.stderr, /native Next\.js PID was preserved/u);
  assert.match(
    readFileSync(manifest, "utf8"),
    new RegExp(`^RUNTIME_CONFIG_DIGEST=${appliedDigest}$`, "mu"),
  );

  const statusUrl = execFileSyncWithResult(
    "zsh",
    [wrapperPath, "status", "--url"],
    fixtureEnv(fixture),
  );
  assert.notEqual(statusUrl.status, 0);
  assert.match(statusUrl.stderr, /requires an explicit refresh/u);
  assert.doesNotMatch(readFileSync(dockerLog, "utf8"), /compose|\bup\b|restart|stop/u);
  assert.throws(() => readFileSync(colimaLog, "utf8"), /ENOENT/u);
});

test("RT-08: scope overrides and project-wide destructive commands are blocked", (context) => {
  const fixture = createRuntimeFixture("local");
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  const override = execFileSyncWithResult(
    "zsh",
    [wrapperPath, "--project-name", "foreign", "ps"],
    fixtureEnv(fixture),
  );
  assert.equal(override.status, 1);
  assert.match(override.stderr, /cannot override/u);

  const down = execFileSyncWithResult("zsh", [wrapperPath, "down"], fixtureEnv(fixture));
  assert.equal(down.status, 2);
  assert.match(down.stderr, /blocked/u);
});

test("RT-06: every Compose invocation receives the validated project, directory, and env file", (context) => {
  const fixture = createRuntimeFixture("local");
  const commandLog = join(fixture.root, "docker.log");
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  copyFileSync(join(repositoryRoot, "compose.yaml"), join(fixture.checkout, "compose.yaml"));
  writeFileSync(join(fixture.checkout, ".env"), "SEED_ADMIN_EMAIL=fixture@example.local\n");
  writeExecutable(
    join(fixture.stubDirectory, "docker"),
    `printf '%s\\n' "$@" > '${commandLog}'\nexit 0`,
  );
  const result = execFileSyncWithResult(
    "zsh",
    [wrapperPath, "config", "--quiet"],
    fixtureEnv(fixture),
  );
  assert.equal(result.status, 0, result.stderr);
  const args = readFileSync(commandLog, "utf8").trim().split("\n");
  assert.deepEqual(args.slice(0, 2), ["compose", "--project-directory"]);
  assert.equal(args[2], realpathSync(fixture.checkout));
  assert.equal(args[3], "--env-file");
  assert.equal(args[4], join(realpathSync(fixture.checkout), ".env"));
  assert.equal(args[5], "--env-file");
  assert.equal(args[6], join(realpathSync(fixture.checkout), ".codex/runtime.local.env"));
  assert.deepEqual(args.slice(7, 9), ["-p", "zoom-gov-contact-center-demo"]);
  assert.deepEqual(args.slice(-2), ["config", "--quiet"]);
});

test("RT-06: worktree Compose adds only the validated persistent-volume override", (context) => {
  const fixture = createRuntimeFixture("worktree");
  const commandLog = join(fixture.root, "docker.log");
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  copyFileSync(join(repositoryRoot, "compose.yaml"), join(fixture.checkout, "compose.yaml"));
  copyFileSync(
    join(repositoryRoot, "compose.worktree.yaml"),
    join(fixture.checkout, "compose.worktree.yaml"),
  );
  writeExecutable(
    join(fixture.stubDirectory, "docker"),
    [
      'if [ "$1" = "info" ]; then exit 1; fi',
      `printf '%s\\n' "$@" > '${commandLog}'`,
      "exit 0",
    ].join("\n"),
  );

  const result = execFileSyncWithResult(
    "zsh",
    [wrapperPath, "config", "--quiet"],
    fixtureEnv(fixture),
  );
  assert.equal(result.status, 0, result.stderr);
  const args = readFileSync(commandLog, "utf8").trim().split("\n");
  const firstFile = args.indexOf("-f");
  assert.ok(firstFile > 0);
  assert.equal(args[firstFile + 1], join(realpathSync(fixture.checkout), "compose.yaml"));
  assert.equal(args[firstFile + 2], "-f");
  assert.equal(
    args[firstFile + 3],
    join(realpathSync(fixture.checkout), "compose.worktree.yaml"),
  );
  assert.deepEqual(args.slice(-2), ["config", "--quiet"]);
});

test("RT-06: project validation checks each container ID independently", (context) => {
  const fixture = createRuntimeFixture("local");
  const commandLog = join(fixture.root, "docker.log");
  const project = "zoom-gov-contact-center-demo";
  const network = `${project}_default`;
  context.after(() => rmSync(fixture.root, { force: true, recursive: true }));
  writeExecutable(
    join(fixture.stubDirectory, "docker"),
    [
      `printf '%s\\n' "$*" >> '${commandLog}'`,
      'last_arg=""',
      'for current_arg do last_arg="$current_arg"; done',
      'if [ "$1" = "info" ]; then exit 0; fi',
      'if [ "$1" = "ps" ]; then printf "local-web\\nlocal-db\\n"; exit 0; fi',
      'if [ "$1" = "inspect" ]; then',
      '  container_id="$last_arg"',
      '  case "$*" in',
      '    *"com.docker.compose.project.working_dir"*) printf "%s\\n" "' + fixture.checkout + '" ;;',
      '    *"com.docker.compose.service"*) if [ "$container_id" = "local-web" ]; then printf "web\\n"; elif [ "$container_id" = "local-db" ]; then printf "db\\n"; else exit 1; fi ;;',
      '    *"com.docker.compose.project"*) printf "' + project + '\\n" ;;',
      '    *"dev.zoomgov.runtime."*) printf "<no value>\\n" ;;',
      '    *"/app/node_modules"*) printf "' + project + '_node_modules\\n" ;;',
      '    *"/var/lib/postgresql/data"*) printf "' + project + '_postgres-data\\n" ;;',
      '    *"/app"*) printf "%s\\n" "' + fixture.checkout + '" ;;',
      '    *"NetworkSettings.Networks"*) printf "' + network + '\\n" ;;',
      '    *) exit 1 ;;',
      '  esac',
      '  exit 0',
      'fi',
      'if [ "$1" = "volume" ] && [ "$2" = "inspect" ]; then',
      '  case "$*" in',
      '    *"com.docker.compose.project"*) printf "' + project + '\\n" ;;',
      '    *"com.docker.compose.volume"*) case "$last_arg" in *node_modules) printf "node_modules\\n" ;; *postgres-data) printf "postgres-data\\n" ;; *) exit 1 ;; esac ;;',
      '    *"dev.zoomgov.runtime."*) printf "<no value>\\n" ;;',
      '    *) exit 1 ;;',
      '  esac',
      '  exit 0',
      'fi',
      'if [ "$1" = "network" ] && [ "$2" = "inspect" ]; then',
      '  case "$*" in',
      '    *"com.docker.compose.project"*) printf "' + project + '\\n" ;;',
      '    *"com.docker.compose.network"*) printf "default\\n" ;;',
      '    *"dev.zoomgov.runtime."*) printf "<no value>\\n" ;;',
      '    *) exit 1 ;;',
      '  esac',
      '  exit 0',
      'fi',
      'case "$*" in *"compose"*"ps -q web"*) printf "local-web\\n"; exit 0 ;; esac',
      'exit 1',
    ].join("\n"),
  );

  const result = execFileSyncWithResult(
    "zsh",
    [wrapperPath, "ps", "-q", "web"],
    fixtureEnv(fixture),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "local-web");
  const log = readFileSync(commandLog, "utf8");
  assert.match(log, /inspect .* local-web/u);
  assert.match(log, /inspect .* local-db/u);
  assert.doesNotMatch(log, /inspect .*local-web local-db/u);
});

test("RT-10 and RT-11: worktree exposure, labels, restart, and cleanup guards are explicit", () => {
  const helper = readFileSync(runtimeHelperPath, "utf8");
  const wrapper = readFileSync(wrapperPath, "utf8");
  const compose = readFileSync(join(repositoryRoot, "compose.yaml"), "utf8");
  const worktreeCompose = readFileSync(
    join(repositoryRoot, "compose.worktree.yaml"),
    "utf8",
  );
  assert.match(helper, /WEB_BIND_ADDRESS="127\.0\.0\.1"/u);
  assert.match(wrapper, /No automatic restart was performed/u);
  assert.match(wrapper, /MIGRATION_DEPLOYED/u);
  assert.match(wrapper, /up -d --build --no-deps --force-recreate web/u);
  assert.match(wrapper, /WEB_CONTAINER_BEFORE/u);
  assert.match(wrapper, /WEB_CONTAINER_AFTER/u);
  assert.match(wrapper, /Local cleanup is a no-op/u);
  assert.doesNotMatch(wrapper, /docker compose down/u);
  for (const label of [
    "dev.zoomgov.runtime.id",
    "dev.zoomgov.runtime.checkout",
    "dev.zoomgov.runtime.mode",
    "dev.zoomgov.runtime.config-digest",
    "dev.zoomgov.runtime.session-id",
  ]) {
    assert.match(
      `${compose}\n${worktreeCompose}`,
      new RegExp(label.replaceAll(".", "\\."), "u"),
    );
  }
  assert.match(compose, /networks:\n  default:\n    labels: \*runtime-labels/u);
  assert.match(worktreeCompose, /postgres-data:\n    labels:/u);
  assert.match(worktreeCompose, /RUNTIME_VOLUME_CONFIG_DIGEST/u);
  assert.match(worktreeCompose, /RUNTIME_VOLUME_OWNER_SESSION_ID/u);
  assert.doesNotMatch(compose, /postgres-data:\n    labels:/u);
});
