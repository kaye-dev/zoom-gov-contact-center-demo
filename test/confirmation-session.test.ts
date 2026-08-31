import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sourceRoot = path.resolve(import.meta.dirname, "..");
const sourceManager = path.join(sourceRoot, "scripts/confirmation-session.mjs");
const sourceServer = path.join(sourceRoot, "scripts/serve-plan-artifact.mjs");

type Fixture = {
  root: string;
  manager: string;
  statePath: string;
  ownedPids: Set<number>;
};

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function createArtifact(root: string, slug: string, surface: "prototype" | "review") {
  const directory = path.join(root, "plans", slug, surface);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), `<!doctype html><title>${surface}</title>\n`);
  if (surface === "review") {
    await Promise.all([
      writeFile(path.join(directory, "styles.css"), "body{}\n"),
      writeFile(path.join(directory, "app.js"), "\n"),
      writeFile(path.join(directory, "review-data-schema.js"), "\n"),
      writeFile(path.join(directory, "review-data.json"), "{}\n"),
    ]);
  }
}

async function createFixture(context: TestContext): Promise<Fixture> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "confirmation-session-")));
  const scripts = path.join(root, "scripts");
  const manager = path.join(scripts, "confirmation-session.mjs");
  const statePath = path.join(root, ".codex/confirmation-session.local.json");
  const ownedPids = new Set<number>();
  await mkdir(scripts, { recursive: true });
  await Promise.all([
    copyFile(sourceManager, manager),
    copyFile(sourceServer, path.join(scripts, "serve-plan-artifact.mjs")),
    createArtifact(root, "alpha", "prototype"),
    createArtifact(root, "alpha", "review"),
    createArtifact(root, "beta", "prototype"),
  ]);
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
  context.after(async () => {
    for (const pid of ownedPids) {
      if (processIsAlive(pid)) process.kill(pid, "SIGTERM");
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, manager, statePath, ownedPids };
}

function values(output: string) {
  return Object.fromEntries(
    output.trim().split("\n").map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
  );
}

async function run(fixture: Fixture, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return execFileAsync(process.execPath, [fixture.manager, ...args], {
    cwd: fixture.root,
    encoding: "utf8",
    env,
  });
}

async function waitUntilStopped(pid: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!processIsAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`PID ${pid} remained alive`);
}

test("CS-01/CS-02/CS-05: start, reuse, multi-surface status, and stop use one 0600 session", async (context) => {
  const fixture = await createFixture(context);
  const first = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  const prototypePid = Number(first.PROTOTYPE_PID);
  fixture.ownedPids.add(prototypePid);
  assert.match(first.PROTOTYPE_URL, /^http:\/\/127\.0\.0\.1:\d+\/$/u);
  assert.equal(first.REVIEW_URL, "none");
  assert.equal(first.STOP_COMMAND, "./dev-confirmation.sh stop alpha");

  const metadata = await lstat(fixture.statePath);
  assert.equal(metadata.mode & 0o777, 0o600);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink());
  const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
  assert.deepEqual(Object.keys(state).sort(), [
    "appRuntime",
    "artifactServers",
    "checkout",
    "createdAt",
    "gitCommonDirectory",
    "schemaVersion",
    "sessionId",
    "slug",
  ]);
  assert.ok(!first.PROTOTYPE_URL.includes(state.artifactServers.prototype.processToken));

  const reused = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  assert.equal(reused.PROTOTYPE_PID, first.PROTOTYPE_PID);
  assert.equal(reused.CONFIRMATION_SESSION_ID, first.CONFIRMATION_SESSION_ID);

  const withReview = values((await run(fixture, ["start", "alpha", "review"])).stdout);
  const reviewPid = Number(withReview.REVIEW_PID);
  fixture.ownedPids.add(reviewPid);
  assert.equal(withReview.PROTOTYPE_PID, first.PROTOTYPE_PID);
  assert.notEqual(withReview.REVIEW_PID, "none");
  const status = values((await run(fixture, ["status", "alpha"])).stdout);
  assert.equal(status.PROTOTYPE_PID, first.PROTOTYPE_PID);
  assert.equal(status.REVIEW_PID, withReview.REVIEW_PID);

  await assert.rejects(
    run(fixture, ["start", "beta", "prototype"]),
    (error: NodeJS.ErrnoException & { stderr?: string }) => {
      assert.match(error.stderr ?? "", /Confirmation session for 'alpha'[\s\S]*\.\/dev-confirmation\.sh stop alpha/u);
      return true;
    },
  );
  assert.ok(processIsAlive(prototypePid));
  assert.ok(processIsAlive(reviewPid));

  const stopped = values((await run(fixture, ["stop", "alpha"])).stdout);
  assert.equal(stopped.APP_STOP_RESULT, "none");
  assert.equal(stopped.CONFIRMATION_STATE, "removed");
  await waitUntilStopped(prototypePid);
  await waitUntilStopped(reviewPid);
  fixture.ownedPids.clear();
  await assert.rejects(lstat(fixture.statePath), { code: "ENOENT" });
});

