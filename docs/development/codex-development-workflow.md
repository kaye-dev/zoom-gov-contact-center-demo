# Codex計画・実装・HTMLレビューワークフロー

## 目的

設計を定める`$plan`、実装と検証を行う`$implement`、明示依頼でcommit・push・PRを完了する`$git-commit-push-pr`を基本とする。`$review`は任意である。実装の判断はgoal、prototypeとユーザーの最新の修正指示に基づく。custom agentは、壁打ち、広範な読み取り探索、独立reviewという限定されたread-onlyロールだけに使う。

UIはCodexアプリ内Browserでprototypeの構成・主要な見た目との照合、大きなUI崩れと主要な正常系操作を確認する。詳細parityは開発手順、完了条件、別モードやrelease/CI/定期への案内に含めない。スキル本文と必要な用途別参照に責務を分ける構成は[OpenAIのskill設計ガイド](https://learn.chatgpt.com/docs/build-skills)を参考とする。

## 成果物

`plans/template.md`だけをGitで追跡する。生成資料はGitからignoreせず、複数planを同じcheckoutへ保全できる。

```text
plans/<slug>/
├── goal.md
├── prototype/  # UI変更時
└── review/     # 明示review時
```

goalとprototypeは設計を示し、進捗・検証結果は実装報告へ記載する。既存のevidenceやarchiveは内容を保持する。生成directoryの存在や別plan・補助fixtureは出荷を妨げず、stage対象から除外する。`npm run plans:guard`はindexに`plans/template.md`以外の計画資料が含まれないことを検査する。

## モデル選択

親エージェントのproject-local既定は`gpt-6-astra / low`とし、`.codex/config.toml`で管理する。通常処理と各skillの親エージェントは、Codexのcomposerでユーザーが選択したモデルとreasoningを維持する。品質と利用量のバランスを考える際は、次の組み合わせを参考に手動選択する。

| skill | 推奨モデル | reasoning |
| --- | --- | --- |
| `$plan` | `gpt-5.6-sol` | `high` |
| `$implement` | `gpt-5.6-sol` | `high` |
| `$review` | `gpt-6-astra` | `low` |
| `$git-commit-push-pr` | `gpt-5.6-luna` | `medium` |
| `$workflow-retrospective` | `gpt-5.6-terra` | `high` |
| `$workflow-performance-audit` | `gpt-5.6-terra` | `high` |

read-only custom agentのモデルはスキルメタデータではなく、`.codex/config.toml`の登録と`.codex/agents/*.toml`で固定する。

| 呼び出し元 | custom agent | 固定モデル | reasoning | 起動条件とfallback |
| --- | --- | --- | --- | --- |
| `$kabeuchi` | `product_advisor` | `gpt-5.6-terra` | `medium` | 通常は親が回答し、独立判断が必要な場合のみ1体起動する。独立ルートが利用不能なら独立助言は未実施として停止する |
| `$plan` | `project_explorer` | `gpt-5.6-luna` | `medium` | 通常は親が探索し、分離が必要な複数subsystem・大量資料のread-only探索のみ最大1体起動する。利用不能なら親が継続して未使用を報告する |
| `$review` | `independent_reviewer` | `gpt-5.6-terra` | `high` | 通常は親が2観点を確認し、独立判断が必要な場合のみ2体を並行起動する。片方でも利用不能なら停止する |

サブエージェントは原則使用せず、必要性の判断と待機方法はAGENTS.mdに従う。これらのcustom agentはすべて`read-only`とし、spawn時のmodelまたはreasoning overrideを渡さない。`$implement`、`$git-commit-push-pr`、`$workflow-retrospective`、`$workflow-performance-audit`はsubagentへ委譲せず、親エージェントが単独で実行する。全体のsubagent既定モデル、既定reasoning、同時実行数制限はproject-local設定へ追加しない。上表以外の一般subagentは、Codexの通常動作として親taskで選択した設定を継承する。ユーザーまたは管理者の上位設定によるoverrideはrepositoryの管理対象外とする。

`xhigh`、`max`、`ultra`は親エージェントのskill別推奨にもcustom agentの固定設定にも使わない。推奨設定で品質不足が確認された場合だけ、対象taskの親エージェントで明示的に選択する。

skillメタデータとproject-local `profiles`ではmodelを指定しない。親エージェントのmodel切替はcomposerだけで行い、custom agentの固定routingだけを`.codex/agents/*.toml`で管理する。モデルの役割とreasoningは[OpenAIモデルガイド](https://developers.openai.com/api/docs/guides/latest-model)、設定項目は[Codex Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、custom agentとsubagentの継承は[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)を根拠とする。

### レビュー前のモデル切替

独立レビューへ移る直前に、現在ターンの実行モデル・reasoningを確認する。試行する親モデルは `gpt-6-astra / low`。一致していれば続行し、不一致または確認不能ならターンを終了して、切替先とコピー可能な継続プロンプトを返す。ユーザーがcomposerで切り替え、同じタスクへプロンプトを送ってからレビューを始める。設定ファイルの既定値や過去ターンだけで現在モデルを断定しない。

`$implement`の対象静的checkと代表smoke・cleanup（またはBrowser利用不可の報告）を完了してから引き渡す。`$review`自体は明示依頼時のみ実行する。必要時のみ起動する独立レビュー担当の `terra/high` は維持する。モデル切替のために検証を省略せず、config変更や新規タスク作成もしない。モデルが確認不能でもユーザーが切替済みと明言すれば、ユーザー申告として続行し、確認待ちを反復しない。

停止時は現在モデルの根拠、切替先、対象goal/差分/証跡、完了済み検証、未実施レビュー、現在タスクのディープリンクを継続プロンプトへ含める。リンクを取得できない場合のみ入力欄を用意する。詳細とテンプレートは[レビューのモデル引継ぎ](../../.agents/skills/review/references/model-handoff.md)を正本とする。

## 通常作業の時間を増やさない運用

共通hostは一度整備し、各planのinstallやNext.js設定作成、毎回のbuild、承認、比較専用フェーズを増やさない。対象typecheck/lint→起動→代表smokeの流れを維持し、CSSはNext.jsが生成する。編集中はHMR、保持・再利用では同じprocess/cacheを使う。reviewと出荷は有効な結果を再利用する。非UIや直接の軽微UI修正にprototypeを要求しない。初期整備費と通常作業の時間を分け、実測前にUI差分ゼロ・総時間短縮を断定しない。毎案件の性能レポートや計測を必須にしない。

## 任意の壁打ち

`$kabeuchi`は標準の実装フローとは独立した、明示呼び出し専用のread-only相談である。現在の相談、確定済み判断、必要最小限のrepository evidenceだけをfreshな`product_advisor`へ渡す。親エージェントは助言を証拠と照合し、推奨案、トレードオフ、未確認事項、次に決めることを統合して返す。

壁打ちではファイル編集、plan作成、実装、Git操作、外部変更を行わない。変更が必要なら、相談を終えた後に対応するskillを別途明示実行する。

## 標準フロー

1. `$plan`: 自己完結したgoalと必要なUI prototypeを作る。
2. `$implement`: 採用設計を実装し、対象静的checkと短いUI smokeを行う。
3. `$review`（必要時）: 対象diff、採用要件、最新指示、検証結果を評価する。
4. `$git-commit-push-pr`（明示依頼時）: 1回の依頼で対象commit・non-force push・PR作成または最小更新とreadbackを完了する。

### `$plan`

最新要求、採用済み判断と資料、repositoryの関連source/testsを整理する。`plans/template.md`の6見出しに沿い、`plans/<slug>/goal.md`へ現在の最終設計だけを書く。`## 要件クロージャ`の各行は5列で具体的要件、設計先、prototypeまたは非UI理由、検証case、観測できる完了結果を持つ。

新規UIは共通Next.js・TypeScript・Tailwind環境で、既存のshell・共通component・semantic tokenを使う。表示部品をimportし、mockはdata、永続化、authorization、backend副作用だけとする。新規TSXの移植先、props/callbackと代表データをgoalのインターフェース節に記す。対象の型・lintを確認してから保持コマンドを完了させ、その終了後に別呼出しでstatusを1回確認する。同じ保持URLと必要なqueryで返却直前に代表smokeを1回行う。

```sh
node scripts/prototype-runtime.mjs check <slug>
./dev-prototype.sh --retain <slug>
# 上のコマンド終了後、別呼出しで実行
./dev-confirmation.sh status <slug>
```

詳細な作成例は[prototype authoring](../../.agents/skills/plan/references/ui-prototype-quality.md)を使う。共通hostが初回に既存ソースを`prototype/.shared/`へ保存し、以後の実装変更から比較元を保つ。旧HTML prototypeは従来のCSS builderと配信を継続でき、変換は不要。

pathと実際の内容で採用prototypeを特定し、live URL、PID、owner、smoke結果、未確認事項、`./dev-confirmation.sh stop <slug>`を返す。返却には実checkoutからの再確認手順（`cd <current-checkout> && ./dev-prototype.sh <slug>`、実アプリでは`cd <current-checkout> && ./dev-compose.sh ensure`）も含める。非UIはprototypeや確認sessionを作らず、`UI変更: なし`、`prototype: なし`、`UI検証方式: 対象外`を記す。

#### プランの再整理

同じ`plans/<slug>/goal.md`を最終仕様として整理する依頼例:

```text
最終設計を、最初からこの結論を採用していたものとして全面的に書き直してください。

読者はこの会話の経緯を一切知らない新規参加者とする。経緯を知らないと意味が通じない文は残さないこと。

過去案、却下理由、変更履歴、以前の設計との比較として書かれた「◯◯はやらない」は削除してください。
ただし、現在の仕様として必要な制約、安全境界、対象外、互換性、移行・ロールバック条件は残してください。
```

編集上の再整理では別skill、custom agent、追加のBrowser確認は起動しない。設計変更でprototypeも改める場合は、静的作業後に影響する代表smokeを行う。

### `$implement`

採用TSXは本番のcomponent pathへ引き継ぎ、import調整と実data/permission/action adapterの接続を行う。JSXやTailwindクラスを移植のために書き直さず、fixtureやprototype runtimeを本番からimportしない。保存元の`.shared`は更新しない。同じ代表データ・権限・状態・viewport/themeで既存のsmoke内に照合を含める。

明示呼出しで選択goalとprototypeを承認し、未解決の製品仕様がなければ実装を進める。実装中はfocused check、完成時は対象test、適用lint/typecheck、diff checkを行う。full testは具体的なcross-suite影響、buildはroute/configuration/bundling/server boundary等に理由がある場合に行う。

採用prototypeのTSX・fixture/config・関連shared source・CSS/参照資産（既存HTMLも可）を実装前に読み、goalに省略された視覚仕様も引き継ぐ。最新の直接修正指示を対象箇所へ優先し、実装の差を正当化するためにprototypeを書き換えない。

成功済み結果は対象path・内容・実行時点で有効性を判断して再利用する。digestは補助情報であり、欠落だけで全checkを再実行しない。修正後は影響checkだけを再実行する。

UIは完成した実アプリを所有権確認済みURLで開き、代表smokeを実施する。既知のscope内不具合は限定修正して継続する。Browser利用不可は`UI未確認`として実装を保持し、PRにも明記して出荷できる。失敗を未確認や成功へ置き換えない。時間経過は範囲見直しの判断材料であり、延長承認のための停止条件にしない。

現在のinvocationに`確認セッションを保持`がなければ、今回起動したtask-owned prototype/review processとbaseline差分のagent-owned runtimeを停止・cleanupし、結果を報告する。planで保持済みのprototypeは保全する。実checkoutからの再起動手順（`cd <current-checkout> && ./dev-compose.sh ensure`、UIでは`cd <current-checkout> && ./dev-prototype.sh <slug>`）を返す。

## UI smokeとフィードバック

通知の配置・4色・Toastの使い分け・結果不明とエラーの保持は`DESIGN.md` 6.7.2を正本とする。

`UI検証方式: smoke`を使い、通常は合計1〜3代表シナリオを選ぶ。

- prototypeとの照合と大きなUI崩れ: [共通検証契約](../../.agents/skills/plan/references/workflow-verification-contract.md)に従い、同じ代表条件でprototypeと実アプリを表示し、構成・主要な見た目を照合する。操作可能でも意図しない領域・配置・スタイルの差は修正する。主要領域の欠落、重なり、切れ、重大な横はみ出し、操作を妨げる配置も確認する。結果に条件・一致点・指示による差・未確認を記載し、片方を表示できなければ`prototypeとの視覚照合は未確認`とする。
- 正常系: 主要な操作の流れを実アプリで通し、画面上の完了状態を観測する。保存が対象なら成功表示や画面反映までを1シナリオとする。prototype/fixture表示だけでは実アプリの保存成功としない。

responsive/themeが主題ならその代表条件を同じ選択に含める。全state、異常系、全境界、全consumer、各ボタンの総当たりや厳密なDOM/geometry/pixel比較は範囲外である。機能・権限・保存・APIの正しさは変更に応じた静的・統合testで支える。確認は数分を目安とし、同じツール障害の反復は打ち切って未確認を報告する。

planはprototype、implementは実アプリを確認する。reviewと出荷は有効な結果を再利用し、工程が変わっただけではBrowserを再実行しない。`## ユーザー動作確認`は少数の未チェック`UI-CHECK-XX`（対象・前提・操作・期待結果）を引き渡し、人間の確認を自動検証から完了扱いにしない。非UIは`- 対象外: UI変更なし`とする。

### 動作確認の代行依頼プロンプト

タスク完了報告時、対象PRに未確認の「ユーザー動作確認」が残る場合だけ、代行依頼用プロンプトを1件添える。現在のPR本文から対象と確認状態を判断し、実際のPR URLを埋め込んで、そのまま送信できる文章にする。PR未作成・対象項目なし・全件確認済みの場合は提案しない。提案だけで検証を開始せず、ユーザーが依頼した場合に実施する。

定型文（`<PR URL>`は実際のURLへ置換する）:

> <PR URL> の「ユーザー動作確認」の未確認項目を私に代わって実施してください。不具合があれば対象範囲で修正・再検証し、修正をcommit・pushしてください。実際に確認できた項目だけチェック済みにし、Codexによる代行確認であることと実施結果をPR本文へ反映してください。確認できない項目は未チェックのまま理由を残してください。

Codexアプリでは `- :codex-followup[ユーザー動作確認を依頼する]{prompt="実際のPR URLを含む上記の依頼文"}` の形式で表示する。対応しない環境ではコピー可能な引用またはコードブロックを使う。

代行確認はユーザー自身の確認とは区別して記録する。実操作・観測結果を根拠とし、通常smokeや自動testの成功だけで未確認項目を一括チェックしない。修正した場合は影響する項目を再検証する。CI待機・merge・Production操作の承認は、この定型文に含めない。

### 実装後の修正

設計を見直す依頼は同じgoalと必要なprototypeを更新する`$plan`、その後の明示`$implement`で反映する。軽微なUI調整は直接の指示を承認根拠に実装し、plan/prototype更新やskillの再送を必須にしない。余白・位置・サイズ・色・文言など、機能・権限・データ契約を保つ局所調整が対象である。

軽微修正ではgoal/prototypeを保持し、最新指示を対象箇所の期待値として使う。局所checkと変更箇所の短いBrowser確認で終了し、反映結果を報告する。後続のreview・出荷でも意図したprototypeとの差を尊重する。未決定の重大な仕様や権限・データ影響は依存作業だけを確認する。修正依頼はpush・PRの承認を兼ねない。

### `$review`

明示依頼で対象diffを固定し、goal、prototype、最新指示、静的check、smoke結果を評価する。通常は親がdiffと要件適合の2観点を確認する。独立判断が必要な場合のみAGENTS.mdの条件で独立reviewerを使い、親だけの結果を独立・blind検証済みと表現しない。

HTML reportは`plans/<slug>/review/`へ作り、`採用 / 却下 / 未確定`、comment、Markdown生成・copyを提供する。report自体の表示確認は製品UIの確認と分ける。現在のinvocationにexact phrase `確認セッションを保持`がある場合だけreportを保持する。実アプリを起動・attachしない。

### `$git-commit-push-pr`

Git規約・状態・task範囲・remote/GitHub identityを確認する。既存PRは現在のbaseを維持し、新規PRは作業を開始したbaseブランチを使う。`main`起点の通常変更は`main`向けとする。起点はユーザー指示・作業開始時のブランチ・branch/worktree作成記録で特定し、baseとの差分とcommitがtask範囲に収まることを確認する。topicのupstreamだけでは起点を判断しない。起点不明または明示指定が競合する場合だけ確認する。topic branchはrepository規約に従い、protected branchや安全に特定できるdetached HEADでは作成する。未承認の継承commit、分離不能なstage、ユーザー指定branchの衝突など判断が必要な場合だけ具体的選択を確認する。

対象pathだけをstageし、staged diffと空白・秘密混入を確認する。有効な実装checkを再利用し、commit時はhookを実行する。機械的hook修正が対象内だけなら限定restageして1回retryする。commit済みtaskは空commitを作らずその差分を出荷する。

エラーが発生した場合は原因を確認し、仕様・権限・データ契約・検証強度を保つ対象内の軽微修正を追加確認なしで行う。修正の影響するcheckだけを再実行し、関連pathだけをstageする。大規模変更や未決定事項が必要なら原因と対応案を報告して停止する。

remote topicにlocal HEADにないcommitがあれば停止する。安全なnon-force push、PR作成または最小更新、local/remote/PR HEAD照合まで同じ依頼内で行う。base先行だけでは同期を必須とせず、PRに競合がある場合はDraftで競合を報告できる。競合解消やbase同期は明示依頼時だけ行う。

PR本文はbase...HEADのdiff、base..HEADのcommit、実検証結果、現在のPR情報を根拠に日本語で書く。既存のbase・人間メモ・check・draft/ready・別Codex sessionを保持し、古い箇所だけ更新する。未確認UIがある新規PRはDraftとし、非UIは`UI 変更なし`を記載する。HEAD一致、mergeability、CI状態は別に報告する。

機密、混在stage、認証/通信失敗、進行中Git操作、remote divergence、hook失敗では依存操作を停止する。force push、広域stage、stash/reset、他taskの変更破棄、PR merge、CI待ちは含まない。未確認と既知の失敗を区別し、既知の必須check失敗を隠して出荷しない。

### 計画資料の任意cleanup

出荷はplanのarchiveやcleanupを必要としない。資料cleanupは、ユーザーが削除対象を明示した独立の保守作業として扱う。既存CLIのpreviewで対象を確認し、対象外の資料とactive confirmation sessionを保全する。archive・base同期・削除を自動連結しない。

通常`plans:guard`とCIはindexの追跡policyだけを検査する。GitHub rulesetのrequired check設定やProduction操作は別の明示作業である。

## 任意の振り返り

### `$workflow-retrospective`（別task推奨）

完了または意図的に中断したtaskを振り返る場合は、開発時間と振り返り時間を分離するため、新しいtaskから`$workflow-retrospective codex://threads/<thread-id>`を明示実行する。別taskから参照するsource taskが実行中なら監査しない。同じtaskで使う場合は開発完了後に限り、現在の振り返りturnを除いた完了済みturnだけを対象にする。

初回監査は追跡ファイルを変更せず、同じtaskの再監査で上書きする`plans/workflow-retrospectives/<thread-id>.md`だけを作る。現行contractで解消済みの問題を除外し、改善候補を最大3件へ優先順位付けする。候補IDをユーザーが明示選択した場合だけ、対象skill、本文書、共通runner、関連testの正確なallowlist内で改善する。P1とP2では必須工程、Browser実行、ユーザー確認、required command、skill instruction量を増やさない。

この操作を標準フローの末尾へ追加せず、`$plan`、`$implement`、`$review`から自動実行・自動提案・自動通知しない。一時reportは他のplan生成物と同様に`plans:cleanup`の対象になる。

### `$workflow-performance-audit`（複数taskの期間監査）

同じrepositoryの複数taskについて実行時間の再発要因を調べる場合は、別taskから`$workflow-performance-audit`を明示実行する。既定は現在timezoneの直近4暦日で、local session JSONLを1-passで解析し、raw transcriptやcommand本文を返さない。active/current taskと監査中に変化したsourceは暫定値へ分離し、完了taskだけを比較する。

判定は`ボトルネックあり`、`ボトルネックなし`、`判定不能`を区別する。P1は同じ回避可能なroot causeが2件以上の比較可能taskで再発した場合、P0は単一taskでも決定的なprogress-stop証拠がある場合に限る。必要telemetryが揃った2件以上で候補がなければ`改善提案なし・現行workflowを変更しない`と返し、証拠不足を「なし」へ補完しない。候補適用は行わず、実装する場合は別途`$plan`、代表taskを深掘りする場合は`$workflow-retrospective`を使う。

この監査も標準フローへ自動追加せず、subagent、Browser、runtime、web、外部service、report file、Git/PR変更を使わない。

## 互換性と適用範囲

このworkflowを採用した作業では既存goalもsmokeを使う。製品要件を保持し、検証方式への再同意を要求しない。詳細parityの行列・証跡は保存資料として扱い、未実施・失敗をsmoke成功で書き換えない。既存goal・archive・evidenceの一括移行や削除は行わない。

旧UI parityのrunner・reader・adapter・budgetと画面内の検証用状態注入は廃止した。過去資料の機械的検証・run再開は提供しない。新規計画・実装・review・出荷はprototype準拠の代表smokeを使う。保存資料の整理は別途明示された対象だけを扱う。

## Runtimeと権限

起動・再利用・停止は[dev-server規約](../../.claude/rules/dev-server.md)と[開発用ポート](development-ports.md)に従う。worktreeは固有runtimeを使い、他checkoutの3000を再利用しない。正しい既存serverは再利用し、ユーザー所有serverは停止しない。

保持後の実routeのtimeout/HTTP失敗はruntimeの実失敗とし、Browser利用不可へ読み替えない。HTTPが正常でBrowserだけ利用不能ならUI未確認として引き継ぐ。保持前のsmokeだけで閲覧可能とせず、保持完了→別呼出しのstatus→同URLの最終smokeという順序と障害時の限定診断はdev-server規約に従う。通常の1〜3シナリオを保ち、追加の承認・build・常時monitorは導入しない。

Browser API文書は操作前に読み、未読エラーを権限拒否と断定しない。権限拒否を別Browserやtaskで回避しない。終了時はbaselineとの差分のうちtask所有資源だけをcleanupし、named volumeと他taskの資源を保持する。保持sessionのslugを暗黙置換しない。

## Workflowの検証

変更に対応するfixtureと行動評価だけを実行する。`scripts/eval-plan-skills.mjs --scenario <name>`、`scripts/eval-git-commit-push-pr.mjs --scenario <name>`で対象を指定する。self-testと実agent実行を区別し、未実施を成功としない。全scenarioの自動展開は行わない。具体的な検証対象とcommandは各goalへ記載する。
