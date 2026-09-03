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
  assert.ok(
    headCheck >= 0 &&
      headCheck < archive &&
      archive < build &&
      build < testRun &&
      testRun < typecheckRun,
    "the exact checked-out SHA must be archived, built, tested, and typechecked in order",
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
  assert.doesNotMatch(workflow, /--env(?:-file)?\b/u);
});

test("DRQ-DOC-01: runbookはrequired checkと安全な復旧順序を固定する", () => {
  for (const runbook of [setupRunbook, redeployRunbook]) {
    assert.match(runbook, /Deploy runner npm test/u);
    assert.match(
      runbook,
      /`Deploy runner npm test`[^\n]*`npm test`[^\n]*`npm run typecheck`/u,
    );
    assert.match(runbook, /required status check/u);
    assert.match(runbook, /Production変更なし/u);
  }
  assert.match(setupRunbook, /strict mode/u);
  assert.match(setupRunbook, /required context/u);
  assert.match(setupRunbook, /workflowを変更/u);
});
