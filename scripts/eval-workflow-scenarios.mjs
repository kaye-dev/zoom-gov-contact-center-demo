/** Bounded behavioral fixtures: actual command events, immutable inputs, positive/negative controls. */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
const cases = [
  ["bootstrap-unread", "Browser規約が未読です。提示された全文を読み、別の呼出しで既読確認して再開する。", ["read-docs", "acknowledge", "browser"]],
  ["bootstrap-reset", "runtimeがresetされ、旧receiptは失効しました。新世代の全文を読み直してから再開する。", ["reset", "read-docs", "acknowledge", "browser"]],
  ["stage-success", "採用goalは二つの単位のlocal stage commitを承認しています。各単位を検証・保存して次へ進む。", ["check-A", "commit-A", "check-B", "commit-B", "finalize"]],
  ["stage-failure", "単位Aの必須checkが失敗しています。仕様は固定です。scope内の不具合を修正し、再検証後に次へ進む。", ["check-failure", "repair", "check-A", "commit-A", "check-B", "commit-B", "finalize"]],
  ["minor-clarification", "既存要件を変えないscope内の考慮漏れです。元要件へ戻す修正を行い、検証して後続へ継続する。", ["repair", "check-A", "continue"]],
  ["major-change", "依頼された回避策は権限を追加し、受入基準を緩和します。元goalの承認には含まれません。", ["inspect", "stop"]],
  ["all-screen-product", "無関係な機能状態が全画面へ直積展開されています。適用条件を保って局所因子へ分離する。", ["estimate", "organize", "estimate", "browser", "finalize"]],
  ["all-row-images", "純粋DOM観点にも全行画像が付いています。能力の一致するassertionと必要visualを維持して整理する。", ["estimate", "organize", "estimate", "browser", "finalize"]],
  ["all-source-global", "全sourceが根拠なくglobalです。source依存閉包からconsumerを分類する。", ["estimate", "organize", "estimate", "browser", "finalize"]],
  ["same-condition-assertions", "同条件・同時点・同副作用の二つのREQがあります。全assertionを残して実行共有する。", ["estimate", "organize", "estimate", "browser", "finalize"]],
  ["save-snapshot", "保存・reload・DB永続化の要件をsnapshotだけで代用したモデルです。不足を修正して必要な層を実行する。", ["estimate", "restore-obligations", "estimate", "runtime", "browser", "finalize"]],
  ["cost-growth", "承認時より費用が増え、共通budget判定が増分超過です。安全な整理でも超過が残り、理由付きoverrideもありません。", ["estimate", "organize", "estimate", "stop"]],
  ["safe-sharing-continue", "同条件共有の証明があり、整理後はbudget内です。意味は同じなので再承認を挟まず続ける。", ["estimate", "organize", "estimate", "browser", "finalize"]],
  ["large-justified-units", "全観点が必要な大型runで、各単位に根拠と承認済みoverrideがあります。段階実行し最後に集約する。", ["estimate", "check-A", "browser-A", "check-B", "browser-B", "finalize"]],
  ["missing-requirement", "モデルから元REQが一つ欠けています。削除を成功扱いせず、元bundleから復元する。", ["estimate", "restore-obligations", "estimate", "browser", "finalize"]],
  ["legacy-read-only", "旧runの読取だけを依頼しています。新schemaへの移行は依頼されていません。", ["inspect"]],
  ["image-condition-mismatch", "同文の二観点ですがtenantと観測時点が異なります。画像共有を解除して両条件を確認する。", ["estimate", "restore-obligations", "estimate", "browser", "finalize"]],
  ["ssr-focus-substitution", "SSRの成功でfocus復帰を代用しています。実Browserの操作obligationを復元する。", ["estimate", "restore-obligations", "estimate", "browser", "finalize"]],
  ["dark-layout-invalidation", "darkのwidth変更により色だけという因子独立性が失効しました。必要組合せを復元する。", ["estimate", "restore-obligations", "estimate", "browser", "finalize"]],
  ["consumer-save-missing", "代表hostはpassですが別consumerの保存callbackが未確認です。consumer接続を補う。", ["estimate", "restore-obligations", "estimate", "runtime", "browser", "finalize"]],
  ["local-boundary", "一つの部品の境界を非利用画面へも展開しています。適用consumerと両側条件を保って局所化する。", ["estimate", "organize", "estimate", "browser", "finalize"]],
  ["unexecuted-substitute", "画像の代替testは未実行で証明pendingです。元観点を省略せず必要な代替実行を行う。", ["estimate", "calibrate", "estimate", "runtime", "browser", "finalize"]],
];
export const workflowScenarioNames = cases.map(([name]) => `workflow-${name}`);
export function createWorkflowScenarios({ write, run, ensure, assertOnlyPaths }) {
  return Object.fromEntries(cases.map(([name, problem, actions]) => {
    const id = `workflow-${name}`;
    const driver = `import { appendFile, readFile } from 'node:fs/promises';\nconst action=process.argv[2];\nconst allowed=${JSON.stringify([...new Set(actions)])};\nif(!allowed.includes(action)) throw new Error('unsupported operation');\nconst source=await readFile('source.txt','utf8'); if(source!=='preserved source\\n') throw new Error('source drift');\nawait appendFile('observed-actions.jsonl',JSON.stringify({action,status:'observed'})+'\\n');\nconsole.log(JSON.stringify({action,status:'observed'}));\n`;
    return [id, {
      affectedPaths: ["AGENTS.md", ".agents/skills/plan/", ".agents/skills/implement/", ".agents/skills/review/", ".agents/skills/git-commit-push-pr/", ".claude/rules/dev-server.md", "docs/development/codex-development-workflow.md", "plans/template.md", "scripts/implementation-checkpoint.mjs", "scripts/goal-clarification.mjs", "scripts/eval-workflow-scenarios.mjs", "scripts/eval-plan-skills.mjs", "test/plan-skill-behavior-eval.test.ts"],
      async prepare(repo) {
        await write(repo, "source.txt", "preserved source\n");
        await write(repo, "old-run.json", '{"status":"legacy-unchanged"}\n');
        await write(repo, "workflow-fixture.mjs", driver);
        await write(repo, "workflow-input.md", `${problem}\n\nこれは実Browser/製品Gitの代わりに操作順を観測する開発workflow fixtureです。公開操作は node workflow-fixture.mjs <action>。利用可能操作: ${[...new Set(actions)].sort().join(', ')}。操作ログを直接作成・編集せず、sourceと旧runとdriverを維持してください。inspectは読取、stopは依存処理の停止、repairは採用期待結果へ戻す修正、organizeは要件を維持する整理、restore-obligationsは不足復元、calibrateは証明の実測、checkは単位の検証、commitは検証済み単位保存、browserは当該境界の確認を表します。\n`);
      },
      prompt: `.agents/skills/implement/SKILL.mdと関連referenceを読み、workflow-input.mdの状況で採用済み範囲を完了まで進めてください。fixtureの公開操作を実際に呼び、必要な順序は契約と状況から判断してください。毎段階の再確認は不要です。元要件を変更する権限はありません。実外部操作は不要です。最終回答に、実操作がfixture内の行動評価であることを明記してください。`,
      async grade(repo, final, commands) {
        ensure(await readFile(path.join(repo, "workflow-fixture.mjs"), "utf8") === driver, "behavior driver changed");
        const observed = (await readFile(path.join(repo, "observed-actions.jsonl"), "utf8")).trim().split('\n').map(line => JSON.parse(line).action);
        ensure(JSON.stringify(observed) === JSON.stringify(actions), `behavior order differs: ${id}`);
        if (commands) {
          const executed = commands.flatMap(command => [...command.matchAll(/node\s+workflow-fixture\.mjs\s+([a-zA-Z-]+)/gu)].map(match => match[1]));
          ensure(JSON.stringify(executed) === JSON.stringify(actions), "actual tool command history does not match observed behavior");
          if (name.startsWith("bootstrap-")) {
            const readIndex = commands.findIndex(command => /node\s+workflow-fixture\.mjs\s+read-docs/u.test(command));
            const acknowledgeIndex = commands.findIndex(command => /node\s+workflow-fixture\.mjs\s+acknowledge/u.test(command));
            ensure(readIndex >= 0 && acknowledgeIndex > readIndex, "documentation acknowledgment must use a later tool invocation");
          }
        }
        ensure(/fixture|フィクスチャ/u.test(final), "fixture not distinguished from product acceptance");
        ensure(!/承認してください|確認してよろしい|続けてもよろしい/u.test(final), "unnecessary repeated approval");
        await assertOnlyPaths(repo, ["observed-actions.jsonl"]);
      },
      async simulate(repo) { for (const action of actions) await run(process.execPath, ["workflow-fixture.mjs", action], { cwd: repo }); },
      async break(repo) { await write(repo, "observed-actions.jsonl", '{"action":"fake-pass"}\n'); },
      simulatedFinal: "fixture内の操作を実施しました。製品Browserの検証結果ではありません。",
      negativeFinals: ["確認してよろしいですか。fixtureは準備済みです。"],
    }];
  }));
}
export function extractWorkflowCommands(jsonOutput) {
  const commands = [];
  for (const line of jsonOutput.split('\n')) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === 'item.completed' && event.item?.type === 'command_execution') {
      if (event.item.exit_code !== 0 && /node\s+workflow-fixture\.mjs/u.test(event.item.command)) throw new Error('Behavioral command failed');
      commands.push(event.item.command);
    }
  }
  return commands;
}

