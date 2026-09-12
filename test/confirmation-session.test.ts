import assert from "node:assert/strict";
import { artifactTestEnvironment, artifactTestStateRoot, releaseArtifactTestPorts } from "./helpers/development-port-fixture";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
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
    copyFile(path.join(sourceRoot, "scripts/prototype-entry.mjs"), path.join(scripts, "prototype-entry.mjs")),
    copyFile(path.join(sourceRoot, "scripts/development-port-allocation.mjs"), path.join(scripts, "development-port-allocation.mjs")),
    copyFile(sourceServer, path.join(scripts, "serve-plan-artifact.mjs")),
    createArtifact(root, "alpha", "prototype"),
    createArtifact(root, "alpha", "review"),
    createArtifact(root, "beta", "prototype"),
  ]);
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
  context.after(async () => {
    for (const pid of ownedPids) {
      if (processIsAlive(pid)) { process.kill(pid, "SIGTERM"); await waitUntilStopped(pid); }
    }
    await releaseArtifactTestPorts(root, path.join(root, ".git"));
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
    env: artifactTestEnvironment(fixture.root, path.join(fixture.root, ".git"), env),
  });
}

async function waitUntilStopped(pid: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!processIsAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`PID ${pid} remained alive`);
}

test("CS-01/CS-02/CS-05: start, reuse, exclusive-surface status, and stop use one 0600 session", async (context) => {
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

  await assert.rejects(run(fixture, ["start", "alpha", "review"]), /PORT_ARTIFACT_IN_USE/);
  const status = values((await run(fixture, ["status", "alpha"])).stdout);
  assert.equal(status.PROTOTYPE_PID, first.PROTOTYPE_PID);
  assert.equal(status.REVIEW_PID, "none");

  await assert.rejects(
    run(fixture, ["start", "beta", "prototype"]),
    (error: NodeJS.ErrnoException & { stderr?: string }) => {
      assert.match(error.stderr ?? "", /Confirmation session for 'alpha'[\s\S]*\.\/dev-confirmation\.sh stop alpha/u);
      return true;
    },
  );
  assert.ok(processIsAlive(prototypePid));

  const stopped = values((await run(fixture, ["stop", "alpha"])).stdout);
  assert.equal(stopped.APP_STOP_RESULT, "none");
  assert.equal(stopped.CONFIRMATION_STATE, "removed");
  await waitUntilStopped(prototypePid);
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

for (const scenario of ["cross-timezone", "legacy-timezone", "wrong-listener-pid"] as const) {
  test(`live artifact ownership: ${scenario}`, async context => {
    const fixture = await createFixture(context);
    const started = values((await run(fixture, ["start", "alpha", "prototype"], { ...process.env, TZ: "Pacific/Honolulu" })).stdout);
    const pid = Number(started.PROTOTYPE_PID);
    fixture.ownedPids.add(pid);
    const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
    const port = Number(new URL(started.PROTOTYPE_URL).port);
    const leasePath = path.join(artifactTestStateRoot, `slot-${port - 4000}.json`);
    const lease = JSON.parse(await readFile(leasePath, "utf8"));
    if (scenario === "legacy-timezone") {
      lease.artifact.processStart = (await execFileAsync("ps", ["-p", String(pid), "-o", "lstart="], { env: { ...process.env, TZ: "Pacific/Honolulu" } })).stdout.trim();
      assert.ok(!lease.artifact.processStart.endsWith("Z"));
      await writeFile(leasePath, JSON.stringify(lease));
    }
    if (scenario === "wrong-listener-pid") {
      // The port still returns the correct token, but a different process owns it.
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000); console.log('ready')"], {
        cwd: fixture.root, stdio: ["ignore", "pipe", "pipe"],
      });
      assert.ok(child.pid);
      fixture.ownedPids.add(child.pid);
      await once(child.stdout!, "data");
      state.artifactServers.prototype.pid = child.pid;
      lease.artifact.pid = child.pid;
      lease.artifact.processStart = "Mon Jan  1 00:00:00 2001";
      await writeFile(leasePath, JSON.stringify(lease));
      await writeFile(fixture.statePath, JSON.stringify(state));
      await assert.rejects(run(fixture, ["stop", "alpha"]), /artifact listener PID does not match/u);
      assert.ok(processIsAlive(pid));
      assert.ok(processIsAlive(child.pid));
      assert.deepEqual(JSON.parse(await readFile(fixture.statePath, "utf8")), state);
    } else {
      assert.equal(values((await run(fixture, ["stop", "alpha"], { ...process.env, TZ: "Asia/Tokyo" })).stdout).RECLAIMED_ARTIFACTS, "0");
      await waitUntilStopped(pid);
      await assert.rejects(lstat(fixture.statePath), { code: "ENOENT" });
    }
  });
}

