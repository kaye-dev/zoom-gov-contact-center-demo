import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const builderScript = path.join(
  repositoryRoot,
  ".agents/skills/plan/scripts/build-prototype-css.mjs",
);

interface PrototypeFixture {
  absolute: string;
  relative: string;
  styles: string;
}

function runBuilder(args: string[], cwd = repositoryRoot) {
  return spawnSync(process.execPath, [builderScript, ...args], {
    cwd,
    encoding: "utf8",
  });
}

async function createPrototype(
  context: test.TestContext,
): Promise<PrototypeFixture> {
  const slug = `css-builder-${randomUUID()}`;
  const planRoot = path.join(repositoryRoot, "plan", slug);
  const relative = `plan/${slug}/prototype`;
  const absolute = path.join(repositoryRoot, relative);
  const styles = path.join(absolute, "styles.css");
  context.after(() => rm(planRoot, { recursive: true, force: true }));

  await mkdir(absolute, { recursive: true });
  await Promise.all([
    writeFile(path.join(absolute, "index.html"), '<div class="text-red-500">prototype</div>\n'),
    writeFile(
      path.join(absolute, "tailwind.css"),
      '@import "../../../app/globals.css";\n@source ".";\n',
    ),
  ]);
  return { absolute, relative, styles };
}

function assertBuildSucceeded(
  result: ReturnType<typeof runBuilder>,
  fixture: PrototypeFixture,
) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`compiled Tailwind CSS: ${fixture.relative.replaceAll("/", "\\/")}/styles\\.css`));
}

async function assertStylesUnavailable(styles: string) {
  await assert.rejects(access(styles), { code: "ENOENT" });
}

test("canonical prototype directoryでTailwind CSSを生成する", async (context) => {
  const fixture = await createPrototype(context);
  const result = runBuilder([fixture.relative]);

  assertBuildSucceeded(result, fixture);
  assert.match(await readFile(fixture.styles, "utf8"), /\.text-red-500/);
});

test("repository外のcwdでも同じrepository-relative pathを同じ対象として扱う", async (context) => {
  const fixture = await createPrototype(context);
  const otherCwd = await mkdtemp(path.join(tmpdir(), "prototype-css-cwd-"));
  context.after(() => rm(otherCwd, { recursive: true, force: true }));

  const fromRepository = runBuilder([fixture.relative]);
  assertBuildSucceeded(fromRepository, fixture);
  const expectedCss = await readFile(fixture.styles, "utf8");

  const fromOtherCwd = runBuilder([fixture.relative], otherCwd);
  assertBuildSucceeded(fromOtherCwd, fixture);
  assert.equal(await readFile(fixture.styles, "utf8"), expectedCss);
});