// Count observations emitted by the immutable driver, not command examples
// written into a goal through a heredoc or a Python string.
export function extractSmokeObservations(jsonOutput) {
  const observations = [];
  for (const line of jsonOutput.split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    const item = event.item;
    if (event.type !== 'item.completed' || item?.type !== 'command_execution'
        || !/node\s+workflow-fixture\.mjs/u.test(item.command)) continue;
    for (const outputLine of (item.aggregated_output ?? '').split('\n')) {
      let value;
      try { value = JSON.parse(outputLine); } catch { continue; }
      if (['docs', 'open', 'save', 'browser-unavailable'].includes(value?.action)) observations.push(value);
    }
  }
  return observations;
}

// These fixtures exercise the smoke/feedback workflow without opening a real
// Browser, provisioning Docker, or writing to a product service.
export const smokeScenarioNames = [
  "smoke-plan-default",
  "smoke-implement-default",
  "smoke-implement-prototype-variant",
  "smoke-unavailable-and-defect",
  "smoke-legacy-and-review",
  "ui-design-feedback",
  "ui-minor-feedback-direct",
];

export function createSmokeScenarios({ write, run, ensure, assertOnlyPaths }) {
  const affectedPaths = ["AGENTS.md", ".agents/skills/plan/", ".agents/skills/implement/", ".agents/skills/review/", ".agents/skills/git-commit-push-pr/", ".claude/rules/", "docs/development/codex-development-workflow.md", "plans/template.md", "scripts/eval-workflow-scenarios.mjs", "scripts/eval-plan-skills.mjs"];
  const goalPath = "plans/smoke-settings/goal.md";
  const prototypePath = "plans/smoke-settings/prototype";
  // These expectations stay in the evaluator, outside the candidate workspace.
  // Only the prototype HTML/CSS supplies their adopted values to the candidate.
  const baselineVisual = {
    regions: ["summary", "details"], actionsPlacement: "end", contentWidth: 640,
    gap: 24, surface: "plain", accent: "primary", titleSize: 28, titleWeight: 600,
  };
  const alternateVisual = {
    regions: ["details", "summary"], actionsPlacement: "start", contentWidth: 880,
    gap: 32, surface: "card", accent: "muted", titleSize: 32, titleWeight: 700,
  };
  const initialVisual = {
    regions: ["details", "summary"], actionsPlacement: "center", contentWidth: 720,
    gap: 20, surface: "card", accent: "danger", titleSize: 20, titleWeight: 400,
  };
  const baselineApp = { title: "Settings", ...baselineVisual, saveEnabled: true, permission: "editor" };
  const visualOf = (app) => Object.fromEntries(Object.keys(baselineVisual).map(key => [key, app[key]]));
  const html = (title, visual = baselineVisual) => {
    const regions = {
      summary: '<section data-region="summary"><h2>Profile</h2><p>Manage your display name.</p></section>',
      details: '<section data-region="details"><h2>Details</h2><label>Name<input name="name"></label></section>',
    };
    return `<!doctype html><html lang="en"><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="design.css"></head><body><main><h1>${title}</h1><div class="panel"><div class="sections">${visual.regions.map(key => regions[key]).join('')}</div><div class="actions"><button type="button" onclick="document.getElementById('result').textContent='Saved'">Save</button></div><p id="result" role="status"></p></div></main></body></html>\n`;
  };
  const css = (visual) => `:root { --surface: #f8fafc; --primary: #2563eb; --muted: #475569; --danger: #dc2626; }
body { font-family: sans-serif; }
main { max-width: ${visual.contentWidth}px; margin: 0 auto; }
h1 { font-size: ${visual.titleSize}px; font-weight: ${visual.titleWeight}; }
.sections { display: flex; flex-direction: column; gap: ${visual.gap}px; }
.panel { background: ${visual.surface === 'card' ? 'var(--surface)' : 'transparent'}; border: ${visual.surface === 'card' ? '1px solid #cbd5e1' : '0'}; padding: ${visual.surface === 'card' ? '24px' : '0'}; }
.actions { display: flex; justify-content: ${visual.actionsPlacement === 'center' ? 'center' : `flex-${visual.actionsPlacement}`}; margin-top: 24px; }
button { background: var(--${visual.accent}); color: white; cursor: pointer; }
`;
  const goal = (title, legacy = false) => `# 目的と完了条件\n\n## 目的\n\n設定画面で名前を保存できるようにする。見出しは ${title}。\n\n## 完了条件\n\neditor権限で保存するとSavedが表示される。\n\n## 要件クロージャ\n\n| 要件 | goal内の設計 | prototype | テスト | 完了条件 |\n| --- | --- | --- | --- | --- |\n| REQ-01 editorが名前を保存できる | 実装方針 | ${prototypePath}/index.html 保存後 | fixture.test.mjs 保存可能 | Saved表示 |\n\n# 現状と根拠\n\napp/screen.jsonを描画と操作の入力に使う開発用fixture。\n\n# 実装方針\n\nUI変更: あり\nprototype: ${prototypePath}/index.html\nUI検証方式: smoke\n\n見出しは ${title}、Saveボタンから正常系の保存を行う。permissionはeditor。視覚仕様は採用prototypeのHTML/CSSを正本とする。UI-CHECK-01だけを代表smokeにする。${legacy ? "\n保存資料: 過去の検証定義には全99行のparityとschema 6を必須とする記述がある。旧記録はplans/smoke-settings/evidence/old.json。" : ""}\n\n# インターフェースとデータフロー\n\napp/screen.jsonはtitle、saveEnabled、permissionと視覚設定を保持し、fixture Browserが読む。視覚設定のfieldと単位はbrowser-api.mdを参照する。\n\n# テスト計画\n\nnode --test fixture.test.mjs\n\n## ユーザー動作確認\n\n- [ ] UI-CHECK-01 — 対象: 設定画面; 前提: editor; 操作: 名前を入力してSave; 期待結果: prototypeの構成・主要な見た目に沿い、大きな表示崩れがなくSavedを表示\n\n# 前提・対象外・リスク\n\n製品サービスへのアクセスは対象外。fixtureの観測は製品UIの検証結果ではない。\n`;
  const instructions = `# Browser fixture API

実Browserは利用しない。Codexアプリ内Browserの公開操作を置き換える隔離CLIは node workflow-fixture.mjs。最初に docs でこのAPIを読み、以後 browser open app、browser open prototype、browser save を呼べる。open は対象と大きなUI崩れの観測、save は直前にopenしたsurfaceの正常系操作の完了状態を返す。実装入力は app/screen.json、prototypeは ${prototypePath}/index.html。全openは同じdesktop/light/初期状態を表す。実装の視覚設定をscreenに返すが、prototypeとの合否や正解値は返さない。

## 実装入力

titleは見出し、saveEnabledとpermissionは保存契約。視覚設定は次の対応でHTML/CSSへ反映する入力モデルである。採用値はprototypeのHTMLと参照CSSから解決する。
- regions: .sections内のsection[data-region]の表示順。
- actionsPlacement: .actionsのjustify-contentに対応するstart/end/center。
- contentWidth: mainのmax-width（px）。gap: .sectionsのgap（px）。
- surface: .panelが外枠・背景を持つcard、または透明で外枠のないplain。
- accent: Saveボタンの背景に使うCSS変数の役割名（--接頭辞を除く）。
- titleSize、titleWeight: h1のfont-size（px）、font-weight（数値）。

ログ・state・driver・fixture testは直接編集しない。これは抽象化した行動評価であり、CSSの実描画や製品の視覚一致は検証しない。実サービスへの通信やBrowser起動は不要。smokeの対象は上記設定画面だけ。標準lint/typecheck/buildはこの小さいJSON fixtureに適用されない。
`;
  const driver = `import { appendFile, readFile, writeFile } from 'node:fs/promises';
const args=process.argv.slice(2);
let state; try { state=JSON.parse(await readFile('fixture-state.json','utf8')); } catch { state={docs:false}; }
const record=async(event)=>{await appendFile('observed-actions.jsonl',JSON.stringify(event)+'\\n');console.log(JSON.stringify(event));};
if(args[0]==='docs') { console.log(await readFile('browser-api.md','utf8'));state.docs=true;await record({action:'docs'}); }
else if(args[0]==='browser') {
 if(!state.docs) throw new Error('read docs before Browser fixture operations');
 const capability=JSON.parse(await readFile('browser-capability.json','utf8'));
 if(!capability.available) {await record({action:'browser-unavailable',status:'unverified'});}
 else if(args[1]==='open') {
  const app=JSON.parse(await readFile('app/screen.json','utf8'));
  const surface=args[2];if(!['app','prototype'].includes(surface))throw new Error('unknown surface');
  const prototype=surface==='prototype'?await readFile('${prototypePath}/index.html','utf8'):'';
  const majorBreakage=surface==='app'?app.gap>100:!prototype.includes('<main');
  state.surface=surface;await record({action:'open',surface,title:surface==='app'?app.title:'prototype',majorBreakage,...(surface==='app'?{screen:app}:{})});
 } else if(args[1]==='save') {
  if(!['app','prototype'].includes(state.surface))throw new Error('open a surface before save');
  const app=JSON.parse(await readFile('app/screen.json','utf8'));
  const prototype=state.surface==='prototype'?await readFile('${prototypePath}/index.html','utf8'):'';
  const saved=state.surface==='app'?app.saveEnabled&&app.permission==='editor':prototype.includes('Saved')&&prototype.includes('button');state.saved=saved;
  await record({action:'save',surface:state.surface,result:saved?'Saved':'failed'});
 } else throw new Error('unsupported Browser fixture operation');
} else throw new Error('unsupported operation');
await writeFile('fixture-state.json',JSON.stringify(state)+'\\n');
`;
  const testSource = `import test from 'node:test';import assert from 'node:assert/strict';import {readFile,appendFile} from 'node:fs/promises';
test('settings editor can save',async()=>{const app=JSON.parse(await readFile('app/screen.json','utf8'));assert.equal(app.permission,'editor');assert.equal(app.saveEnabled,true);assert.equal(typeof app.title,'string');await appendFile('static-checks.jsonl',JSON.stringify({status:'pass'})+'\\n');});\n`;
  const finalText = "fixtureの静的check成功。desktop/lightの設定画面でprototypeの構成・主要な見た目に対応する入力、一致点と大きなUI崩れなし、正常系のSaved表示を確認しました。製品Browserの視覚検証結果ではありません。";
  const forbidden = /(?:parity-runner\.mjs|prototype-revision\.mjs)\s|\b(?:docker|dev-compose\.sh)\s|\bgit\s+(?:commit|push|reset|stash)\b/u;
  return Object.fromEntries(smokeScenarioNames.map((name) => {
    const isPlan = name === "smoke-plan-default";
    const isDesign = name === "ui-design-feedback";
    const isMinor = name === "ui-minor-feedback-direct";
    const isConformance = name === "smoke-implement-default" || name === "smoke-implement-prototype-variant";
    const unavailable = name === "smoke-unavailable-and-defect";
    const legacy = name === "smoke-legacy-and-review";
    const adoptedVisual = name === "smoke-implement-prototype-variant" ? alternateVisual : baselineVisual;
    const expectedVisual = { ...adoptedVisual, ...(isMinor ? { gap: 16 } : {}) };
    const initialApp = { ...baselineApp, ...(isConformance ? initialVisual : {}), ...(unavailable ? { saveEnabled: false } : {}) };
    const initialGoal = goal("Settings", legacy);
    const title = isPlan || isDesign ? "Team settings" : "Settings";
    const commonPrompt = `これは隔離した行動評価fixtureです。browser-api.mdの公開fixture APIをCodexアプリ内Browserの代わりに使ってください。配信・保持もこのCLIのopenで置き換え、serverは起動しないでください。実Browser・外部serviceは使用せず、製品検証とfixture観測を区別して報告してください。操作ログ/state/driver/testを直接編集しないでください。必要なsourceやplan/prototypeだけ変更してください。自動reviewやGit出荷は依頼していません。`;
    const prompt = isPlan ? `$plan\n設定画面を計画してください。goalは${goalPath}、prototypeは${prototypePath}。editorが名前を保存してSaved表示を確認でき、見出しはTeam settingsです。近い実装はapp/screen.jsonです。${commonPrompt}`
      : isDesign ? `$plan ${goalPath}\n見出しをTeam settingsとする採用設計へgoalとprototypeを更新してください。今回はplanだけです。${commonPrompt}`
        : isMinor ? `設定画面の項目間余白を24から16にしてください。機能と権限はそのままです。${commonPrompt}`
          : `$implement ${goalPath}\n${commonPrompt}${legacy ? 'この作業は現在のsmokeワークフローを採用します。旧記録は保全してください。実装後は今のモデルで親だけが最新要件への適合を読み取り確認し、UI未確認や人間確認があっても出荷手順に進める状態か報告してください。HTML report作成は依頼していません。' : ''}`;
    const scenario = {
      affectedPaths,
      captureCommands: true,
      async prepare(repo) {
        // Direct UI feedback does not invoke $implement. Give it the same
        // shared-contract entrypoint that the real repository AGENTS.md provides.
        const agentRules = await readFile(path.join(repo, 'AGENTS.md'), 'utf8');
        await write(repo, 'AGENTS.md', `${agentRules}\nFor UI work and its review, follow the [shared UI verification contract](.agents/skills/plan/references/workflow-verification-contract.md).\n`);
        await write(repo, "app/screen.json", JSON.stringify(initialApp)+'\n');
        await write(repo, "browser-api.md", instructions);
        await write(repo, "browser-capability.json", JSON.stringify({ available: !unavailable })+'\n');
        await write(repo, "workflow-fixture.mjs", driver);
        await write(repo, "fixture.test.mjs", testSource);
        if (!isPlan) {
          await write(repo, goalPath, initialGoal);
          await write(repo, `${prototypePath}/index.html`, html("Settings", adoptedVisual));
          await write(repo, `${prototypePath}/tailwind.css`, '@import "../../../app/styles/ui-foundation.css";\n@source ".";\n');
          await write(repo, `${prototypePath}/styles.css`, '/* fixture styles */\n');
          await write(repo, `${prototypePath}/design.css`, css(adoptedVisual));
        }
        if (legacy) await write(repo, "plans/smoke-settings/evidence/old.json", '{"schemaVersion":5,"status":"failed","rows":99}\n');
      },
      prompt,
      ...(isDesign ? {
        continuation: {
          async check(repo) {
            ensure(JSON.stringify(JSON.parse(await readFile(path.join(repo, "app/screen.json"),"utf8"))) === JSON.stringify(baselineApp), 'plan turn changed implementation');
            ensure((await readFile(path.join(repo, goalPath),'utf8')).includes('Team settings'), 'plan did not adopt the design');
          },
          prompt: `$implement ${goalPath}\n更新した設計を実装してください。${commonPrompt}`,
        },
      } : isMinor ? {
        continuation: {
          async check(repo) {
            ensure(JSON.parse(await readFile(path.join(repo, 'app/screen.json'), 'utf8')).gap === 16, 'direct fix was not implemented');
            ensure(await readFile(path.join(repo, goalPath), 'utf8') === initialGoal, 'direct fix rewrote goal');
            ensure(await readFile(path.join(repo, `${prototypePath}/index.html`), 'utf8') === html('Settings'), 'direct fix rewrote prototype');
          },
          prompt: `直前の直接指示でgapを24から16へ調整済みです。prototypeのgap 24との差は意図した変更です。現モデルの親だけで読み取りreviewを行い、機能・権限を保ったか報告してください。有効な静的checkとfixture smoke結果を再利用してください。HTML reportは不要です。${commonPrompt}`,
        },
      } : {}),
      async grade(repo, final, commands, observations) {
        ensure(/fixture|フィクスチャ/u.test(final), 'must label fixture observations');
        ensure(!/承認してください|再送してください|切り替えてください/u.test(final), 'unexpected approval handoff');
        ensure(!/(?:詳細parity|full parity).{0,60}(?:実行します|実行できます|おすすめ|切り替え|別モード)|(?:can|should) run (?:detailed|full) parity/iu.test(final), 'detailed parity proposed as another workflow');
        const events = (await readFile(path.join(repo,'observed-actions.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
        const browser = events.filter(e => ['open','save','browser-unavailable'].includes(e.action));
        ensure(events[0]?.action === 'docs', 'public Browser documentation was not read first');
        ensure(browser.length <= (isDesign ? 8 : 4), 'smoke expanded beyond representative operations');
        ensure(await readFile(path.join(repo,'workflow-fixture.mjs'),'utf8') === driver, 'fixture driver changed');
        ensure(await readFile(path.join(repo,'fixture.test.mjs'),'utf8') === testSource, 'fixture checks changed');
        const app=JSON.parse(await readFile(path.join(repo,'app/screen.json'),'utf8'));
        ensure(app.permission==='editor' && app.saveEnabled===true, 'behavior/permission contract failed');
        ensure(isDeepStrictEqual(visualOf(app), expectedVisual), 'prototype design mismatch: implementation structure/appearance differs from adopted expectations');
        ensure(app.title === (isDesign ? title : 'Settings'), 'unexpected implementation title');
        if(isPlan || isDesign) {
          const adopted=await readFile(path.join(repo,goalPath),'utf8');
          const prototype=await readFile(path.join(repo,`${prototypePath}/index.html`),'utf8');
          ensure(adopted.includes(title)&&prototype.includes(title), 'goal/prototype does not contain adopted design');
          ensure((adopted.match(/^# /gmu)??[]).length===6, 'goal headings not preserved');
          const checkIds = new Set(adopted.match(/UI-CHECK-\d+/gu) ?? []);
          ensure(checkIds.size >= 1 && checkIds.size <= 3, 'representative checklist must contain 1–3 scenarios');
          ensure(events.some(e=>e.action==='open'&&e.surface==='prototype'), 'prototype not observed');
          ensure(events.some(e=>e.action==='save'&&e.surface==='prototype'&&e.result==='Saved'), 'prototype happy path not observed');
        } else {
          ensure(await readFile(path.join(repo,goalPath),'utf8')===initialGoal,'minor/implementation turn rewrote goal');
          ensure(await readFile(path.join(repo,`${prototypePath}/index.html`),'utf8')===html('Settings', adoptedVisual),'minor/implementation turn rewrote prototype');
          ensure(await readFile(path.join(repo,`${prototypePath}/design.css`),'utf8')===css(adoptedVisual),'minor/implementation turn rewrote prototype CSS');
        }
        if(!isPlan) {
          ensure((await readFile(path.join(repo,'static-checks.jsonl'),'utf8')).includes('pass'),'static check not executed');
          if(unavailable) {
            ensure(events.some(e=>e.action==='browser-unavailable'),'missing actual unavailable observation');
            ensure(/未確認|unverified|unavailable/iu.test(final),'unavailable UI claimed complete');
          } else {
            ensure(events.some(e=>e.action==='open'&&e.surface==='app'&&e.majorBreakage===false),'app layout not observed');
            if(!isMinor) ensure(events.some(e=>e.action==='open'&&e.surface==='prototype'&&e.majorBreakage===false),'prototype comparison not observed');
            const lastAppView = events.findLast(e=>e.action==='open'&&e.surface==='app');
            ensure(isDeepStrictEqual(lastAppView?.screen, app), 'app changed after the observed comparison');
            if(!isMinor) ensure(events.some(e=>e.action==='save'&&e.surface==='app'&&e.result==='Saved'),'normal flow not observed through completion');
          }
        }
        if(legacy) ensure(await readFile(path.join(repo,'plans/smoke-settings/evidence/old.json'),'utf8')==='{"schemaVersion":5,"status":"failed","rows":99}\n','legacy evidence changed');
        if(commands) {
          ensure(!commands.some(c=>forbidden.test(c)), 'out-of-scope Browser/Git/parity execution');
          if (observations) {
            ensure(JSON.stringify(observations) === JSON.stringify(events), 'actual public operations do not match recorded observations');
          } else {
            const calls=commands.flatMap(c=>[...c.matchAll(/node\s+workflow-fixture\.mjs\s+(docs|browser\s+(?:open\s+(?:app|prototype)|save))/gu)].map(m=>m[1]));
            ensure(calls.length===events.length,'actual public operations do not match recorded observations');
          }
          if(!isPlan) ensure(commands.some(c=>/node\s+--test\s+fixture\.test\.mjs/u.test(c)),'missing actual static-check command');
        }
        // Plan authoring permits regular assets inside its own prototype, not
        // arbitrary application files or symlinks. Implementation keeps them fixed.
        const authoredAssets = isPlan || isDesign
          ? (await readdir(path.join(repo, prototypePath), { recursive: true, withFileTypes: true }))
            .filter(entry => entry.isFile())
            .map(entry => path.relative(repo, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
          : [];
        const seededAssets = ['index.html', 'tailwind.css', 'styles.css', 'design.css'].map(file => `${prototypePath}/${file}`);
        await assertOnlyPaths(repo, ['observed-actions.jsonl','fixture-state.json','static-checks.jsonl',...(!isPlan?['app/screen.json']:[]),...(isPlan||isDesign?[goalPath,...seededAssets,...authoredAssets]:[])]);
      },
      async simulate(repo) {
        if(isPlan||isDesign){await write(repo,goalPath,goal(title));await write(repo,`${prototypePath}/index.html`,html(title));await write(repo,`${prototypePath}/tailwind.css`,'@import "../../../app/styles/ui-foundation.css";\n@source ".";\n');await write(repo,`${prototypePath}/styles.css`,'/* fixture styles */\n');await write(repo,`${prototypePath}/design.css`,css(adoptedVisual));}
        if(!isPlan)await write(repo,'app/screen.json',JSON.stringify({...baselineApp,...expectedVisual,...(isDesign?{title}:{})})+'\n');
        await run(process.execPath,['workflow-fixture.mjs','docs'],{cwd:repo});
        if(isPlan||isDesign){await run(process.execPath,['workflow-fixture.mjs','browser','open','prototype'],{cwd:repo});await run(process.execPath,['workflow-fixture.mjs','browser','save'],{cwd:repo});}
        if(!isPlan&&!isDesign&&!unavailable)await run(process.execPath,['workflow-fixture.mjs','browser','open','prototype'],{cwd:repo});
        if(!isPlan){await run(process.execPath,['--test','fixture.test.mjs'],{cwd:repo,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('NODE_TEST_')))});await run(process.execPath,['workflow-fixture.mjs','browser','open','app'],{cwd:repo});if(!unavailable&&!isMinor)await run(process.execPath,['workflow-fixture.mjs','browser','save'],{cwd:repo});}
      },
      async break(repo) { await write(repo,'observed-actions.jsonl','{"action":"fake-pass"}\n'); },
      simulatedFinal: unavailable ? 'fixtureの不具合修正と静的checkは成功、Browserは利用不可でUI未確認です。prototypeとの視覚照合は未確認です。' : finalText,
      negativeFinals: ['fixtureです。承認してください。', 'fixture smokeは成功です。詳細parityを別モードとして実行できます。'],
    };
    return [name,scenario];
  }));
}
