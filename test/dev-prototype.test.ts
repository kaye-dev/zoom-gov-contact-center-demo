import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceScript = path.join(repositoryRoot, "dev-prototype.sh");

function resolveZshExecutable(): string {
  const executable = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((directory) => path.join(directory || ".", "zsh"))
    .find((candidate) => {
      try {
        accessSync(candidate, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });

  if (!executable) throw new Error("zsh is unavailable on PATH");
  return executable;
}

const zshExecutable = resolveZshExecutable();

type PrototypeLocation = "canonical" | "legacy";

interface Fixture {
  bin: string;
  emptyBin: string;
  root: string;
  script: string;
}

async function createRepositoryFixture(context: test.TestContext): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "dev-prototype-"));
  const bin = path.join(root, "bin");
  const emptyBin = path.join(root, "empty-bin");
  const script = path.join(root, "dev-prototype.sh");
  context.after(() => rm(root, { recursive: true, force: true }));

  await Promise.all([
    mkdir(path.join(root, "scripts"), { recursive: true }),
    mkdir(bin),
    mkdir(emptyBin),
  ]);
  await copyFile(sourceScript, script);
  await chmod(script, 0o755);
  await writeFile(
    path.join(root, "scripts/serve-plan-artifact.mjs"),
    "// Fake server: the fake Node executable records its path without starting it.\n",
  );
  await writeFile(
    path.join(bin, "node"),
    "#!/bin/sh\nprintf 'FAKE_NODE_ARG=%s\\n' \"$@\"\n",
  );
  await chmod(path.join(bin, "node"), 0o755);

  return { bin, emptyBin, root, script };
}

function prototypePath(root: string, location: PrototypeLocation, slug: string) {
  return location === "canonical"
    ? path.join(root, "plans", slug, "prototype")
    : path.join(root, "plans", "tmp", slug, "prototype");
}

async function createPrototype(
  root: string,
  location: PrototypeLocation,
  slug: string,
  modifiedAt: Date,
  nestedFiles: Array<{ modifiedAt: Date; relative: string }> = [],
) {
  const directory = prototypePath(root, location, slug);
  const files = [
    { modifiedAt, relative: "index.html" },
    ...nestedFiles,
  ];

  for (const file of files) {
    const target = path.join(directory, file.relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `fixture: ${file.relative}\n`);
    await utimes(target, file.modifiedAt, file.modifiedAt);
  }
}

function runLauncher(
  fixture: Fixture,
  args: string[] = [],
  options: { cwd?: string; pathValue?: string } = {},
) {
  return spawnSync(zshExecutable, [fixture.script, ...args], {
    cwd: options.cwd ?? fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: options.pathValue ?? `${fixture.bin}:/usr/bin:/bin`,
    },
  });
}

function assertServed(result: ReturnType<typeof runLauncher>, artifact: string) {
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`Prototype: ${artifact}`), result.stdout);
  assert.ok(result.stdout.includes(`FAKE_NODE_ARG=${artifact}`), result.stdout);
  assert.match(result.stdout, /FAKE_NODE_ARG=.*scripts\/serve-plan-artifact\.mjs/);
}

test("dev-prototype.shはrepositoryで実行可能になっている", async () => {
  const metadata = await stat(sourceScript);
  assert.notEqual(metadata.mode & 0o111, 0);
});

test("slugを明示するとlegacyが新しくてもcanonical prototypeを選ぶ", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const slug = "chosen-prototype";
  await createPrototype(fixture.root, "canonical", slug, new Date("2026-01-01T00:00:00Z"));
  await createPrototype(fixture.root, "legacy", slug, new Date("2026-01-03T00:00:00Z"));

  const result = runLauncher(fixture, [slug]);

  assertServed(result, `plans/${slug}/prototype`);
  assert.doesNotMatch(result.stderr, /warning|legacy/i);
  assert.doesNotMatch(result.stdout, new RegExp(`plans/tmp/${slug}/prototype`));
});

test("自動選択はcanonicalが1件でもあれば、より新しいlegacyを候補にしない", async (context) => {
  const fixture = await createRepositoryFixture(context);
  await createPrototype(
    fixture.root,
    "canonical",
    "canonical-prototype",
    new Date("2026-01-01T00:00:00Z"),
  );
  await createPrototype(
    fixture.root,
    "legacy",
    "newer-legacy-prototype",
    new Date("2026-02-01T00:00:00Z"),
  );

  const result = runLauncher(fixture);

  assertServed(result, "plans/canonical-prototype/prototype");
  assert.doesNotMatch(result.stderr, /warning|legacy/i);
  assert.doesNotMatch(result.stdout, /plans\/tmp\/newer-legacy-prototype\/prototype/);
});

test("canonicalが0件のときだけ自動選択でlegacyを使い、stderrへ警告する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  await createPrototype(
    fixture.root,
    "legacy",
    "legacy-prototype",
    new Date("2026-01-01T00:00:00Z"),
  );

  const result = runLauncher(fixture);

  assertServed(result, "plans/tmp/legacy-prototype/prototype");
  assert.match(result.stderr, /legacy/i);
});