test("CS-03: malformed, unsafe-mode, symlink, and unknown-field state fail closed", async (context) => {
  const fixture = await createFixture(context);
  await mkdir(path.dirname(fixture.statePath), { recursive: true });
  await writeFile(fixture.statePath, "not json\n", { mode: 0o600 });
  await assert.rejects(run(fixture, ["status", "alpha"]), /Command failed/u);

  await writeFile(fixture.statePath, "{}\n", { mode: 0o644 });
  await assert.rejects(run(fixture, ["status", "alpha"]), /Command failed/u);

  await rm(fixture.statePath);
  const outside = path.join(fixture.root, "outside.json");
  await writeFile(outside, "{}\n", { mode: 0o600 });
  await symlink(outside, fixture.statePath);
  await assert.rejects(run(fixture, ["status", "alpha"]), /Command failed/u);

  await rm(fixture.statePath);
  const started = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  const pid = Number(started.PROTOTYPE_PID);
  fixture.ownedPids.add(pid);
  const validStateText = await readFile(fixture.statePath, "utf8");
  await writeFile(
    fixture.statePath,
    validStateText.replace('"slug": "alpha"', '"slug": "alpha",\n  "slug": "alpha"'),
    { mode: 0o600 },
  );
  await assert.rejects(run(fixture, ["status", "alpha"]), /Command failed/u);
  assert.ok(processIsAlive(pid));

  const state = JSON.parse(validStateText);
  state.unexpected = true;
  await writeFile(fixture.statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await assert.rejects(run(fixture, ["status", "alpha"]), /Command failed/u);
  assert.ok(processIsAlive(pid));
});

test("CS-04: a mismatched process token never stops the live foreign process", async (context) => {
  const fixture = await createFixture(context);
  const started = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  const pid = Number(started.PROTOTYPE_PID);
  fixture.ownedPids.add(pid);
  const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
  state.artifactServers.prototype.processToken = randomUUID();
  await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

  await assert.rejects(run(fixture, ["stop", "alpha"]), /Command failed/u);
  assert.ok(processIsAlive(pid));
  assert.ok((await lstat(fixture.statePath)).isFile());
});

test("CS-RT-01/CS-RT-02: exact worktree app hold skips cleanup and exact stop session releases it", async (context) => {
  const fixture = await createFixture(context);
  const started = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  const pid = Number(started.PROTOTYPE_PID);
  fixture.ownedPids.add(pid);
  const runtimeSessionId = randomUUID();
  const cleanupLog = path.join(fixture.root, "cleanup.log");
  const composeScript = path.join(fixture.root, "dev-compose.sh");
  const runtimeId = "runtime-123";
  const project = "fixture-project";
  const containerId = "container-123";
  await writeFile(
    composeScript,
    `#!/bin/sh
if [ "$1" = "status" ] && [ "$2" = "--url" ]; then printf 'http://localhost:3100\\n'; exit 0; fi
if [ "$1" = "status" ]; then
  printf 'RUNTIME_MODE=worktree\\nRUNTIME_ID=${runtimeId}\\nRUNTIME_CHECKOUT_PATH=${fixture.root}\\nCOMPOSE_PROJECT_NAME=${project}\\nCODEX_RUNTIME_SESSION_ID=${runtimeSessionId}\\nACTIVE_RUNTIME_KIND=compose\\nACTIVE_RUNTIME_IDENTIFIER=${containerId}\\nACTIVE_RUNTIME_HEALTH=healthy\\nACTIVE_RUNTIME_MOUNT=${fixture.root}\\nRUNTIME_OWNERSHIP=verified\\n'
  exit 0
fi
if [ "$1" = "cleanup" ]; then printf '%s\\n' "$CODEX_CONFIRMATION_STOP_SESSION_ID" >> '${cleanupLog}'; exit 0; fi
exit 2
`,
  );
  await chmod(composeScript, 0o755);
  await mkdir(path.join(fixture.root, ".codex"), { recursive: true });
  await writeFile(
    path.join(fixture.root, ".codex/runtime-session.local.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      sessionId: runtimeSessionId,
      runtimeId,
      checkout: fixture.root,
      composeProject: project,
      createdContainerIds: [containerId],
    })}\n`,
    { mode: 0o600 },
  );

  const attached = values((await run(fixture, ["attach-app", "alpha"])).stdout);
  assert.equal(attached.APP_OWNER, "agent-owned");
  assert.equal(attached.APP_RUNTIME_ID, runtimeId);

  await assert.rejects(
    run(fixture, ["runtime-cleanup-policy", runtimeSessionId, runtimeId, project]),
    (error: NodeJS.ErrnoException & { stdout?: string }) => {
      assert.match(error.stdout ?? "", /ACTIVE_CONFIRMATION_SLUG=alpha/u);
      assert.match(error.stdout ?? "", /STOP_COMMAND=\.\/dev-confirmation\.sh stop alpha/u);
      return true;
    },
  );
  await assert.rejects(
    run(fixture, ["runtime-cleanup-policy", runtimeSessionId, runtimeId, project], {
      ...process.env,
      CODEX_CONFIRMATION_STOP_SESSION_ID: randomUUID(),
    }),
    /Command failed/u,
  );
  await run(fixture, ["runtime-cleanup-policy", runtimeSessionId, runtimeId, project], {
    ...process.env,
    CODEX_CONFIRMATION_STOP_SESSION_ID: started.CONFIRMATION_SESSION_ID,
  });

  const stopped = values((await run(fixture, ["stop", "alpha"])).stdout);
  assert.equal(stopped.APP_STOP_RESULT, "removed");
  assert.equal((await readFile(cleanupLog, "utf8")).trim(), started.CONFIRMATION_SESSION_ID);
  fixture.ownedPids.clear();
});

test("CS-RT-03: a reused Local app is recorded but never stopped", async (context) => {
  const fixture = await createFixture(context);
  const started = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  fixture.ownedPids.add(Number(started.PROTOTYPE_PID));
  const composeScript = path.join(fixture.root, "dev-compose.sh");
  await writeFile(
    composeScript,
    `#!/bin/sh
if [ "$1" = "status" ] && [ "$2" = "--url" ]; then printf 'http://localhost:3000\\n'; exit 0; fi
if [ "$1" = "status" ]; then
  printf 'RUNTIME_MODE=local\\nRUNTIME_ID=local\\nRUNTIME_CHECKOUT_PATH=${fixture.root}\\nCOMPOSE_PROJECT_NAME=fixture-local\\nCODEX_RUNTIME_SESSION_ID=local-unmanaged\\nACTIVE_RUNTIME_KIND=native-unmanaged\\nACTIVE_RUNTIME_IDENTIFIER=9876\\nACTIVE_RUNTIME_HEALTH=healthy\\nACTIVE_RUNTIME_MOUNT=${fixture.root}\\nRUNTIME_OWNERSHIP=verified\\n'
  exit 0
fi
if [ "$1" = "cleanup" ]; then exit 99; fi
exit 2
`,
  );
  await chmod(composeScript, 0o755);

  const attached = values((await run(fixture, ["attach-app", "alpha"])).stdout);
  assert.equal(attached.APP_OWNER, "reused-user-owned");
  const stopped = values((await run(fixture, ["stop", "alpha"])).stdout);
  assert.equal(stopped.APP_STOP_RESULT, "preserved");
  fixture.ownedPids.clear();
});