for (const scenario of ["exited", "graceful-exit", "reused", "missing-session", "occupied", "wt-old-checkout"] as const) {
  test(`stale artifact cleanup: ${scenario}`, async context => {
    const fixture = await createFixture(context);
    const started = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
    const pid = Number(started.PROTOTYPE_PID);
    fixture.ownedPids.add(pid);
    const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
    const port = Number(new URL(started.PROTOTYPE_URL).port);
    const leasePath = path.join(artifactTestStateRoot, `slot-${port - 4000}.json`);
    const lease = JSON.parse(await readFile(leasePath, "utf8"));
    // Abrupt termination deliberately leaves the artifact lease behind.
    process.kill(pid, scenario === "graceful-exit" ? "SIGTERM" : "SIGKILL");
    await waitUntilStopped(pid);
    let foreignPid: number | undefined;
    if (scenario !== "exited" && scenario !== "graceful-exit") {
      const code = scenario === "occupied"
        ? `require('node:net').createServer().listen(${port}, '127.0.0.1', () => console.log('ready'))`
        : "setInterval(() => {}, 1000); console.log('ready')";
      const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "pipe"] });
      assert.ok(child.pid);
      foreignPid = child.pid;
      fixture.ownedPids.add(child.pid);
      await once(child.stdout!, "data");
      state.artifactServers.prototype.pid = child.pid;
      lease.artifact.pid = child.pid;
      lease.artifact.processStart = "Mon Jan  1 00:00:00 2001";
      await writeFile(leasePath, JSON.stringify(lease));
      await writeFile(fixture.statePath, JSON.stringify(state));
    }
    if (scenario === "missing-session") await rm(fixture.statePath);
    if (scenario === "occupied") {
      await assert.rejects(run(fixture, ["stop", "alpha"]), /PORT_IN_USE/);
      assert.deepEqual(JSON.parse(await readFile(fixture.statePath, "utf8")), state);
      assert.deepEqual(JSON.parse(await readFile(leasePath, "utf8")), lease);
    } else if (scenario === "wt-old-checkout") {
      // Neither target's old entrypoint nor its old implementation may run.
      await writeFile(path.join(fixture.root, "dev-confirmation.sh"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
      await writeFile(fixture.manager, "throw new Error('old checkout implementation');\n");
      await writeFile(path.join(fixture.root, "dev-compose.sh"), '#!/bin/sh\n[ "$1" = cleanup ] || exit 99\nprintf done > cleanup.log\n', { mode: 0o755 });
      const code = `import {stopCheckout} from ${JSON.stringify(new URL("../scripts/manage-worktree-runtimes.mjs", import.meta.url).href)};
        console.log(JSON.stringify(await stopCheckout({checkout:process.argv[1],state:'ready',confirmation:{state:'valid',slug:'alpha'},runtime:{state:'valid',mode:'worktree'},resources:[]}, {inspectContainers:async()=>[]})));`;
      const result = await execFileAsync(process.execPath, ["--input-type=module", "-e", code, fixture.root], { env: artifactTestEnvironment(fixture.root, path.join(fixture.root, ".git")) });
      assert.deepEqual(JSON.parse(result.stdout), [
        { action: "confirmation", detail: "stopped; stale artifact metadata reclaimed" },
        { action: "Compose services", detail: "skipped: no project containers" },
        { action: "worktree cleanup", detail: "completed" },
        { action: "port allocation", detail: "released; named volumes preserved" },
      ]);
      await assert.rejects(lstat(fixture.statePath), { code: "ENOENT" });
      await assert.rejects(lstat(leasePath), { code: "ENOENT" });
      assert.equal(await readFile(path.join(fixture.root, "cleanup.log"), "utf8"), "done");
    } else {
      assert.equal(values((await run(fixture, ["stop", "alpha"])).stdout).RECLAIMED_ARTIFACTS, "1");
      await assert.rejects(lstat(fixture.statePath), { code: "ENOENT" });
      assert.equal(JSON.parse(await readFile(leasePath, "utf8")).artifact, null);
      assert.equal(values((await run(fixture, ["stop", "alpha"])).stdout).RECLAIMED_ARTIFACTS, "0");
    }
    if (foreignPid) assert.ok(processIsAlive(foreignPid), "reused PID must survive cleanup");
  });
}

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
if [ "$1" = "status" ] && [ "$2" = "--url" ]; then printf 'http://localhost:3001\\n'; exit 0; fi
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


