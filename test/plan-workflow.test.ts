import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFile(path.join(root, relative), "utf8");

const headings = [
  "# 目的と完了条件",
  "# 現状と根拠",
  "# 実装方針",
  "# インターフェースとデータフロー",
  "# テスト計画",
  "# 前提・対象外・リスク",
];

test("plans/template.mdは6つのH1とcompactなUI契約を正しい順で持つ", async () => {
  const template = await read("plans/template.md");
  assert.deepEqual(template.match(/^# .+$/gm), headings);
  assert.match(template, /^## 要件クロージャ$/m);
  assert.match(template, /^\| 要件 \| goal内の設計 \| prototype \| テスト \| 完了条件 \|$/m);
  assert.match(template, /^## UI契約$/m);
  for (const field of [
    "UI変更",
    "prototype",
    "approval contract",
    "prototype revision",
    "production baseline",
    "comparison conditions",
    "baseline state inventory",
    "theme contract",
    "responsive contract",
    "styling pipeline",
    "視覚的不変条件",
    "意図した差分",
    "stateとinteraction",
    "comparison targets",
    "parity matrix",
    "parity evidence",
    "machine parity",
    "UI承認記録",
  ]) {
    assert.match(template, new RegExp(`^- ${field}:`, "m"));
  }
  assert.match(template, /変更なし。/);
  assert.match(template, /なし。/);
  assert.doesNotMatch(template, /metadata|status|task表|G0[1-6]|進捗|実行記録|draft|final/iu);
});

test("plannerはrepoとproduction baselineを調査しcanonical goalとUI prototypeを生成する", async () => {
  const [planner, quality, goalQuality] = await Promise.all([
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/plan/references/ui-prototype-quality.md"),
    read(".agents/skills/plan/references/goal-quality.md"),
  ]);
  assert.match(planner, /Read \[references\/goal-quality\.md\]/);
  assert.match(planner, /authoritative requirements bundle/);
  assert.match(planner, /Inspect the relevant code, tests, configuration, Git state, and runtime behavior/);
  assert.match(planner, /plans\/<slug>\/goal\.md/);
  assert.match(planner, /write allowlist is exactly `plans\/<slug>\/goal\.md`/);
  assert.match(planner, /check both `plans\/<slug>\/goal\.md` and `plans\/<slug>\/prototype\/`/);
  assert.match(planner, /Never create or edit `plans\/<slug>\/review\/`/);
  assert.match(planner, /Preserve its six headings and their order exactly/);
  assert.match(planner, /self-contained final design/);
  assert.match(planner, /Describe only the adopted design/);
  assert.match(planner, /Do not invent decisions to close a high-impact unknown/);
  assert.match(planner, /plans\/<slug>\/prototype\//);
  assert.match(planner, /production-parity artifact/);
  assert.match(planner, /prototype-revision\.mjs/);
  assert.match(planner, /approval contract: plans\/<slug>\/prototype\/ui-contract\.json — version 1/);
  assert.match(planner, /pending and completed `parity evidence`, `machine parity`, and `UI承認記録` entries must all name that same revision/);
  assert.match(planner, /UI承認記録: 未承認 — revision sha256:<64hex>/);
  assert.match(planner, /complete the template's `要件クロージャ` audit/);
  assert.match(goalQuality, /latest explicit requirements/);
  assert.match(goalQuality, /Do not substitute the entire conversation/);
  assert.match(goalQuality, /Record the audit in `## 要件クロージャ`/);
  assert.match(goalQuality, /Audit every atomic clause/);
  assert.match(goalQuality, /compile-time, typecheck, or interface-contract check/);
  assert.match(goalQuality, /immutable parity-matrix definition/);
  assert.match(goalQuality, /only approval contract accepted by `\$implement` and `\$review`/);
  assert.match(goalQuality, /Legacy `plans\/tmp\/<slug>\/prototype\/` artifacts remain available only for viewing and CSS builds/);
  assert.match(goalQuality, /non-empty `sources` inventory/);
  assert.match(goalQuality, /page, shell, reusable controls, global styles, and tokens/);
  assert.match(goalQuality, /Every comparison target has a unique `id`, canonical prototype `entry`, canonical origin-relative production `route`, and `surface`/);
  assert.match(goalQuality, /unique `id` plus `targetId`, `entry`, production `route`, `surface`, `state`, `viewport`, `theme`, `breakpoint`/);
  assert.match(goalQuality, /target × state × breakpoint × theme/);
  assert.match(goalQuality, /Keep comparison outcomes outside the manifest/);
  assert.match(goalQuality, /keyed by the immutable matrix row IDs/);
  assert.match(goalQuality, /exactly one result for every manifest row ID/);
  assert.match(goalQuality, /Approval-bound evidence does not establish current-run freshness/);
  assert.match(goalQuality, /Any prototype-content change produces a new revision and invalidates earlier parity evidence, machine parity, and UI approval/);
  assert.match(quality, /Identify the closest existing route and the shared shell/);
  assert.match(quality, /production stylesheet/);
  assert.match(quality, /plans\/<slug>\/prototype\/ui-contract\.json/);
  assert.match(quality, /digest-bound source of truth/);
  assert.match(quality, /comparison-target inventory/);
  assert.match(quality, /target ID, matching entry\/route\/surface/);
  assert.match(quality, /Do not put results, dates, screenshots, pass\/fail values, or evidence locations into the matrix or manifest/);
  assert.match(quality, /Record mutable comparison outcomes in `parity evidence`, keyed by those stable row IDs/);
  assert.match(quality, /Stop before comparison, parity, or approval when the file is missing, the path or version differs, or either representation contradicts the other/);
  assert.match(quality, /Set `machine parity: 合格[^`]*` only when every row passes/);
  assert.match(quality, /machine parity: 合格 — YYYY-MM-DD — revision sha256:<64hex> — <every passing row ID and evidence summary>/);
  assert.match(quality, /machine parity: 未確認 — revision sha256:<64hex> — <every pending row ID>/);
  assert.match(quality, /UI承認記録: 未承認 — revision sha256:<64hex>/);
  assert.match(quality, /UI承認記録: YYYY-MM-DD — revision sha256:<64hex> — <explicit approval basis>/);
  assert.doesNotMatch(quality, /`machine parity: 合格 — YYYY-MM-DD — <evidence summary>`/);
  assert.doesNotMatch(quality, /`UI承認記録: 未承認`/);
  assert.match(quality, /Machine parity never becomes user approval automatically/);
  assert.match(quality, /current-run pre-edit evidence set/);
  assert.doesNotMatch(planner, /plans\/<slug>\.md|plans\/reviews\/<slug>|validate-plan-file|plan_author|gpt-5\./);
});

test("criticはfresh reviewを基に同一goalを更新しUI契約変更時は再承認へ戻す", async () => {
  const critic = await read(".agents/skills/plan-critic/SKILL.md");
  assert.match(critic, /Use the explicit `plans\/<slug>\/goal\.md` path/);
  assert.match(critic, /plans\/\*\/goal\.md/);
  assert.match(critic, /fresh no-history subagent/);
  assert.match(critic, /authoritative requirements bundle/);
  assert.match(critic, /latest explicit user requirements, finalized decisions, and user-specified or explicitly adopted source materials/);
  assert.match(critic, /Do not pass the parent conversation/);
  assert.match(critic, /audit every atomic clause of every authoritative requirement/);
  assert.match(critic, /API\/type compatibility and runtime behavior need their own concrete checks/);
  assert.match(critic, /ui-prototype-quality\.md/);
  assert.match(critic, /exactly one candidate exists; stop when there are zero or multiple candidates/);
  assert.match(critic, /stop and ask the user before changing the goal or prototype/);
  assert.match(critic, /write the final goal once/);
  assert.match(critic, /as if the adopted design had been known from the start/);
  assert.match(critic, /Correct deterministic prototype defects/);
  assert.match(critic, /create the complete canonical `plans\/<slug>\/prototype\/`/);
  assert.match(critic, /missing prototype or manifest is repairable only when[^.]*uniquely/i);
  assert.match(critic, /Rebuild Tailwind CSS/);
  assert.match(critic, /prototype-revision\.mjs/);
  assert.match(critic, /Codex in-app Browser/);
  assert.match(critic, /machine parity: 未確認 — revision sha256:<64hex>/);
  assert.match(critic, /UI承認記録: 未承認 — revision sha256:<64hex>/);
  assert.match(critic, /Do not create `critique\.md`/);
  assert.doesNotMatch(critic, /plans\/<slug>\.md|plans\/reviews\/<slug>|plan_critic|plan_rewriter|gpt-5\./);
});

test("implementは未承認UIで停止し、承認済みmatrixでimplementation parityを確認する", async () => {
  const [executor, devServer, workflow] = await Promise.all([
    read(".agents/skills/implement/SKILL.md"),
    read(".claude/rules/dev-server.md"),
    read("docs/development/codex-development-workflow.md"),
  ]);
  assert.match(executor, /Use the explicit `plans\/<slug>\/goal\.md` path/);
  assert.match(executor, /plans\/\*\/goal\.md/);
  assert.match(executor, /stop when there are zero or multiple candidates/);
  assert.match(executor, /current agent owns investigation, implementation, verification, and live behavior checks/);
  assert.match(executor, /goal-quality\.md/);
  assert.match(executor, /ui-prototype-quality\.md/);
  assert.match(executor, /rendered DOM or the accessibility tree/);
  assert.match(executor, /require `plans\/<slug>\/prototype\/`, a dated `machine parity: 合格[^`]*`, and a dated explicit `UI承認記録:[^`]*` before editing production code/);
  assert.match(executor, /complete, non-placeholder values for every `UI契約` field/);
  assert.match(executor, /approval contract: plans\/<slug>\/prototype\/ui-contract\.json — version 1/);
  assert.match(executor, /prototype revision/);
  assert.match(executor, /Extract exactly one full `sha256:\[0-9a-f\]\{64\}` token from each/);
  assert.match(executor, /`prototype revision`, `parity evidence`, `machine parity`, and `UI承認記録` fields/);
  assert.match(executor, /Require all four extracted revisions to equal the current artifact/);
  assert.match(executor, /Require `parity evidence` and `machine parity` each to identify every immutable manifest row ID exactly once/);
  assert.match(executor, /`未確認`, `未承認`, a missing or unresolved row, Browser evidence alone, and automated evidence alone all stop implementation/);
  assert.match(executor, /Treat the approved prototype and `UI契約` as the production target/);
  assert.match(executor, /Require `plans\/<slug>\/prototype\/ui-contract\.json` version 1 to pass `prototype-revision\.mjs`'s exact schema/);
  assert.match(executor, /semantically match the goal's approval-critical `UI契約` values/);
  for (const mapping of [
    "`productionBaseline` to `production baseline`",
    "`comparisonConditions` to `comparison conditions`",
    "`baselineStateInventory` to `baseline state inventory`",
    "`themeContract` to `theme contract`",
    "`responsiveContract` to `responsive contract`",
    "`visualInvariants` to `視覚的不変条件`",
    "`intentionalDifferences` to `意図した差分`",
    "`stateAndInteraction` to `stateとinteraction`",
    "`comparisonTargets` to `comparison targets`",
    "`parityMatrix` to the complete immutable `parity matrix`",
  ]) {
    assert.ok(executor.includes(mapping), `implement contract mapping is missing: ${mapping}`);
  }
  assert.match(executor, /missing file, parse or schema error, missing or placeholder value, unresolved evidence row, or contradiction stops implementation before production editing/);
  assert.match(executor, /Compare mutable `parity evidence` to this definition by row ID/);
  assert.match(executor, /Do not require revision or evidence records inside the JSON/);
  assert.match(executor, /Before starting or reusing any preflight server, capture a baseline/);
  assert.match(executor, /every relevant process, container, Compose service, volume, network, and dependency artifact/);
  assert.match(executor, /record each applicable PID or stable resource ID/);
  assert.match(executor, /Reuse the real application only when the baseline proves it is the correct runtime from the target checkout and mount/);
  assert.match(executor, /Otherwise start it with the repository-standard method/);
  assert.match(executor, /exactly `http:\/\/localhost:3000`/);
  assert.match(executor, /\.\/dev-prototype\.sh <slug>/);
  assert.match(executor, /run `\.\/dev-prototype\.sh <slug>` exactly once for preflight/);
  assert.match(executor, /reuse that same prototype process for final parity/);
  assert.match(executor, /`http:\/\/127\.0\.0\.1:<port>\/` prototype URL reported by the launcher/);
  assert.match(executor, /Codex in-app Browser/);
  assert.match(executor, /stop before production editing/);
  assert.match(executor, /Approval-time evidence is not current-run evidence/);
  assert.match(executor, /immediately before the first production edit, rerun the entire immutable matrix/);
  assert.match(executor, /current-run pre-edit parity/);
  assert.match(executor, /Do not reuse an earlier run merely because its date or revision matches/);
  assert.match(executor, /complete baseline source inventory, runtime owner, checkout, commit and route/);
  assert.match(executor, /inspect every exact path in `productionBaseline\.sources`/);
  assert.match(executor, /no missing, duplicate, aggregate-only, or extra row/);
  assert.match(executor, /treat approval-time parity and UI approval as invalid for implementation/);
  assert.match(executor, /390×844/);
  assert.match(executor, /one CSS pixel before and exactly at every affected breakpoint/);
  assert.match(executor, /DOM and accessibility state, relevant bounding rectangles and computed styles/);
  assert.match(executor, /After the last relevant change/);
  assert.match(executor, /Any later relevant change invalidates that evidence/);
  assert.match(executor, /Before a build that can share or replace runtime output/);
  assert.match(executor, /Never run that build concurrently with a user-owned development server/);
  assert.match(executor, /demonstrably isolated build that contains the exact current changes/);
  assert.match(executor, /After the build, restart the real application with the same repository-standard method/);
  assert.match(executor, /re-confirm the LISTEN address, PID, cwd, command, runtime owner, container identity, target-checkout mount/);
  assert.match(executor, /same comparison conditions recorded for preflight and `ui-contract\.json`/);
  assert.match(executor, /clean up only exact agent-owned delta resources/);
  assert.match(executor, /Never run a broad `docker compose down`/);
  assert.match(executor, /never stop, replace, or remove a user's or pre-existing process/);
  for (const contract of [devServer, workflow]) {
    assert.match(contract, /preflight[\s\S]+前[\s\S]+baseline|baseline[\s\S]+preflight/);
    assert.match(contract, /prototype[\s\S]+1回だけ起動/);
    assert.match(contract, /ユーザー所有[\s\S]+dev server[\s\S]+同時[\s\S]+build|ユーザー所有dev server[\s\S]+同時build/);
    assert.match(contract, /安全な隔離build/);
    assert.match(contract, /build後[\s\S]+同じrepository標準導線/);
    assert.match(contract, /baseline[\s\S]+差分[\s\S]+cleanup|baselineとの差分だけをcleanup/);
    assert.match(contract, /docker compose down/);
    assert.match(contract, /plans\/tmp\/(?:<slug>\/prototype\/)?[^\n]*(?:閲覧|view)[^\n]*CSS build[^\n]*(?:canonical|移行)/iu);
  }
  assert.match(workflow, /manual integration gate/);
  assert.match(workflow, /OS-level security boundaryではない/);
  assert.match(workflow, /current-run pre-edit parity/);
  assert.match(workflow, /全baseline sourceのworking tree/);
  assert.match(workflow, /Browserまたは条件が欠けるnegative case[\s\S]*production差分が0件/);
  assert.match(workflow, /user-owned dev server[\s\S]+停止せず[\s\S]+同時buildもせず/);
  assert.match(workflow, /cleanupはbaselineとの差分にあるagent-owned PID\/container\/service\/volume\/network\/dependency artifactだけ/);
  assert.doesNotMatch(executor, /plans\/<slug>\.md|plans\/reviews\/<slug>|validate-plan-file|review.*automatically|gpt-5\.|G0[1-6]/);
});

test("reviewはcanonical reportに2種類のreviewを統合し欠落implementation parityをmajorとする", async () => {
  const review = await read(".agents/skills/review/SKILL.md");
  assert.match(review, /goal-quality\.md/);
  assert.match(review, /Use the explicit `plans\/<slug>\/goal\.md` path/);
  assert.match(review, /plans\/\*\/goal\.md/);
  assert.match(review, /stop for zero or multiple candidates/);
  assert.match(review, /staged, unstaged, deleted, and relevant non-ignored untracked files/);
  assert.match(review, /Independently classify the exact diff and affected code as UI-affecting/);
  assert.match(review, /prototype-revision\.mjs plans\/<slug>\/prototype/);
  assert.match(review, /`prototype revision`, `parity evidence`, `machine parity`, and `UI承認記録` fields exactly once/);
  assert.match(review, /mandatory major finding/);
  assert.match(review, /require the user to state the Git base revision/);
  assert.match(review, /fresh no-history subagent for the blind diff review/);
  assert.match(review, /not the plan, conversation, task rationale, or any prior review/);
  assert.match(review, /not the blind result or conversation/);
  assert.match(review, /approved prototype, validated `ui-contract\.json`, current prototype revision/);
  assert.match(review, /complete production `sources` inventory/);
  assert.match(review, /every immutable manifest row ID exactly once/);
  assert.match(review, /missing[^.]*implementation(?:-| )parity[^.]*major/i);
  assert.match(review, /plans\/<slug>\/review\//);
  assert.match(review, /Group changes by intent rather than file order/);
  assert.match(review, /sort groups by risk/);
  assert.match(review, /Mark any change whose intent cannot be explained as `要改善`/);
  assert.doesNotMatch(review, /plans\/<slug>\.md|plans\/reviews\/<slug>|validate-review-data|remote-base|diffHash|planHash|assetHashes|release gate|gpt-5\./i);
});

test("Tailwind builderとprototype launcherはcanonical artifactを作成・配信する", async () => {
  const builderPath = ".agents/skills/plan/scripts/build-prototype-css.mjs";
  const revisionPath = ".agents/skills/plan/scripts/prototype-revision.mjs";
  await Promise.all([
    access(path.join(root, builderPath)),
    access(path.join(root, revisionPath)),
    access(path.join(root, "dev-prototype.sh")),
  ]);
  const [builder, revision, launcher] = await Promise.all([
    read(builderPath),
    read(revisionPath),
    read("dev-prototype.sh"),
  ]);
  assert.match(builder, /from "@tailwindcss\/postcss"/);
  assert.match(builder, /plans\/<slug>\/prototype/);
  assert.match(builder, /tailwind\.css/);
  assert.match(builder, /styles\.css/);
  assert.match(revision, /createHash\("sha256"\)/);
  assert.match(revision, /target must be exactly plans\/<slug>\/prototype/);
  assert.match(revision, /prototype contents must not contain symlinks/);
  assert.match(revision, /comparisonTargets/);
  assert.match(revision, /targetId/);
  assert.match(revision, /productionBaseline\.sources/);
  assert.match(revision, /productionBaseline\.commit must be a full lowercase 40-character Git commit SHA/);
  assert.match(revision, /stateAndInteraction must include keyboard and focus/);
  assert.match(revision, /sha256:/);
  assert.match(launcher, /plans\/\$\{slug\}\/prototype\/index\.html/);
  assert.match(launcher, /No prototype was found under plans\/<slug>\/prototype/);
  assert.match(launcher, /scripts\/serve-plan-artifact\.mjs/);
});

test("全skill metadataは明示呼び出し専用でdefault promptにskill名を含む", async () => {
  for (const name of ["plan", "plan-critic", "implement", "review", "git-commit-push-pr"]) {
    const yaml = await read(`.agents/skills/${name}/agents/openai.yaml`);
    assert.match(yaml, /allow_implicit_invocation: false/);
    assert.match(yaml, new RegExp(`default_prompt: "[^\\n]*\\$${name.replaceAll("-", "\\-")}`));
  }
});

test("独自skill・validator・専用agent・固定model・lifecycleは追加しない", async () => {
  const removed = [
    ".agents/skills/implementation-planner/SKILL.md",
    ".agents/skills/implementation-executor/SKILL.md",
    ".agents/skills/implementation-review/SKILL.md",
    ".agents/skills/final-plan-rewriter/SKILL.md",
    "scripts/validate-plan-file.mjs",
    "scripts/validate-review-data.mjs",
    ".codex/agents/plan_author.toml",
    ".codex/agents/plan_critic.toml",
    ".codex/agents/plan_rewriter.toml",
    ".codex/agents/blind_diff_reviewer.toml",
    ".codex/agents/plan_conformance_reviewer.toml",
    ".codex/agents/implementer.toml",
    ".codex/agents/mechanical_worker.toml",
    ".codex/agents/git_shipper.toml",
  ];
  for (const relative of removed) await assert.rejects(access(path.join(root, relative)), { code: "ENOENT" });

  const [planner, critic, executor, review, config, workflow] = await Promise.all([
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/plan-critic/SKILL.md"),
    read(".agents/skills/implement/SKILL.md"),
    read(".agents/skills/review/SKILL.md"),
    read(".codex/config.toml"),
    read("docs/development/codex-development-workflow.md"),
  ]);
  for (const skill of [planner, critic, executor, review]) {
    assert.doesNotMatch(skill, /implementation-(?:planner|executor|review)|final-plan-rewriter|validate-(?:plan-file|review-data)|G0[1-6]|gpt-5\./);
  }
  assert.match(planner, /Do not add global metadata, lifecycle status, task tables, lifecycle gates, progress logs, or draft\/final files/);
  assert.match(critic, /Do not add global metadata, lifecycle status, task tables, gates, progress logs, or separate draft\/final files/);
  assert.match(workflow, /独自runtime、専用agent、固定model routing、lifecycle state machineは作らない/);
  assert.doesNotMatch(config, /^\[agents\./m);
  const activeConfig = config.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  assert.doesNotMatch(activeConfig, /^\s*model(?:_reasoning_effort)?\s*=/m);
});

test(".gitignoreはtemplateを追跡可能にしplan生成物をignoreする", async () => {
  const gitignore = await read(".gitignore");
  assert.match(gitignore, /^\/plans\/\*\.md$/m);
  assert.match(gitignore, /^!\/plans\/template\.md$/m);
  assert.match(gitignore, /^\/plans\/\*\/$/m);
});

test("shippingはstaged diffを正本としplan lifecycleへ結合しない", async () => {
  const shipping = await read(".agents/skills/git-commit-push-pr/SKILL.md");
  assert.match(shipping, /Generate the commit message only from the staged diff/);
  assert.match(shipping, /validations actually executed/);
  assert.match(shipping, /never deletes it automatically/);
  assert.match(shipping, /cleanup is a separate user-authorized operation/);
  assert.doesNotMatch(shipping, /final\.md|G0[1-6]|validate-plan-file|validate-review-data|Plan-driven|plan-driven/);
});
