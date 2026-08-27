import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceScript = path.join(repositoryRoot, "dev-prototype.sh");

async function createRepositoryFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "dev-prototype-"));
  const bin = path.join(root, "bin");
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(bin);
  await copyFile(sourceScript, path.join(root, "dev-prototype.sh"));
  await chmod(path.join(root, "dev-prototype.sh"), 0o755);
  await writeFile(path.join(root, "scripts/serve-plan-artifact.mjs"), "");
  await writeFile(
    path.join(bin, "node"),
    "#!/bin/sh\nprintf 'NODE_ARG=%s\\n' \"$@\"\n",
  );
  await chmod(path.join(bin, "node"), 0o755);
  return { root, bin };
}

async function createPrototype(root: string, planId: string, modifiedAt: Date) {
  const prototype = path.join(root, "plans/tmp", planId, "prototype");
  const index = path.join(prototype, "index.html");
  const script = path.join(prototype, "app.js");
  await mkdir(prototype, { recursive: true });
  await writeFile(index, "<!doctype html><title>prototype</title>");
  await writeFile(script, "document.body.dataset.ready = 'true';");
  await utimes(index, modifiedAt, modifiedAt);
  await utimes(script, modifiedAt, modifiedAt);
}

function runScript(root: string, bin: string, args: string[] = []) {
  return spawnSync("zsh", [path.join(root, "dev-prototype.sh"), ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
  });
}

test("引数なしで最終更新されたprototypeを配信対象にする", async (context) => {
  const fixture = await createRepositoryFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await createPrototype(
    fixture.root,
    "older-prototype",
    new Date("2026-01-01T00:00:00Z"),
  );
  await createPrototype(
    fixture.root,
    "latest-prototype",
    new Date("2026-01-02T00:00:00Z"),
  );

  const result = runScript(fixture.root, fixture.bin);

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Prototype: plans\/tmp\/latest-prototype\/prototype/,
  );
  assert.match(
    result.stdout,
    /NODE_ARG=plans\/tmp\/latest-prototype\/prototype/,
  );
});

test("plan IDを指定するとそのprototypeを配信対象にする", async (context) => {
  const fixture = await createRepositoryFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await createPrototype(
    fixture.root,
    "chosen-prototype",
    new Date("2026-01-01T00:00:00Z"),
  );

  const result = runScript(fixture.root, fixture.bin, ["chosen-prototype"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /NODE_ARG=plans\/tmp\/chosen-prototype\/prototype/,
  );
});

test("prototypeがない場合はserverを起動せず終了する", async (context) => {
  const fixture = await createRepositoryFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const result = runScript(fixture.root, fixture.bin);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No prototype was found/);
  assert.doesNotMatch(result.stdout, /NODE_ARG=/);
});