test("PORT-07: direct and retained entry points share the existing owner and stable URL", async context => {
  const fixture = await createFixture(context);
  const first = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  fixture.ownedPids.add(Number(first.PROTOTYPE_PID));
  await rm(fixture.statePath);
  const direct = await execFileAsync(process.execPath, [path.join(fixture.root, "scripts/serve-plan-artifact.mjs"), "plans/alpha/prototype"], {
    cwd: fixture.root, env: artifactTestEnvironment(fixture.root, path.join(fixture.root, ".git")),
  });
  assert.equal(values(direct.stdout).PID, first.PROTOTYPE_PID);
  assert.equal(values(direct.stdout).REUSED, "1");
  const retained = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  assert.equal(retained.PROTOTYPE_PID, first.PROTOTYPE_PID);
  await run(fixture, ["stop", "alpha"]);
  const restarted = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  fixture.ownedPids.add(Number(restarted.PROTOTYPE_PID));
  assert.equal(restarted.PROTOTYPE_URL, first.PROTOTYPE_URL);
});

test("PORT-09/10: legacy retained origin remains readable and stoppable before bounded restart", async context => {
  const fixture = await createFixture(context);
  const serverPath = path.join(fixture.root, "scripts/serve-plan-artifact.mjs");
  const currentSource = await readFile(serverPath, "utf8");
  // Reproduce the old server's ephemeral binding with the same owner token protocol.
  await writeFile(serverPath, currentSource.split("const portIdentity =")[0] + `
server.listen(0, "127.0.0.1", () => console.log("URL=http://127.0.0.1:" + server.address().port + "/"));
process.on("SIGTERM", () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
`);
  const token = randomUUID();
  const child = spawn(process.execPath, [serverPath, "plans/alpha/prototype"], {
    cwd: fixture.root, env: { ...process.env, PLAN_ARTIFACT_SESSION_TOKEN: token }, stdio: ["ignore", "pipe", "pipe"],
  });
  assert.ok(child.pid);
  fixture.ownedPids.add(child.pid);
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("legacy startup timeout")), 5000);
    child.stdout.on("data", data => { clearTimeout(timer); resolve(values(String(data)).URL); });
    child.once("error", reject);
  });
  assert.ok(Number(new URL(url).port) > 4005);
  await mkdir(path.dirname(fixture.statePath), { recursive: true });
  await writeFile(fixture.statePath, JSON.stringify({
    schemaVersion: 1, sessionId: randomUUID(), checkout: fixture.root, gitCommonDirectory: path.join(fixture.root, ".git"),
    slug: "alpha", createdAt: new Date().toISOString(), appRuntime: null,
    artifactServers: { prototype: { surface: "prototype", artifactRealpath: path.join(fixture.root, "plans/alpha/prototype"),
      url, pid: child.pid, processToken: token, startedAt: new Date().toISOString() } },
  }), { mode: 0o600 });
  await writeFile(serverPath, currentSource);
  assert.equal(values((await run(fixture, ["status", "alpha"])).stdout).PROTOTYPE_URL, url);
  await assert.rejects(run(fixture, ["start", "alpha", "prototype"]), /4000-4005/);
  await assert.rejects(execFileAsync(process.execPath, [serverPath, "plans/alpha/prototype"], {
    cwd: fixture.root, env: artifactTestEnvironment(fixture.root, path.join(fixture.root, ".git")),
  }), /PORT_MIGRATION_REQUIRED/);
  assert.ok(processIsAlive(child.pid));
  await run(fixture, ["stop", "alpha"]);
  const restarted = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  fixture.ownedPids.add(Number(restarted.PROTOTYPE_PID));
  const port = Number(new URL(restarted.PROTOTYPE_URL).port);
  assert.ok(port >= 4001 && port <= 4005);
});

