# Codex計画・実装・HTMLレビューワークフロー

## 目的

大きな変更を、goal、必要なUI prototype、production実装、独立reviewの順に進める。各skillは成果物を次工程へ渡す薄い役割とし、独自runtime、専用agent、固定model routing、lifecycle state machineは作らない。

本文は日常の判断と操作だけを示す。詳細契約は各`SKILL.md`と`.agents/skills/plan/references/`、HTML report仕様は`.agents/skills/review/references/review-contract.md`、dev server操作は`.claude/rules/dev-server.md`を正本とする。この責務分離は[OpenAIのskill設計ガイド](https://learn.chatgpt.com/docs/build-skills)に従う。

## 成果物

`plans/template.md`だけを追跡し、生成物はplan単位で同じdirectoryへ置く。

```text
plans/<slug>/
├── goal.md
├── prototype/  # UI変更時
├── evidence/   # UI変更の$implement時
└── review/     # $review時
```

生成directoryはGitへ追加しない。`plans/tmp/<slug>/prototype/`は閲覧とCSS buildだけに使える後方互換pathであり、parity、承認、実装、reviewの前にcanonical directoryへ移行する。

## 標準フロー

基本は次の順で進める。

1. `$plan`: goalと必要なUI prototypeを作る。
2. `$plan-critic`（任意）: goalとprototypeを独立reviewする。
3. `$implement`: 現在のgoalとprototypeを承認して実装・検証する。
4. `$review`（必要な場合）: diffとgoalへの適合性をreviewする。
5. `$git-commit-push-pr`（明示依頼時）: commit、push、PRを行う。

plan成果物のcleanupは、この流れとは別の明示操作として行う。

### `$plan`

1. 最新要求、確定済み判断、採用済み資料を整理する。
2. repository、runtime、code、testを確認し、UI変更時はclosest live UIも確認する。
3. 自己完結した最終設計と`## 要件クロージャ`を`plans/<slug>/goal.md`へ書く。
4. UI変更時は完成UI、`ui-contract.json`、`parity-spec.json`を作る。
5. goalを監査し、UI変更時はCSS build、contract/profile validation、revision計算、影響scopeのsmokeを行う。
6. goal、prototype URL、revision、smoke結果、未確認事項を返す。

フィードバックでは同じplanを最終設計として更新する。plan中は影響scopeのsmokeだけを再実行し、全matrixや承認状態は作らない。

### `$plan-critic`

1. 対象のgoal、prototype、contract、profileを特定する。
2. freshな履歴なしsubagentで要件、設計、検証、UI parityを独立reviewする。
3. 採用済み要件とlive evidenceから一意に直せる欠陥だけを修正する。
4. goalを監査し、UI変更時はCSS build、contract/profile validation、revision再計算、影響scopeのsmokeを行う。
5. 更新path、revision、smoke結果、修正内容、残るriskを返す。

新しい製品判断または不足するlive evidenceが必要な場合だけユーザーへ確認する。全matrix、承認証跡、production変更は作らない。

### `$implement`

1. goal、prototype revision、validation profile digestを検証し、fresh runへ承認を記録する。
2. UI変更時はruntime、process、container、checkout mount、source、比較条件のbaselineを記録する。
3. production編集直前に全rowのpre-edit parityを1回実行する。
4. goalとUI契約に従って実装し、変更中はaffected rowだけを確認する。
5. 対象scopeのtest、lint、typecheck、build、diff checkを行う。
6. 最後の関連変更後に全rowのfinal parityを1回実行し、最終証跡を書く。
7. agent-ownedなbaseline差分だけをcleanupし、変更と検証結果を返す。

明示的な`$implement`実行自体を現在のgoal、revision、profile digestへの承認とする。「承認します」という別回答やrevision転記は不要である。pre-editの失敗、drift、欠落rowはproduction差分0件のまま停止し、関連変更後の最終証跡は作り直す。

### `$review`

1. exact diffと必要なcontextを固定し、UI影響と構造化証跡を監査する。
2. blind diff reviewとgoal適合reviewを独立した履歴なしsubagentで並行実行する。
3. `plans/<slug>/review/`へHTML reportを作り、desktopと390×844で確認する。

HTML reportは実装を変更せず、`採用 / 却下 / 未確定`、comment、Markdown生成、copyを提供する。

#### レビュー後のフィードバック対応

1. 各指摘の判断とcommentを確定し、Markdownをcopyする。
2. goal、完成UI、interaction、contract、profileを変える場合は同じgoalへ`$plan`する。
3. 必要なら`$plan-critic`する。
4. 採用指摘がある場合は最新goalへ`$implement`する。
5. 必要なら再度`$review`する。
6. 出荷する場合だけ`$git-commit-push-pr`する。

現行goalへの実装逸脱、test不足、証跡不備だけなら2と3を省略する。focus trap、Tab循環、背景の`inert`化などUI契約を変える指摘は`$plan`後の別メッセージで`$implement`する。

```text
$plan plans/<slug>/goal.md
レビューHTMLで採用した指摘を同じplanへ反映してください。
<生成したMarkdown>

# $plan完了後
$implement plans/<slug>/goal.md
```

### `$git-commit-push-pr`

1. Git規約、状態、remote、GitHub認証、repository対応を確認してfetchする。
2. baseとtopic branchを解決し、protected branch上ならtopic branchを作る。
3. 未commit変更があればcurrent taskのpathだけをstageし、検証後に1件のcommitを作る。
4. 最新baseへ安全に同期する。
5. historyを書き換えずにpushし、localとremoteのSHA一致を確認する。
6. 同じheadのPRを作成するか、必要な箇所だけを更新する。
7. PRのbase/head OID、draft、mergeability、merge stateをreadbackして報告する。

現在のユーザーが明示した場合だけ実行する。force push、stash、変更破棄、広域stage、自動競合解決、PR merge、CI待機は行わない。競合、remote divergence、複数PR、認証・repository不一致は停止条件とし、plan/review生成物は明示scope外ならstageも削除もしない。

## UI変更の共通契約

### Prototypeと比較条件

prototypeは完成UI契約であり、data、persistence、authorization、backend side effectだけをmockにできる。既存shell、component、Tailwind utility、semantic token、light/dark、responsive、interaction、DOM、accessibilityは本番相当にする。

```sh
node .agents/skills/plan/scripts/build-prototype-css.mjs plans/<slug>/prototype
node .agents/skills/plan/scripts/prototype-revision.mjs plans/<slug>/prototype
node .agents/skills/plan/scripts/parity-runner.mjs validate plans/<slug>/prototype
./dev-prototype.sh <slug>
```

`ui-contract.json` version 1には完全なproduction `sources` inventory、runtime owner、checkout、route、state、theme、responsive、interaction、安定したtargetとmatrix行を記録する。比較条件はviewport、DPR、locale、theme、fixture、authorization、queryと、両surfaceの`window.scrollX` / `window.scrollY`から実測したexact `scroll: {x, y}`を一致させる。

`parity-spec.json` version 1にはdeterministic setup、allowlist action、screenshot・DOM・accessibility・style・geometry・focus・console・network probeと全row mappingを記録する。schemaとBrowser adapterの正本は`.agents/skills/plan/references/parity-runner.md`とする。

plan中のsmokeは代表desktopと390×844を基本とし、theme/token/native controlはlight/dark、responsive/layoutは影響breakpoint、dialog/menu/keyboard/focusはinteraction probeを追加する。

### 承認と証跡

`$implement`はfreshな`plans/<slug>/evidence/<run-id>/`へ次を作る。

- `approval.json`: goal digest、prototype revision、profile digest
- `pre-edit-parity.json`: production編集直前の全row結果
- `implementation-parity.json`: 最後の関連変更後の全row結果

executed rowは1回だけ記録し、statusは`pass`または`fail`とする。未実行はfile欠落で表し、巨大なpending一覧を作らない。scrollには`source: "window.scrollX/window.scrollY"`を残す。goal、prototype、contract/profile、source、fixture、authorization、query、route、Browser条件のdriftは承認または証跡を失効させる。

### Runtime所有権

1. port 3000と関連process、container、Compose、dependencyのbaselineとownerを記録する。
2. 実アプリ`http://localhost:3000`とprototypeを正しいcheckout・条件でpreflightする。
3. build前はidentityを再確認し、agent-owned runtimeだけを停止する。
4. build後はruntime identityを再確認し、同じprototype processでfinal parityを行う。
5. 最終確認後はbaselineとの差分だけをcleanupする。

記録にはPID、command、cwd、checkout mount、container ID、URL、fixture、authorizationを含める。新規routeやstale cacheでは、project・mount・`web` identityを再確認して`./dev-compose.sh restart web`だけを実行できる。他serviceやproject全体を停止しない。ユーザー所有dev serverはbuildのために停止せず、安全な隔離buildができなければblockedとする。広域な`docker compose down`や既存resourceの削除は行わない。

## Workflowの検証

通常のcontract testは`npm test`、認証済みCodex CLIでのforward evalは`npm run eval:plan-skills`を使う。forward evalはplanの反復、invocation承認、pre-edit停止、drift、Browser unavailableなどのnegative caseも検証する。

CLI evalはCodexアプリ内Browserを代替しない。runtime所有権、build、verified Compose `web` restart、live parity、cleanupの契約を変えた場合は、shipping前にCodex desktopで成功経路と停止経路をmanual確認する。

## 権限とcleanup

goalやskillは追加権限ではない。deploy、外部API書き込み、共有・本番DB変更、secret操作、削除、commit、push、PRには現在のユーザー依頼による権限が必要である。

`npm run plans:cleanup`は`plans/template.md`以外の削除候補をpreviewする。実際に削除する場合だけ、別の明示操作として`npm run plans:cleanup -- --apply`を使う。
