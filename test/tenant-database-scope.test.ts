import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TENANTS, getTenant } from "../lib/tenants";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);

function readModel(modelName: string): string {
  const match = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, "u").exec(
    schema,
  );
  assert.ok(match, `model ${modelName} not found`);
  return match[1];
}

/** テナントごとに1行だけ持つ設定。主キーが siteKey であること。 */
const SINGLETON_SETTINGS = [
  "SitePhoneSetting",
  "SiteChatSetting",
  "SiteDeveloperApiSetting",
  "ReservationApiUsageSetting",
  "ZaadRegistrationSetting",
];

/** テナントと別の軸の組で持つ設定。複合主キーの先頭が siteKey であること。 */
const COMPOSITE_SETTINGS: Array<[string, string]> = [
  ["LocalizedAiPhoneSetting", "locale"],
  ["LocaleDisplaySetting", "locale"],
  ["SiteMaintenanceSetting", "environment"],
  ["ReservationApiMonthlyUsage", "periodStart"],
];

/** テナント境界を跨いではならない運用データ。 */
const TENANT_SCOPED_DATA = [
  "DemoRecord",
  "ReservationBooking",
  "ReservationApiKey",
  "ReservationApiRequestLog",
  "DisasterRadioSubscription",
  "ZaadOutboundMessage",
  "ZaadOneTimeDispatch",
  "ZaadAdminAudit",
];

/** 業種をまたいで共有する。管理者は全デモサイトを1つの認証情報で運用する。 */
const SHARED_MODELS = [
  "user",
  "session",
  "account",
  "verification",
  "PasswordResetRequest",
  "AdminAccessRole",
  "AdminAccessRolePermission",
  "AdminAccessRoleAssignment",
  "AdminAccessMutationState",
];

test("tenant settings are keyed by siteKey", () => {
  for (const model of SINGLETON_SETTINGS) {
    assert.match(
      readModel(model),
      /siteKey\s+String\s+@id/u,
      `${model} must be keyed by siteKey`,
    );
  }
});

test("composite settings put siteKey first in the primary key", () => {
  for (const [model, second] of COMPOSITE_SETTINGS) {
    assert.match(
      readModel(model),
      new RegExp(`@@id\\(\\[siteKey, ${second}\\]\\)`, "u"),
      `${model} must be keyed by [siteKey, ${second}]`,
    );
  }
});

test("tenant-scoped operational data carries siteKey", () => {
  for (const model of TENANT_SCOPED_DATA) {
    assert.match(
      readModel(model),
      /\n\s*siteKey\s+String/u,
      `${model} must carry siteKey`,
    );
  }
});

test("shared models stay free of siteKey", () => {
  for (const model of SHARED_MODELS) {
    assert.doesNotMatch(
      readModel(model),
      /\bsiteKey\b/u,
      `${model} is shared across tenants and must not carry siteKey`,
    );
  }
});

test("only the local-government tenant enables the resident-facing subsystems", () => {
  // ZAAD／防災無線と予約APIキーはテナント引数の配線が未完のため、siteKey に既定値を
  // 置いている。他テナントで有効化する前に配線を終える必要があるので、その前提を固定する。
  for (const tenant of TENANTS) {
    if (tenant.key === "lg") continue;
    assert.equal(
      tenant.features.disasterRadio,
      false,
      `${tenant.key}: 防災無線を有効化する前に siteKey の配線と既定値の除去が必要`,
    );
  }
  assert.equal(getTenant("lg").features.disasterRadio, true);
});

test("the deferred siteKey defaults stay documented in the schema", () => {
  // 既定値は「暗黙に lg へ入る」ため、必ず理由のコメントとセットで残す。
  for (const model of [
    "ReservationApiKey",
    "DisasterRadioSubscription",
    "ZaadOutboundMessage",
    "ZaadOneTimeDispatch",
    "ZaadAdminAudit",
  ]) {
    const body = readModel(model);
    assert.match(
      body,
      /siteKey[^\n]*@default\("lg"\)/u,
      `${model} still relies on the deferred default`,
    );
    assert.match(
      body,
      /\/\/ NOTE:[\s\S]*既定値/u,
      `${model} must explain why the default is still there`,
    );
  }
});