test("retained artifact output stays writable after the startup command exits", async context => {
  const fixture = await createFixture(context);
  const serverPath = path.join(fixture.root, "scripts/serve-plan-artifact.mjs");
  const source = await readFile(serverPath, "utf8");
  await writeFile(serverPath, source.replace('const address = server.address();', `
    // Exercise logging after the parent has exited, as Next.js does per request.
    if (request.url === "/?log") {
      await Promise.all([process.stdout, process.stderr].map(stream => new Promise((resolve, reject) => {
        stream.once("error", () => {});
        stream.write("retained request log\\n", error => error ? reject(error) : resolve(undefined));
      })));
    }
    const address = server.address();`));
  const started = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
  fixture.ownedPids.add(Number(started.PROTOTYPE_PID));
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${started.PROTOTYPE_URL}?log`, { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200, "stdout/stderr remain writable after startup detaches");
    assert.match(await response.text(), /<title>prototype<\/title>/u);
  }
  assert.equal(values((await run(fixture, ["start", "alpha", "prototype"])).stdout).PROTOTYPE_PID, started.PROTOTYPE_PID);
  assert.equal(values((await run(fixture, ["status", "alpha"])).stdout).PROTOTYPE_PID, started.PROTOTYPE_PID);
  await run(fixture, ["stop", "alpha"]);
});

test("startup IPC settles once and releases listeners on every terminal outcome", async () => {
  const { EventEmitter } = await import("node:events");
  const { waitForStartup } = await import("../scripts/confirmation-session.mjs");
  for (const outcome of ["ready", "startup-error", "error", "exit", "disconnect", "timeout"]) {
    const child = new EventEmitter();
    const pending = waitForStartup(child, "prototype", 20);
    if (outcome === "ready") child.emit("message", { type: "artifact-ready", url: "http://127.0.0.1:4001/page", pid: 101 });
    else if (outcome === "startup-error") child.emit("message", { type: "artifact-startup-error", message: "fixture failure" });
    else if (outcome === "error") child.emit("error", new Error("spawn failed"));
    else if (outcome === "exit") child.emit("exit", 1, null);
    else if (outcome === "disconnect") child.emit("disconnect");
    if (outcome === "ready") assert.deepEqual(await pending, { url: "http://127.0.0.1:4001/page", pid: 101 });
    else await assert.rejects(pending, /failure|failed|exited|disconnected|timed out/u);
    for (const event of ["message", "error", "exit", "disconnect"]) assert.equal(child.listenerCount(event), 0, `${outcome}: ${event}`);
    child.emit("message", { type: "artifact-ready", url: "ignored", pid: 102 });
  }
});

for (const failure of ["http", "body-timeout"]) {
  test(`retained status rejects actual GET ${failure} even when root HEAD succeeds`, async context => {
    const fixture = await createFixture(context);
    await writeFile(path.join(fixture.root, "plans/alpha/prototype/page.html"), "<!doctype html><title>Actual route</title>");
    const serverPath = path.join(fixture.root, "scripts/serve-plan-artifact.mjs");
    const source = await readFile(serverPath, "utf8");
    await writeFile(serverPath, source.replaceAll('${prepared?.config.route ?? "/"}', '/page.html').replace('const address = server.address();', `
      if (request.method === "GET" && request.url === "/page.html" && await stat(path.join(repositoryRoot, "fail-get")).then(() => true, () => false)) {
        response.writeHead(${failure === "http" ? 503 : 200}, headers("text/html"));
        ${failure === "http" ? 'response.end("failed");' : 'response.write("incomplete body");'}
        return;
      }
      const address = server.address();`));
    const started = values((await run(fixture, ["start", "alpha", "prototype"])).stdout);
    fixture.ownedPids.add(Number(started.PROTOTYPE_PID));
    assert.match(started.PROTOTYPE_URL, /\/page\.html$/u);
    const state = await readFile(fixture.statePath, "utf8");
    await writeFile(path.join(fixture.root, "fail-get"), "enabled");
    const head = await fetch(new URL("/", started.PROTOTYPE_URL), { method: "HEAD" });
    assert.equal(head.status, 200);
    await assert.rejects(run(fixture, ["status", "alpha"]));
    assert.equal(await readFile(fixture.statePath, "utf8"), state, "failed status preserves owner metadata");
    await rm(path.join(fixture.root, "fail-get"));
    assert.equal(values((await run(fixture, ["status", "alpha"])).stdout).PROTOTYPE_PID, started.PROTOTYPE_PID);
    await run(fixture, ["stop", "alpha"]);
  });
}
