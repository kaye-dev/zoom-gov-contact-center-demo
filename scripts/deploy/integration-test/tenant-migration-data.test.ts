import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "pg";
import { withIsolatedPostgresDatabase } from "../../../test/helpers/isolated-postgres";
import { readReviewedMigrationChain } from "../lib/migrations";
import { captureTenantData, assertTenantDataPreserved } from "../lib/tenant-migration-data";
import { verifyMaintenanceSettingsDatabase } from "../lib/maintenance";

test("tenant upgrade preserves populated legacy data and verifies six maintenance rows", async () => {
  await withIsolatedPostgresDatabase(async (url) => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const chain = readReviewedMigrationChain(process.cwd());
      for (const migration of chain.slice(0, 17)) await client.query(migration.sql);
      await client.query(`INSERT INTO demo_records (message) VALUES ('migration-preservation-test')`);
      await client.query(`INSERT INTO zaad_outbound_messages (id,name,body,"voiceId","updatedAt") VALUES ('migration-message','test','message body','voice',CURRENT_TIMESTAMP)`);
      await verifyMaintenanceSettingsDatabase(url);
      const before = await captureTenantData(url);
      for (const migration of chain.slice(17)) await client.query(migration.sql);
      assertTenantDataPreserved(before, await captureTenantData(url, before));
      await verifyMaintenanceSettingsDatabase(url);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM site_maintenance_settings')).rows[0].n, 6);
      assert.equal((await client.query(`SELECT "siteKey" FROM demo_records`)).rows[0].siteKey, 'lg');
      const revision = await client.query(`SELECT r.body FROM zaad_outbound_messages m JOIN outreach_message_revisions r ON r.id=m."currentRevisionId" AND r."siteKey"=m."siteKey" WHERE m.id='migration-message'`);
      assert.equal(revision.rows[0].body, 'message body');
      await client.query(`UPDATE demo_records SET message='corrupted'`);
      assert.throws(() => assertTenantDataPreserved(before, []));
      assert.notDeepEqual(before, await captureTenantData(url, before));
    } finally { await client.end(); }
  }, { migrate: false });
});
