import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";

const root = path.resolve(import.meta.dirname, "..");
const manager = path.join(root, "scripts/manage-worktree-runtimes.mjs");
const modulePromise = import(manager) as Promise<typeof import("../scripts/manage-worktree-runtimes.mjs")>;

async function fixture(context: test.TestContext) {
  const checkout = await realpath(await mkdtemp(path.join(tmpdir(), "worktree-runtime-manager-")));
  context.after(() => rm(checkout, { recursive: true, force: true }));
  await mkdir(path.join(checkout, ".codex"));
  return checkout;
}

async function writeRuntime(checkout: string, values: Record<string, string>) {
  await writeFile(
    path.join(checkout, ".codex/runtime.local.env"),
    `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
  );
}

test("worktree inventory parses porcelain state, listeners, and interactive selections deterministically", async () => {
  const { parseLsof, parseSelection, parseWorktreeList } = await modulePromise;
  assert.deepEqual(
    parseWorktreeList("worktree /tmp/a\nHEAD abc\nbranch refs/heads/main\n\nworktree /tmp/b\nHEAD def\ndetached\n"),
    [
      { path: "/tmp/a", head: "abc", branch: "main", prunable: false },
      { path: "/tmp/b", head: "def", branch: "detached", prunable: false },
    ],
  );
  assert.deepEqual(parseLsof("p123\ncnode\nn127.0.0.1:3210\n"), [{ pid: 123, command: "node", addresses: ["127.0.0.1:3210"] }]);
  assert.deepEqual(parseSelection("3, 1 3", 3), [0, 2]);
  assert.deepEqual(parseSelection("all", 2), [0, 1]);
  assert.throws(() => parseSelection("4", 3), /outside/u);
});

test("runtime and confirmation metadata reject malformed or symlinked state without becoming stoppable", async (context) => {
  const checkout = await fixture(context);
  const { readConfirmation, readRuntime } = await modulePromise;
  await writeRuntime(checkout, {
    RUNTIME_CHECKOUT_PATH: checkout,
    RUNTIME_ID: "abc123",
    COMPOSE_PROJECT_NAME: "fixture",
    RUNTIME_MODE: "worktree",
    HOST_PORT: "3210",
    STUDIO_PORT: "5210",
  });
  assert.deepEqual(await readRuntime(checkout), {
    state: "valid",
    mode: "worktree",
    runtimeId: "abc123",
    composeProject: "fixture",
    hostPort: 3210,
    studioPort: 5210,
  });

  const confirmation = path.join(checkout, ".codex/confirmation-session.local.json");
  await writeFile(confirmation, "{not json");
  assert.deepEqual(await readConfirmation(checkout), { state: "invalid", reason: "confirmation session is malformed" });
  await writeFile(
    confirmation,
    JSON.stringify({
      schemaVersion: 1,
      checkout,
      slug: "demo",
      artifactServers: { prototype: { surface: "prototype", pid: "not-a-pid", url: "http://127.0.0.1:3210/" } },
    }),
  );
  assert.deepEqual(await readConfirmation(checkout), {
    state: "invalid",
    reason: "confirmation prototype artifact has an invalid PID or URL",
  });
  await rm(confirmation);
  const target = path.join(checkout, "outside.json");
  await writeFile(target, "{}");
  await symlink(target, confirmation);
  assert.deepEqual(await readConfirmation(checkout), { state: "invalid", reason: "confirmation session is not a safe regular file" });
});

test("non-interactive worktrees command prints inventory without presenting a stop prompt", async (context) => {
  const checkout = await fixture(context);
  execFileSync("git", ["init", "-q"], { cwd: checkout });
  const result = execFileSync(process.execPath, [manager], { cwd: checkout, encoding: "utf8", input: "" });
  assert.match(result, /Parallel worktree runtime inventory/u);
  assert.match(result, /no managed ports recorded/u);
  assert.doesNotMatch(result, /Stop which worktrees/u);
});

test("explicit native listener stop requires the checkout cwd and a Next.js-like command", async (context) => {
  const checkout = await fixture(context);
  const { stopNativeListener } = await modulePromise;
  const server = path.join(checkout, "fake-next-server.mjs");
  await writeFile(
    server,
    "import http from 'node:http'; const server = http.createServer(); server.listen(0, '127.0.0.1', () => console.log(server.address().port));",
  );
  await chmod(server, 0o755);
  const child = spawn(process.execPath, [server], { cwd: checkout, stdio: ["ignore", "pipe", "pipe"] });
  context.after(() => child.kill("SIGKILL"));
  const [line] = (await once(child.stdout!, "data")) as [Buffer];
  const port = Number(line.toString().trim());
  const resource = {
    surface: "app",
    port,
    listener: { pid: child.pid!, command: "node", addresses: [`127.0.0.1:${port}`] },
  };
  assert.equal(
    await stopNativeListener(path.join(checkout, "other-checkout"), resource),
    "preserved: listener is not a verified native Next.js process for this checkout",
  );
  const result = await stopNativeListener(checkout, resource);
  assert.equal(result, "stopped");
});

test("explicit worktree selection stops confirmation and scoped Compose resources without deleting volumes", async (context) => {
  const checkout = await fixture(context);
  const { stopCheckout } = await modulePromise;
  const log = path.join(checkout, "commands.log");
  for (const [name, body] of [
    ["dev-confirmation.sh", "printf 'confirmation:%s %s\\n' \"$1\" \"$2\" >> commands.log"],
    ["dev-compose.sh", "printf 'compose:%s %s %s %s\\n' \"$1\" \"${2:-}\" \"${3:-}\" \"${4:-}\" >> commands.log"],
  ] as const) {
    const script = path.join(checkout, name);
    await writeFile(script, `#!/bin/sh\n${body}\n`);
    await chmod(script, 0o755);
  }
  const results = await stopCheckout({
    checkout,
    state: "ready",
    confirmation: { state: "valid", slug: "demo" },
    runtime: { state: "valid", mode: "worktree" },
    resources: [],
  });
  assert.deepEqual(results, [
    { action: "confirmation", detail: "stopped" },
    { action: "Compose services", detail: "stopped" },
    { action: "worktree cleanup", detail: "completed" },
  ]);
  assert.deepEqual((await readFile(log, "utf8")).trim().split("\n"), [
    "confirmation:stop demo",
    "compose:stop web studio db",
    "compose:cleanup",
  ]);
});
