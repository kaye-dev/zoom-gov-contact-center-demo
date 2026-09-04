import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "../../..");
const workflow = readFileSync(
  resolve(projectRoot, ".github/workflows/deploy-runner-quality.yml"),
  "utf8",
);
const setupRunbook = readFileSync(
  resolve(projectRoot, "docs/deploy/vercel-neon/github-actions-setup.md"),
  "utf8",
);
const redeployRunbook = readFileSync(
  resolve(projectRoot, "docs/deploy/vercel-neon/github-actions-redeploy.md"),
  "utf8",
);
const localRedeployRunbook = readFileSync(
  resolve(projectRoot, "docs/deploy/vercel-neon/redeploy.md"),
  "utf8",
);
const initialDeployRunbook = readFileSync(
  resolve(projectRoot, "docs/deploy/vercel-neon/initial-deploy.md"),
  "utf8",
);

test("DRQ-WF-01: 全PRとmainのexact SHAをdeploy runner内で検証する", () => {
  assert.match(workflow, /^name: Deploy runner quality$/mu);
  assert.match(
    workflow,
    /^on:\n  pull_request:\n  push:\n    branches: \[main\]$/mu,
  );
  assert.doesNotMatch(workflow, /^\s*paths(?:-ignore)?:/mu);
  assert.match(workflow, /^    name: Deploy runner npm test$/mu);

  for (const match of workflow.matchAll(/^\s*uses:\s+[^@\s]+@([^\s#]+)/gmu)) {
    assert.match(match[1], /^[0-9a-f]{40}$/u, "actions must use a full SHA");
  }
  assert.match(workflow, /persist-credentials: false/u);

  const headCheck = workflow.indexOf('[[ "$(git rev-parse HEAD)" == "${GITHUB_SHA}" ]]');
  const archive = workflow.indexOf('git archive --format=tar "${GITHUB_SHA}"');
  const build = workflow.indexOf("docker build");
  const testRun = workflow.indexOf("docker run --rm --init --network none");
  const typecheckRun = workflow.indexOf("            run typecheck");
  const migrationParityRun = workflow.indexOf(
    "            run test:migration-schema:db",
  );
  const auditRun = workflow.indexOf(
    "            audit --omit=dev --ignore-scripts --registry=https://registry.npmjs.org/",
  );
  assert.ok(
    headCheck >= 0 &&
      headCheck < archive &&
      archive < build &&
      build < testRun &&
      testRun < typecheckRun &&
      typecheckRun < migrationParityRun &&
      migrationParityRun < auditRun,
    "the exact checked-out SHA must be archived, built, tested, typechecked, checked for migration parity, and audited in order",
  );
  assert.match(workflow, /--file "\$\{build_context\}\/Dockerfile\.deploy"/u);
  assert.match(workflow, /--build-arg "DEPLOY_GIT_SHA=\$\{GITHUB_SHA\}"/u);
  assert.match(workflow, /zoom-gov-contact-center-demo-deploy:\$\{GITHUB_SHA\}/u);
});

test("DRQ-WF-02: PR品質checkはProduction権限と秘密情報を持たない", () => {
  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.doesNotMatch(workflow, /^\s*(?:id-token|packages|actions|checks):\s*write$/mu);
  assert.doesNotMatch(workflow, /pull_request_target/u);
  assert.doesNotMatch(workflow, /^\s*environment:/mu);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./u);
  assert.doesNotMatch(workflow, /\b(?:aws|ssm|vercel|neon)\b/iu);
  assert.doesNotMatch(workflow, /^\s+(?:--volume|-v)(?:\s|=)/mu);
});

test("DRQ-WF-03: deploy runner testとtypecheckはnetworkとhost mountなしで終了する", () => {
  assert.match(workflow, /^    timeout-minutes: 20$/mu);
  assert.match(
    workflow,
    /docker run --rm --init --network none \\\n+            --entrypoint npm \\\n+            "\$\{image\}" \\\n+            test/u,
  );
  assert.match(
    workflow,
    /docker run --rm --init --network none \\\n+            --entrypoint npm \\\n+            "\$\{image\}" \\\n+            run typecheck/u,
  );
  assert.equal(
    [...workflow.matchAll(/docker run --rm --init --network none/gmu)].length,
    2,
  );
});

test("DRQ-WF-04: runtime auditだけがregistryへ接続し秘密情報とhost mountを受け取らない", () => {
  assert.match(
    workflow,
    /if docker run --rm --init --network bridge \\\n+\s+--entrypoint npm \\\n+\s+"\$\{image\}" \\\n+\s+audit --omit=dev --ignore-scripts --registry=https:\/\/registry\.npmjs\.org\//u,
  );
  assert.equal(
    [...workflow.matchAll(/docker run --rm --init --network bridge/gmu)].length,
    1,
  );
  assert.doesNotMatch(workflow, /^\s+(?:--volume|-v)(?:\s|=)/mu);
});

test("DRQ-WF-04a: runtime auditは外部registry障害をboundedに再試行し、最終失敗を通過させない", () => {
  assert.match(workflow, /audit_attempts=3/u);
  assert.match(workflow, /for audit_attempt in \$\(seq 1 "\$\{audit_attempts\}"\); do/u);
  assert.match(workflow, /--fetch-retries=0/u);
  assert.match(workflow, /--fetch-timeout=30000/u);
  assert.match(workflow, /sleep \$\(\(audit_attempt \* 5\)\)/u);
  assert.match(workflow, /\[\[ "\$\{audit_status\}" == "0" \]\]/u);
  assert.doesNotMatch(workflow, /audit[\s\S]*?\|\|\s*true/u);
});

test("DRQ-WF-05: migration parityは非空diffをCI check failureにする", () => {
  const parityCommand = workflow.indexOf("run test:migration-schema:db");
  const cleanup = workflow.indexOf("cleanup_owned_migration_resources", parityCommand);
  const audit = workflow.indexOf("audit --omit=dev", cleanup);
  assert.ok(parityCommand >= 0 && parityCommand < cleanup && cleanup < audit);
  assert.match(workflow, /set -euo pipefail/u);
  const parityInvocation = workflow.slice(
    workflow.lastIndexOf("docker run --rm --init", parityCommand),
    parityCommand + "run test:migration-schema:db".length,
  );
  assert.doesNotMatch(parityInvocation, /\|\|\s*true|^\s*if\s+docker run/mu);
});

test("DRQ-WF-06: migration parity DBは内部networkとsynthetic credentialだけを使用する", () => {
  assert.match(workflow, /resource_suffix="\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/u);
  assert.ok(workflow.includes('[[ "${resource_suffix}" =~ ^[0-9]+-[0-9]+$ ]]'));
  assert.match(workflow, /docker network create --internal/u);
  assert.match(workflow, /--network-alias migration-schema-db/u);
  assert.match(workflow, /postgres:17-bookworm/u);
  assert.match(workflow, /POSTGRES_PASSWORD=migration-schema-ci-only/u);
  assert.match(
    workflow,
    /ADMIN_ACCESS_TEST_ADMIN_URL=postgresql:\/\/postgres:migration-schema-ci-only@migration-schema-db:5432\/postgres/u,
  );
  assert.match(workflow, /for attempt in \$\(seq 1 30\); do/u);
  assert.match(workflow, /pg_isready --username postgres --dbname postgres/u);
  assert.match(workflow, /actual_owner[\s\S]*dev\.keien\.migration-schema-owner/u);
  assert.match(workflow, /docker rm --force "\$\{migration_database\}"/u);
  assert.match(workflow, /docker network rm "\$\{migration_network\}"/u);
  assert.doesNotMatch(workflow, /^\s+(?:--publish|-p|--volume|-v)(?:\s|=)/mu);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./u);
});

test("DRQ-DOC-01: runbookはCI migration parityと安全な復旧順序を固定する", () => {
  for (const runbook of [setupRunbook, redeployRunbook]) {
    assert.match(runbook, /Deploy runner npm test/u);
    assert.match(
      runbook,
      /`Deploy runner npm test`[^\n]*`npm test`[^\n]*`npm run typecheck`[^\n]*`npm audit --omit=dev`/u,
    );
    assert.match(runbook, /test:migration-schema:db/u);
    assert.match(runbook, /隔離PostgreSQL/u);
    assert.match(runbook, /required status check/u);
    assert.match(runbook, /Production変更なし/u);
  }
  assert.match(setupRunbook, /strict mode/u);
  assert.match(setupRunbook, /required context/u);
  assert.match(setupRunbook, /workflowを変更/u);
});

test("DRQ-DOC-02: migration apply後のdrift復旧は自動rollbackと履歴改変を禁止する", () => {
  assert.match(localRedeployRunbook, /_prisma_migrations/u);
  assert.match(localRedeployRunbook, /prisma migrate status/u);
  assert.match(localRedeployRunbook, /prisma migrate diff/u);
  assert.match(localRedeployRunbook, /自動rollback/u);
  assert.match(localRedeployRunbook, /適用済みmigration SQL/u);
  assert.match(localRedeployRunbook, /prisma migrate resolve/u);
  assert.match(localRedeployRunbook, /prisma db push/u);
  assert.match(localRedeployRunbook, /CI check[^\n]*`main`/u);
});

test("DBTLS-DOC-01: runbookはTLS正規化とfallback禁止と完了bannerを固定する", () => {
  for (const runbook of [initialDeployRunbook, localRedeployRunbook]) {
    assert.match(runbook, /raw URIは手編集せず/u);
    assert.match(runbook, /memory上で`sslmode=verify-full`へ正規化/u);
    assert.match(runbook, /pooled URIだけをVercel Production/u);
    assert.match(runbook, /`sslmode=require`、`no-verify`、`NODE_TLS_REJECT_UNAUTHORIZED=0`へfallback/u);
    assert.match(runbook, /✓ PRODUCTION DEPLOYMENT SUCCEEDED/u);
  }
});
