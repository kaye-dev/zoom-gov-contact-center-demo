import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

type ChildResult = {
  pooledUrl: string;
  directUrl: string;
  pooledSsl: unknown;
  directSsl: unknown;
  pooledRejectUnauthorized?: boolean;
  directRejectUnauthorized?: boolean;
  warningCount: number;
};

function inspectPgTlsConfiguration(): {
  result: ChildResult;
  stdout: string;
  stderr: string;
} {
  const source = String.raw`
    import { validateDatabaseUrls } from "./scripts/deploy/lib/validation.ts";
    import { Client } from "pg";

    let warningCount = 0;
    process.on("warning", () => {
      warningCount += 1;
    });

    const target = validateDatabaseUrls(
      "postgresql://runtime:synthetic@ep-runtime-pooler.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require",
      "postgresql://runtime:synthetic@ep-runtime.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require",
    );
    const pooledClient = new Client({ connectionString: target.pooledUrl });
    const directClient = new Client({ connectionString: target.directUrl });
    await new Promise((resolve) => setImmediate(resolve));
    console.log(JSON.stringify({
      pooledUrl: target.pooledUrl,
      directUrl: target.directUrl,
      pooledSsl: pooledClient.ssl,
      directSsl: directClient.ssl,
      pooledRejectUnauthorized: pooledClient.ssl?.rejectUnauthorized,
      directRejectUnauthorized: directClient.ssl?.rejectUnauthorized,
      warningCount,
    }));
  `;
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_NO_WARNINGS;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", source],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
    },
  );

  assert.equal(child.status, 0, child.stderr);
  return {
    result: JSON.parse(child.stdout.trim()) as ChildResult,
    stdout: child.stdout,
    stderr: child.stderr,
  };
}

test("DBTLS-01: 実pg Client生成でTLS security warningを発生させない", () => {
  const child = inspectPgTlsConfiguration();

  assert.equal(child.result.warningCount, 0);
  assert.doesNotMatch(child.stdout, /SECURITY WARNING/u);
  assert.doesNotMatch(child.stderr, /SECURITY WARNING/u);
  assert.doesNotMatch(child.stdout, /次回major更新前/u);
  assert.doesNotMatch(child.stderr, /次回major更新前/u);
});

test("DBTLS-03: 実pg Clientが証明書とhostnameを検証するTLS設定を受け取る", () => {
  const { result } = inspectPgTlsConfiguration();

  assert.ok(result.pooledSsl);
  assert.ok(result.directSsl);
  assert.notEqual(result.pooledRejectUnauthorized, false);
  assert.notEqual(result.directRejectUnauthorized, false);
  assert.equal(new URL(result.pooledUrl).searchParams.get("sslmode"), "verify-full");
  assert.equal(new URL(result.directUrl).searchParams.get("sslmode"), "verify-full");
});