test("明示slugはcanonical directoryがない場合だけlegacyへfallbackして警告する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const slug = "legacy-only";
  await createPrototype(fixture.root, "legacy", slug, new Date("2026-01-01T00:00:00Z"));

  const result = runLauncher(fixture, [slug]);

  assertServed(result, `plans/tmp/${slug}/prototype`);
  assert.match(result.stderr, /legacy/i);
});

test("canonical directoryにindex.htmlがなければ同名legacyへ隠れてfallbackしない", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const slug = "incomplete-canonical";
  const canonical = prototypePath(fixture.root, "canonical", slug);
  await mkdir(canonical, { recursive: true });
  await writeFile(path.join(canonical, "app.js"), "document.body.dataset.ready = 'true';\n");
  await createPrototype(fixture.root, "legacy", slug, new Date("2026-01-01T00:00:00Z"));

  const explicitResult = runLauncher(fixture, [slug]);

  assert.equal(explicitResult.status, 1);
  assert.match(explicitResult.stderr, new RegExp(`plans/${slug}/prototype/index\\.html`));
  assert.doesNotMatch(explicitResult.stdout, /FAKE_NODE_ARG=/);
  assert.doesNotMatch(explicitResult.stderr, /warning:.*legacy/i);

  const automaticResult = runLauncher(fixture);
  assert.equal(automaticResult.status, 1);
  assert.match(automaticResult.stderr, /canonical.*index\.html/i);
  assert.doesNotMatch(automaticResult.stdout, /FAKE_NODE_ARG=/);
  assert.doesNotMatch(automaticResult.stderr, /warning:.*legacy/i);
});

test("自動選択はprototype直下だけでなくnested fileのmtimeも比較する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  await createPrototype(
    fixture.root,
    "canonical",
    "nested-latest",
    new Date("2026-01-01T00:00:00Z"),
    [
      {
        modifiedAt: new Date("2026-01-04T00:00:00Z"),
        relative: "screens/states/loading.html",
      },
    ],
  );
  await createPrototype(
    fixture.root,
    "canonical",
    "newer-index",
    new Date("2026-01-03T00:00:00Z"),
  );

  const result = runLauncher(fixture);

  assertServed(result, "plans/nested-latest/prototype");
});

test("無効なslugと予約slugをserver起動前に拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);

  for (const slug of ["UpperCase", "../escape", "tmp", "reviews"]) {
    const result = runLauncher(fixture, [slug]);
    assert.equal(result.status, 1, `${slug}: ${result.stderr}`);
    assert.match(result.stderr, /slug|reserved/i, slug);
    assert.doesNotMatch(result.stdout, /FAKE_NODE_ARG=/, slug);
  }
});

test("Node.jsがPATHにない場合はserverを起動せず終了する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  await createPrototype(
    fixture.root,
    "canonical",
    "node-unavailable",
    new Date("2026-01-01T00:00:00Z"),
  );

  const result = runLauncher(fixture, [], { pathValue: fixture.emptyBin });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node\.js.*(unavailable|PATH|installed)/i);
  assert.doesNotMatch(result.stdout, /FAKE_NODE_ARG=/);
});

test("過剰な引数はusageをstderrへ出して拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);

  const result = runLauncher(fixture, ["first", "second"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage:.*dev-prototype\.sh \[slug\]/i);
  assert.doesNotMatch(result.stdout, /FAKE_NODE_ARG=/);
});

test("-hと--helpはNode.jsやprototypeなしでusageをstdoutへ出して成功する", async (context) => {
  const fixture = await createRepositoryFixture(context);

  for (const option of ["-h", "--help"]) {
    const result = runLauncher(fixture, [option], { pathValue: fixture.emptyBin });
    assert.equal(result.status, 0, `${option}: ${result.stderr}`);
    assert.match(result.stdout, /usage:.*dev-prototype\.sh \[slug\]/i, option);
    assert.equal(result.stderr, "", option);
    assert.doesNotMatch(result.stdout, /FAKE_NODE_ARG=/, option);
  }
});

test("対象prototypeがなければserverを起動せず終了する", async (context) => {
  const fixture = await createRepositoryFixture(context);

  const result = runLauncher(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No prototype was found/i);
  assert.doesNotMatch(result.stdout, /FAKE_NODE_ARG=/);
});

test("repository外のcwdからでもscript自身のrepositoryにあるprototypeを選ぶ", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const otherCwd = await mkdtemp(path.join(tmpdir(), "dev-prototype-cwd-"));
  context.after(() => rm(otherCwd, { recursive: true, force: true }));
  await createPrototype(
    fixture.root,
    "canonical",
    "cwd-independent",
    new Date("2026-01-01T00:00:00Z"),
  );

  const result = runLauncher(fixture, ["cwd-independent"], { cwd: otherCwd });

  assertServed(result, "plans/cwd-independent/prototype");
});