test("review、repository外、dot segmentを含む曖昧pathを拒否する", async (context) => {
  const reviewSlug = `css-builder-review-${randomUUID()}`;
  const reviewPlanRoot = path.join(repositoryRoot, "plan", reviewSlug);
  const review = path.join(reviewPlanRoot, "review");
  context.after(() => rm(reviewPlanRoot, { recursive: true, force: true }));
  await mkdir(review, { recursive: true });
  await writeFile(path.join(review, "tailwind.css"), "body { color: red; }\n");

  const outside = await mkdtemp(path.join(tmpdir(), "prototype-css-outside-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, "tailwind.css"), "body { color: red; }\n");

  const ambiguousFixture = await createPrototype(context);
  const slug = ambiguousFixture.relative.split("/")[1];
  const ambiguous = `plan/${slug}/../${slug}/prototype`;

  for (const target of [
    `plan/${reviewSlug}/review`,
    outside,
    ambiguous,
  ]) {
    const result = runBuilder([target]);
    assert.notEqual(result.status, 0, target);
    assert.match(result.stderr, /target|path|directory|repository/i, target);
  }
  await assertStylesUnavailable(path.join(review, "styles.css"));
  await assertStylesUnavailable(path.join(outside, "styles.css"));
  await assertStylesUnavailable(ambiguousFixture.styles);
});

test("prototype rootのsymlinkを拒否する", async (context) => {
  const slug = `css-builder-root-link-${randomUUID()}`;
  const planRoot = path.join(repositoryRoot, "plan", slug);
  const linkedPrototype = path.join(planRoot, "prototype");
  const outside = await mkdtemp(path.join(tmpdir(), "prototype-css-root-link-"));
  context.after(() => rm(planRoot, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await Promise.all([
    mkdir(planRoot, { recursive: true }),
    writeFile(path.join(outside, "tailwind.css"), "body { color: red; }\n"),
  ]);
  await symlink(outside, linkedPrototype);

  const result = runBuilder([`plan/${slug}/prototype`]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink/i);
  await assertStylesUnavailable(path.join(outside, "styles.css"));
});

test("tailwind.cssのsymlinkを拒否する", async (context) => {
  const fixture = await createPrototype(context);
  const outside = await mkdtemp(path.join(tmpdir(), "prototype-css-input-link-"));
  const externalInput = path.join(outside, "external.css");
  context.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(externalInput, "body { color: red; }\n");
  await rm(path.join(fixture.absolute, "tailwind.css"));
  await symlink(externalInput, path.join(fixture.absolute, "tailwind.css"));

  const result = runBuilder([fixture.relative]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tailwind\.css.*symlink/i);
  await assertStylesUnavailable(fixture.styles);
});

test("styles.cssのsymlinkを拒否し、repository外の参照先を変更しない", async (context) => {
  const fixture = await createPrototype(context);
  const outside = await mkdtemp(path.join(tmpdir(), "prototype-css-output-link-"));
  const sentinel = path.join(outside, "sentinel.css");
  const sentinelContents = "external sentinel must remain unchanged\n";
  context.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(sentinel, sentinelContents);
  await symlink(sentinel, fixture.styles);

  const result = runBuilder([fixture.relative]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /styles\.css.*symlink/i);
  assert.equal(await readFile(sentinel, "utf8"), sentinelContents);
});

test("prototype内部のsubdirectory symlinkを拒否する", async (context) => {
  const fixture = await createPrototype(context);
  const outside = await mkdtemp(path.join(tmpdir(), "prototype-css-subdir-link-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, "outside.html"), '<div class="text-blue-500">outside</div>\n');
  await symlink(outside, path.join(fixture.absolute, "linked-source"));
  await writeFile(
    path.join(fixture.absolute, "tailwind.css"),
    '@import "tailwindcss";\n@source "./index.html";\n@source "./linked-source/**/*.html";\n',
  );

  const result = runBuilder([fixture.relative]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink/i);
  await assertStylesUnavailable(fixture.styles);
});

test("tailwind.cssの任意directiveをPostCSS実行前に拒否する", async (context) => {
  const cases = [
    '@import "../../../app/globals.css";\n@source "../..";\n',
    '@import "../../../app/globals.css";\n@config "./tailwind.config.js";\n',
    '@import "../../../app/globals.css";\n@plugin "./plugin.cjs";\n',
    '@import "../../../app/globals.css";\n@source ".";\nbody { color: red; }\n',
  ];

  for (const [index, contents] of cases.entries()) {
    await context.test(`case-${index + 1}`, async (caseContext) => {
      const fixture = await createPrototype(caseContext);
      const sentinel = path.join(fixture.absolute, "plugin-executed.txt");
      await Promise.all([
        writeFile(path.join(fixture.absolute, "tailwind.css"), contents),
        writeFile(
          path.join(fixture.absolute, "plugin.cjs"),
          `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "executed\\n");\nmodule.exports = () => {};\n`,
        ),
      ]);

      const result = runBuilder([fixture.relative]);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /tailwind\.css.*exactly.*contract|custom directives/i);
      await assertStylesUnavailable(fixture.styles);
      await assert.rejects(access(sentinel), { code: "ENOENT" });
    });
  }
});

test("引数不足と過剰引数をusage errorとして拒否する", async (context) => {
  const fixture = await createPrototype(context);

  for (const args of [[], [fixture.relative, "unexpected"]]) {
    const result = runBuilder(args);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.match(result.stderr, /usage:/i, args.join(" "));
  }
  await assertStylesUnavailable(fixture.styles);
});
