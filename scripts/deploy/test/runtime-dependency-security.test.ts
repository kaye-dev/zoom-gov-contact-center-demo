import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

type PackageJson = {
  dependencies: Record<string, string>;
  overrides: Record<string, string | Record<string, string>>;
  scripts: Record<string, string>;
};

type LockedPackage = {
  dependencies?: Record<string, string>;
  integrity?: string;
  version?: string;
};

type PackageLock = {
  packages: Record<string, LockedPackage>;
};

const projectRoot = resolve(import.meta.dirname, "../../..");
const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, "package.json"), "utf8"),
) as PackageJson;
const packageLock = JSON.parse(
  readFileSync(resolve(projectRoot, "package-lock.json"), "utf8"),
) as PackageLock;
const prismaSchema = readFileSync(resolve(projectRoot, "prisma/schema.prisma"), "utf8");
const prismaRuntime = readFileSync(resolve(projectRoot, "lib/server/prisma.ts"), "utf8");

test("RDS-01: security overrideは既存deepmerge-tsと監査対象2件をexact versionで固定する", () => {
  assert.deepEqual(Object.keys(packageJson.overrides).sort(), [
    "@prisma/config",
    "fast-uri",
    "mysql2",
  ]);
  assert.deepEqual(packageJson.overrides["@prisma/config"], {
    "deepmerge-ts": "8.0.2",
  });
  assert.equal(packageJson.overrides["fast-uri"], "3.1.7");
  assert.equal(packageJson.overrides.mysql2, "3.24.3");
});

test("RDS-02: lockfileはsecurity overrideとPrisma 7.9.1を解決済みintegrity付きで固定する", () => {
  for (const [dependency, version] of [
    ["fast-uri", "3.1.7"],
    ["mysql2", "3.24.3"],
  ] as const) {
    const locked = packageLock.packages[`node_modules/${dependency}`];
    assert.equal(locked?.version, version);
    assert.match(locked?.integrity ?? "", /^sha512-/u);
  }

  for (const dependency of ["@prisma/adapter-pg", "@prisma/client", "prisma"] as const) {
    assert.equal(packageJson.dependencies[dependency], "7.9.1");
    assert.equal(packageLock.packages[""].dependencies?.[dependency], "7.9.1");
    assert.equal(packageLock.packages[`node_modules/${dependency}`]?.version, "7.9.1");
  }
});

test("RDS-03: application runtimeはPostgreSQLだけを選択しmysql2とfast-uriを直接利用しない", () => {
  assert.equal(packageJson.dependencies.mysql2, undefined);
  assert.equal(packageJson.dependencies["fast-uri"], undefined);
  assert.match(
    prismaSchema,
    /datasource db\s*\{[\s\S]*?provider\s*=\s*"postgresql"[\s\S]*?\}/u,
  );
  assert.match(prismaRuntime, /from "@prisma\/adapter-pg"/u);
  assert.doesNotMatch(prismaRuntime, /@prisma\/adapter-(?:mariadb|mysql)|\bmysql2\b/iu);
});

test("RDS-04: runtime audit scriptはproduction dependencyを省略せず検査する", () => {
  assert.equal(packageJson.scripts["audit:runtime"], "npm audit --omit=dev");
});
