import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTenantUpgrade, createDeploymentMigrationPlan, type TenantUpgradeDependencies } from "../lib/tenant-migration";
import { readReviewedMigrationChain, type MigrationPlan } from "../lib/migrations";

const chain = readReviewedMigrationChain(process.cwd());
for (const prefix of [17, 16, 18]) {
  test(`tenant upgrade exact prefix ${prefix}`, async () => {
    const operation = createDeploymentMigrationPlan({
      projectRoot: process.cwd(), directUrl: "postgresql://example.invalid/db",
      runner: { run: (_command, args) => args.includes("status") ? { status: 1, stdout: "Following migrations have not yet been applied", stderr: "" } : { status: 2, stdout: "ALTER TABLE x ADD COLUMN y text;", stderr: "" } },
      inspect: async () => ({ migrationsTableExists: true, migrations: chain.slice(0, prefix).map((m) => ({ name: m.name, checksum: m.hash, finished: true, rolledBack: false, logs: null })), userTables: ["user"], userObjects: ["table:user"], tablesWithData: ["user"], adminAccessRoleCardinalityViolations: 0 }),
    });
    if (prefix === 17) assert.equal((await operation).pending.length, 16);
    else await assert.rejects(operation, /reviewed tenant upgrade window/);
  });
}

function fixture(failure?: string): { calls: string[]; deps: TenantUpgradeDependencies } {
  const calls: string[] = [];
  const step = (name: string) => { calls.push(name); if (name === failure) throw new Error(name); };
  return { calls, deps: {
    productionUrl: "production", plan: { planHash: "hash" } as MigrationPlan,
    inspect: async (url) => { step(`inspect:${url}`); return { planHash: "hash" } as MigrationPlan; },
    capture: async (url) => { step(`capture:${url}`); return "snapshot"; },
    createClone: async () => { step("create"); return { directUrl: "clone" }; },
    deleteClone: async () => { step("cleanup"); },
    apply: (url) => step(`apply:${url}`),
    verify: async (url) => { step(`verify:${url}`); },
    verifyData: async (url) => { step(`data:${url}`); },
    beforeProduction: async () => { step("before-production"); },
  } };
}

test("rehearsal, data verification and cleanup precede Production", async () => {
  const { deps, calls } = fixture(); await applyTenantUpgrade(deps);
  assert.ok(calls.indexOf("cleanup") < calls.indexOf("apply:production"));
  assert.ok(calls.indexOf("data:clone") < calls.indexOf("cleanup"));
  assert.equal(calls.at(-1), "data:production");
});
for (const failure of ["apply:clone", "verify:clone", "data:clone", "cleanup", "before-production"]) {
  test(`${failure} prevents Production apply`, async () => {
    const { deps, calls } = fixture(failure);
    await assert.rejects(applyTenantUpgrade(deps));
    assert.ok(calls.includes("cleanup")); assert.ok(!calls.includes("apply:production"));
  });
}
test("changed Production data blocks apply", async () => {
  const { deps, calls } = fixture(); let count = 0;
  deps.capture = async () => ++count === 3 ? "changed" : "snapshot";
  await assert.rejects(applyTenantUpgrade(deps), /Production data changed/);
  assert.ok(!calls.includes("apply:production"));
});
