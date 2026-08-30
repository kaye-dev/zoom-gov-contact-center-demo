# Codex計画・実装・HTMLレビューワークフロー

## 目的

大きな変更を、goal、必要なUI prototype、production実装、独立reviewの順に進める。各skillは成果物を次工程へ渡す薄い役割とし、独自runtime、専用agent、固定model routing、lifecycle state machineは作らない。

本文は日常の判断と操作だけを示す。詳細契約は各`SKILL.md`と`.agents/skills/plan/references/`、HTML report仕様は`.agents/skills/review/references/review-contract.md`、dev server操作は`.claude/rules/dev-server.md`を正本とする。この責務分離は[OpenAIのskill設計ガイド](https://learn.chatgpt.com/docs/build-skills)に従う。

## 成果物

`plan/template.md`だけを追跡し、生成物はplan単位で同じdirectoryへ置く。

```text
plan/<slug>/
├── goal.md
├── prototype/  # UI変更時
├── evidence/   # UI変更の$implement時
└── review/     # $review時
```

生成directoryはGitへ追加しない。

## モデル選択

project-localの通常既定は`.codex/config.toml`の`gpt-5.6-terra`、reasoning `medium`とする。各skillの実行前に、品質と利用量のバランスに応じてCodexのcomposerで次のモデルとreasoningを手動選択する。

| skill | 推奨モデル | reasoning |
| --- | --- | --- |
| `$plan` | `gpt-5.6-sol` | `high` |
| `$plan-critic` | `gpt-5.6-terra` | `high` |
| `$implement` | `gpt-5.6-sol` | `high` |
| `$review` | `gpt-5.6-sol` | `high` |
| `$git-commit-push-pr` | `gpt-5.6-luna` | `medium` |
| `$workflow-retrospective` | `gpt-5.6-terra` | `high` |

`$plan-critic`と`$review`の履歴なしsubagentには、spawn時のmodelまたはreasoning overrideを渡さない。repository側にも`[agents]`やcustom agentを設けないため、subagentは呼び出し時に親taskで選択したmodelとreasoningを継承する。ユーザーまたは管理者の上位設定によるoverrideはrepositoryの管理対象外とする。

`xhigh`、`max`、`ultra`は通常既定にもskill別推奨にも使わない。推奨設定で品質不足が確認された場合だけ、対象taskで明示的に選択する。

skillメタデータではmodelを指定せず、`[agents]`、custom agent、project-local `profiles`による固定routingも追加しない。project-local `profiles`はこの手動切替の適用対象外とし、model切替はcomposerだけで行う。モデルの役割とreasoningは[OpenAIモデルガイド](https://developers.openai.com/api/docs/guides/latest-model)、通常既定の設定は[Codex Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、subagentの継承は[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)を根拠とする。

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
3. 自己完結した最終設計と`## 要件クロージャ`を`plan/<slug>/goal.md`へ書く。
4. UI変更時は完成UI、`ui-contract.json`、`parity-spec.json`を作る。
5. goalを監査し、UI変更時はCSS build、contract/profile validation、revision計算を終えてから、返却直前に影響scopeのsmokeを1回行う。
6. goal、prototype URL、revision、smoke結果、未確認事項を返す。

フィードバックでは同じplanを最終設計として更新する。Browserをauthoring中に使わず、静的作業が完了した返却直前に影響scopeのsmokeを1回だけ行う。全matrixや承認状態は作らない。

### `$plan-critic`

1. 対象のgoal、prototype、contract、profileを特定する。
2. freshな履歴なしsubagentで要件、設計、検証、UI parityを独立reviewする。
3. 採用済み要件とlive evidenceから一意に直せる欠陥だけを修正する。
4. goalを監査し、UI変更時はCSS build、contract/profile validation、revision再計算を終えてから、返却直前に影響scopeのsmokeを1回行う。
5. 更新path、revision、smoke結果、修正内容、残るriskを返す。

新しい製品判断または不足するlive evidenceが必要な場合だけユーザーへ確認する。全matrix、承認証跡、production変更は作らない。

### `$implement`

1. goal、prototype revision、validation profile digestを検証し、fresh runへ承認を記録する。
2. UI変更時はBrowserを開かず、HEAD、checkout mount、source、contract、matrix scopeを静的に検証する。
3. 影響target・state・viewportを特定し、`targeted`または`full`のmatrix scopeを固定する。
4. goalとUI契約に従って実装し、Browserを使わず対象testで確認する。
5. 変更riskに比例するtest、lint、typecheck、必要な場合だけbuild、diff checkを行う。
6. 完了候補ができた最後にruntimeと比較条件を確認し、選択rowのfinal parityを1回実行する。
7. schema version 3の最終証跡を書き、agent-ownedなbaseline差分だけをcleanupして結果を返す。

明示的な`$implement`実行自体を現在のgoal、revision、profile digestへの承認とする。「承認します」という別回答やrevision転記は不要である。静的gateの失敗はproduction差分0件のまま停止する。Browser unavailable、final parity失敗、drift、欠落rowは完了扱いにせず、実装差分と未確認条件を報告する。

`targeted`を既定とし、copy、局所的なcomponent挙動、accessibility、keyboard、focus、viewport固有の変更は影響rowだけを選ぶ。`full`はprototype・contract、global style・semantic token、共通shell layout・navigation構造、breakpointを横断するresponsive規則、複数の無関係target、または明示要求を変える場合だけ使う。共有componentであることやUI fileを編集したことだけを全matrixの理由にしない。

pre-editとaffectedのBrowser phaseは新規runで実行しない。同じBrowser assertionをparity、追加sweep、個別manual checkで重複確認しない。既存adapterがなければ完了直前に選択rowをCodexアプリ内Browserで直接確認し、feature実装中に大規模なadapterやruntime shimを新設・debugしない。Browser plumbingは初回と1回のretryで止める。

局所変更は対象testとlint、typecheck、diff checkを基本とする。全testは無関係suiteへ波及し得る場合または信頼できる対象testがない場合、production buildはroute、configuration、bundling、server boundaryを変える場合またはrepositoryの明示要件がある場合だけ行う。

### `$review`

1. exact diffと必要なcontextを固定し、UI影響と構造化証跡を監査する。
2. blind diff reviewとgoal適合reviewを独立した履歴なしsubagentで並行実行する。
3. `plan/<slug>/review/`へHTML reportを作り、desktopと390×844で確認する。

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
$plan plan/<slug>/goal.md
レビューHTMLで採用した指摘を同じplanへ反映してください。
<生成したMarkdown>

# $plan完了後
$implement plan/<slug>/goal.md
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

## 任意の振り返り

### `$workflow-retrospective`（別task推奨）

完了または意図的に中断したtaskを振り返る場合は、開発時間と振り返り時間を分離するため、新しいtaskから`$workflow-retrospective codex://threads/<thread-id>`を明示実行する。別taskから参照するsource taskが実行中なら監査しない。同じtaskで使う場合は開発完了後に限り、現在の振り返りturnを除いた完了済みturnだけを対象にする。

初回監査は追跡ファイルを変更せず、同じtaskの再監査で上書きする`plan/workflow-retrospectives/<thread-id>.md`だけを作る。現行contractで解消済みの問題を除外し、改善候補を最大3件へ優先順位付けする。候補IDをユーザーが明示選択した場合だけ、対象skill、本文書、共通runner、関連testの正確なallowlist内で改善する。P1とP2では必須工程、Browser実行、ユーザー確認、required command、skill instruction量を増やさない。

この操作を標準フローの末尾へ追加せず、`$plan`、`$implement`、`$review`から自動実行・自動提案・自動通知しない。一時reportは他のplan生成物と同様に`plan:cleanup`の対象になる。

## UI変更の共通契約

### Prototypeと比較条件

prototypeは完成UI契約であり、data、persistence、authorization、backend side effectだけをmockにできる。既存shell、component、Tailwind utility、semantic token、light/dark、responsive、interaction、DOM、accessibilityは本番相当にする。

```sh
node .agents/skills/plan/scripts/build-prototype-css.mjs plan/<slug>/prototype
node .agents/skills/plan/scripts/prototype-revision.mjs plan/<slug>/prototype
node .agents/skills/plan/scripts/parity-runner.mjs validate plan/<slug>/prototype
./dev-prototype.sh <slug>
```

`ui-contract.json` version 1には完全なproduction `sources` inventory、runtime owner、checkout、route、state、theme、responsive、interaction、安定したtargetとmatrix行を記録する。比較条件はviewport、DPR、locale、theme、fixture、authorization、queryと、両surfaceの`window.scrollX` / `window.scrollY`から実測したexact `scroll: {x, y}`を一致させる。

`parity-spec.json` version 1にはdeterministic setup、allowlist action、screenshot・DOM・accessibility・style・geometry・focus・console・network probeと全row mappingを記録する。schemaとBrowser adapterの正本は`.agents/skills/plan/references/parity-runner.md`とする。

plan中のsmokeは代表desktopと390×844を基本とし、theme/token/native controlはlight/dark、responsive/layoutは影響breakpoint、dialog/menu/keyboard/focusはinteraction probeを追加する。

### 承認と証跡

`$implement`はfreshな`plan/<slug>/evidence/<run-id>/`へ次を作る。

- `approval.json`: goal digest、prototype revision、profile digest
- `implementation-parity.json`: 完了候補の最後に選択rowで実行した結果

新規parity fileはfinal-onlyのschema version 3とし、`matrixScope`とtarget・state・viewport・riskのselectionを記録する。`full`ならmanifest全row、`targeted`ならselectionから再計算したexact rowだけを含める。既存のschema version 1と2はlegacyなpre-edit/final pairとしてread-only検証し、暗黙に書き換えない。executed rowは1回だけ記録し、statusは`pass`または`fail`とする。未実行はfile欠落で表し、巨大なpending一覧を作らない。scrollには`source: "window.scrollX/window.scrollY"`を残す。goal、prototype、contract/profile、source、fixture、authorization、query、route、Browser条件のdriftは承認または証跡を失効させる。

### Runtime所有権

1. port 3000と関連process、container、Compose、dependencyのbaselineとownerを記録する。
2. implementationと静的検証が終わるまでBrowserとprototype serverを起動しない。
3. buildが必要な場合だけidentityを再確認し、agent-owned runtimeだけを停止する。
4. 完了直前に実アプリとprototypeを正しいcheckout・条件で起動し、final parityを行う。
5. 最終確認後はbaselineとの差分だけをcleanupする。

記録にはPID、command、cwd、checkout mount、container ID、URL、fixture、authorizationを含める。新規routeやstale cacheでは、project・mount・`web` identityを再確認して`./dev-compose.sh restart web`だけを実行できる。他serviceやproject全体を停止しない。ユーザー所有dev serverはbuildのために停止せず、安全な隔離buildができなければblockedとする。広域な`docker compose down`や既存resourceの削除は行わない。

## Workflowの検証

通常のcontract testは`npm test`、認証済みCodex CLIでのforward evalは`npm run eval:plan-skills`を使う。forward evalはplan返却直前のsmoke、invocation承認、targeted/full selection、静的gate停止、final Browser unavailable、driftなどのnegative caseも検証する。

CLI evalはCodexアプリ内Browserを代替しない。runtime所有権、build、verified Compose `web` restart、live parity、cleanupの契約を変えた場合は、shipping前にCodex desktopで成功経路と停止経路をmanual確認する。

局所的な2ファイル変更の評価では、task固有adapter/shimを作らないこと、pre-editとaffectedのBrowser実行が0回、完了直前のtargeted finalが1回、追加sweepが0回、不要な全test・buildを実行しないことを確認する。phase別経過時間、shell command数、Browser操作数、full matrix回数も記録し、検証量が変更riskへ比例していることを評価する。

## 権限とcleanup

goalやskillは追加権限ではない。deploy、外部API書き込み、共有・本番DB変更、secret操作、削除、commit、push、PRには現在のユーザー依頼による権限が必要である。

`npm run plan:cleanup`は`plan/template.md`以外の削除候補をpreviewする。実際に削除する場合だけ、別の明示操作として`npm run plan:cleanup -- --apply`を使う。
