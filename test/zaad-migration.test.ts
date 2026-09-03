import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260901060000_add_disaster_radio_zaad";
const migrationUrl = new URL(
  `../prisma/migrations/${migrationName}/migration.sql`,
  import.meta.url,
);
const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const disasterRadioIndexName =
  "disaster_radio_subscriptions_normalizedEmail_normalizedPhone_ke";
const sourceListIndexName =
  "zaad_one_time_dispatch_source_lists_dispatchId_selectedOrder_ke";

test("ZAAD migration is additive and preserves resident and dispatch invariants", () => {
  const migration = readFileSync(migrationUrl, "utf8");

  for (const enumName of [
    "DisasterRadioConsentStatus",
    "DisasterRadioRegistrationSource",
    "ZoomContactSyncStatus",
    "ZaadMessageSyncStatus",
    "ZaadOneTimeDispatchState",
  ]) {
    assert.match(migration, new RegExp(`CREATE TYPE "${enumName}"`, "u"));
  }
  for (const table of [
    "disaster_radio_subscriptions",
    "zaad_registration_settings",
    "zaad_outbound_messages",
    "zaad_one_time_dispatches",
    "zaad_one_time_dispatch_source_lists",
    "zaad_one_time_dispatch_residents",
    "zaad_admin_audits",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`, "u"));
  }

  assert.match(migration, /disaster_radio_subscriptions_consent_check/u);
  assert.match(migration, /disaster_radio_subscriptions_sync_check/u);
  assert.match(
    migration,
    /"consentStatus" = 'NOT_CONSENTED' AND "syncStatus" = 'NOT_ELIGIBLE'/u,
  );
  assert.match(
    migration,
    /"consentStatus" = 'CONSENTED'[\s\S]*"syncStatus" IN \('NOT_ASSIGNED', 'PENDING', 'SYNCED', 'FAILED'\)/u,
  );
  assert.match(migration, /zaad_registration_settings_singleton_check/u);
  assert.match(migration, /zaad_registration_settings_snapshot_check/u);
  assert.match(migration, /zaad_one_time_dispatches_operationKey_key/u);
  assert.match(migration, /"recipientCount" <= 1000/u);
  assert.match(
    migration,
    /INSERT INTO "zaad_registration_settings"[\s\S]*VALUES \(1, 1, CURRENT_TIMESTAMP\)/u,
  );
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|RENAME|UPDATE)\b/imu);
});

test("ZMI-01: PostgreSQLで実在する2件のunique index名をPrisma schemaへmapする", () => {
  const schema = readFileSync(schemaUrl, "utf8");
  const disasterRadioModel = readModel(schema, "DisasterRadioSubscription");
  const sourceListModel = readModel(schema, "ZaadOneTimeDispatchSourceList");

  assert.match(
    disasterRadioModel,
    new RegExp(
      `@@unique\\(\\[normalizedEmail, normalizedPhone\\], map: "${disasterRadioIndexName}"\\)`,
      "u",
    ),
  );
  assert.match(
    sourceListModel,
    new RegExp(
      `@@unique\\(\\[dispatchId, selectedOrder\\], map: "${sourceListIndexName}"\\)`,
      "u",
    ),
  );
  assert.doesNotMatch(disasterRadioModel, /@@unique\([^\n]*\bname\s*:/u);
  assert.doesNotMatch(sourceListModel, /@@unique\([^\n]*\bname\s*:/u);
  assert.equal(Buffer.byteLength(disasterRadioIndexName, "utf8"), 63);
  assert.equal(Buffer.byteLength(sourceListIndexName, "utf8"), 63);
});

test("ZMI-02: 適用済みZAAD migrationのSQLとmanifest hashを維持する", () => {
  const migration = readFileSync(migrationUrl, "utf8");
  const sha256 = createHash("sha256").update(migration).digest("hex");
  const manifest = JSON.parse(
    readFileSync(
      new URL("../scripts/deploy/migrations.manifest.json", import.meta.url),
      "utf8",
    ),
  ) as {
    migrations: Array<{
      name: string;
      sha256: string;
      classification: string;
    }>;
  };
  const reviewed = readFileSync(
    new URL("../scripts/deploy/lib/reviewed-migrations.ts", import.meta.url),
    "utf8",
  );

  assert.deepEqual(
    manifest.migrations.find(({ name }) => name === migrationName),
    {
      name: migrationName,
      sha256,
      classification: "expand-compatible",
    },
  );
  assert.equal(
    manifest.migrations.findIndex(({ name }) => name === migrationName),
    manifest.migrations.length - 2,
  );
  assert.equal(
    manifest.migrations.at(-1)?.name,
    "20260901160000_add_reservation_caller_ani_binding",
  );
  assert.match(reviewed, new RegExp(migrationName, "u"));
  assert.match(reviewed, new RegExp(sha256, "u"));
});

function readModel(schema: string, modelName: string): string {
  const match = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, "u").exec(
    schema,
  );
  assert.ok(match, `Prisma model ${modelName} must exist.`);
  return match[1];
}
