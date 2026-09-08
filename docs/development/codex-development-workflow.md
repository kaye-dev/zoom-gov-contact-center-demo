# Codex計画・実装・HTMLレビューワークフロー

## 目的

大きな変更を、goal、必要なUI prototype、production実装、reviewの順に進める。各skillは成果物を次工程へ渡す薄い役割とし、独自runtime、custom implementation agent、lifecycle state machineは作らない。custom agentは、壁打ち、広範な読み取り探索、独立reviewという限定されたread-onlyロールだけに使う。

本文は日常の判断と操作だけを示す。詳細契約は各`SKILL.md`と`.agents/skills/plan/references/`、HTML report仕様は`.agents/skills/review/references/review-contract.md`、dev server操作は`.claude/rules/dev-server.md`を正本とする。この責務分離は[OpenAIのskill設計ガイド](https://learn.chatgpt.com/docs/build-skills)に従う。

## 成果物

`plans/template.md`だけを追跡し、生成物はGitからignoreせずplan単位で同じdirectoryへ置く。作業中は各planを固有のslugで`plans/`配下へ保持し、通常の`git status`へ表示させる。

```text
plans/<slug>/
├── goal.md
├── prototype/  # UI変更時
├── evidence/   # UI変更の$implement承認または独立parity時
└── review/     # $review時
```

生成directoryはGitへ追加しない。canonical planの出荷は、current goal全文をcommit messageへarchiveしてraw commitを検証する初回shipping、明示再送されたhandoffによるbase同期・限定cleanup、continuation shippingの順に分離する。push前とCIでは`plans/template.md`だけが存在する状態を必須とする。

## モデル選択

親エージェントのproject-local既定モデルは設けない。通常処理と各skillの親エージェントは、Codexのcomposerでユーザーが選択したモデルとreasoningを維持する。品質と利用量のバランスを考える際は、次の組み合わせを参考に手動選択する。

| skill | 推奨モデル | reasoning |
| --- | --- | --- |
| `$plan` | `gpt-5.6-sol` | `high` |
| `$implement` | `gpt-5.6-sol` | `high` |
| `$review` | `gpt-6-astra` | `low` |
| `$git-commit-push-pr` | `gpt-5.6-luna` | `medium` |
| `$plan-finalize` | `gpt-5.6-luna` | `medium` |
| `$workflow-retrospective` | `gpt-5.6-terra` | `high` |
| `$workflow-performance-audit` | `gpt-5.6-terra` | `high` |

read-only custom agentのモデルはスキルメタデータではなく、`.codex/config.toml`の登録と`.codex/agents/*.toml`で固定する。

| 呼び出し元 | custom agent | 固定モデル | reasoning | 起動条件とfallback |
| --- | --- | --- | --- | --- |
| `$kabeuchi` | `product_advisor` | `gpt-5.6-terra` | `medium` | 通常は親が回答し、独立判断が必要な場合のみ1体起動する。独立ルートが利用不能なら独立助言は未実施として停止する |
| `$plan` | `project_explorer` | `gpt-5.6-luna` | `medium` | 通常は親が探索し、分離が必要な複数subsystem・大量資料のread-only探索のみ最大1体起動する。利用不能なら親が継続して未使用を報告する |
| `$review` | `independent_reviewer` | `gpt-5.6-terra` | `high` | 通常は親が2観点を確認し、独立判断が必要な場合のみ2体を並行起動する。片方でも利用不能なら停止する |

サブエージェントは原則使用せず、必要性の判断と待機方法はAGENTS.mdに従う。これらのcustom agentはすべて`read-only`とし、spawn時のmodelまたはreasoning overrideを渡さない。`$implement`、`$git-commit-push-pr`、`$plan-finalize`、`$workflow-retrospective`、`$workflow-performance-audit`はsubagentへ委譲せず、親エージェントが単独で実行する。全体のsubagent既定モデル、既定reasoning、同時実行数制限はproject-local設定へ追加しない。上表以外の一般subagentは、Codexの通常動作として親taskで選択した設定を継承する。ユーザーまたは管理者の上位設定によるoverrideはrepositoryの管理対象外とする。

`xhigh`、`max`、`ultra`は親エージェントのskill別推奨にもcustom agentの固定設定にも使わない。推奨設定で品質不足が確認された場合だけ、対象taskの親エージェントで明示的に選択する。

skillメタデータとproject-local `profiles`ではmodelを指定しない。親エージェントのmodel切替はcomposerだけで行い、custom agentの固定routingだけを`.codex/agents/*.toml`で管理する。モデルの役割とreasoningは[OpenAIモデルガイド](https://developers.openai.com/api/docs/guides/latest-model)、設定項目は[Codex Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、custom agentとsubagentの継承は[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)を根拠とする。

### レビュー前のモデル切替

独立レビューへ移る直前に、現在ターンの実行モデル・reasoningを確認する。試行する親モデルは `gpt-6-astra / low`。一致していれば続行し、不一致または確認不能ならターンを終了して、切替先とコピー可能な継続プロンプトを返す。ユーザーがcomposerで切り替え、同じタスクへプロンプトを送ってからレビューを始める。設定ファイルの既定値や過去ターンだけで現在モデルを断定しない。

`$implement`のCLI・実画面・実操作・適合・目視・cleanupは完了してから引き渡す。`$review`自体は明示依頼時のみ実行する。必要時のみ起動する独立レビュー担当の `terra/high` は維持する。モデル切替のために検証を省略せず、config変更や新規タスク作成もしない。モデルが確認不能でもユーザーが切替済みと明言すれば、ユーザー申告として続行し、確認待ちを反復しない。

停止時は現在モデルの根拠、切替先、対象goal/差分/証跡、完了済み検証、未実施レビュー、現在タスクのディープリンクを継続プロンプトへ含める。リンクを取得できない場合のみ入力欄を用意する。詳細とテンプレートは[レビューのモデル引継ぎ](../../.agents/skills/review/references/model-handoff.md)を正本とする。

## 任意の壁打ち

`$kabeuchi`は標準の実装フローとは独立した、明示呼び出し専用のread-only相談である。現在の相談、確定済み判断、必要最小限のrepository evidenceだけをfreshな`product_advisor`へ渡す。親エージェントは助言を証拠と照合し、推奨案、トレードオフ、未確認事項、次に決めることを統合して返す。

壁打ちではファイル編集、plan作成、実装、Git操作、外部変更を行わない。変更が必要なら、相談を終えた後に対応するskillを別途明示実行する。

## 標準フロー

基本は次の順で進める。

1. `$plan`: goalと必要なUI prototypeを作る。
2. `$implement`: 現在のgoalとprototypeを承認して実装・静的検証し、UI変更ではfinal Browser coverageを行う。
3. `$review`（必要な場合）: diffとgoalへの適合性をreviewする。
4. `$git-commit-push-pr`（明示依頼時）: canonical planではarchive commitと`$plan-finalize` handoffを作って停止し、通常taskではcommit、push、PRを行う。
5. `$plan-finalize`（handoffをユーザーが明示再送した場合）: base同期・限定cleanup・guardを行い、`$git-commit-push-pr` continuation handoffを返す。
6. `$git-commit-push-pr`（continuation handoffをユーザーが明示再送した場合）: cleanup済みbranchをnon-force pushし、PRを作成または最小更新する。

plan cleanupは`$plan-finalize`だけの削除権限であり、archiveされていないplan、別taskのplan、handoff不一致のplanを自動削除しない。

### `$plan`

1. 最新要求、確定済み判断、採用済み資料を整理する。
2. repository、runtime、code、testを確認し、UI変更時はclosest live UIも確認する。複数subsystemまたは大量資料を横断し、独立した要約で親のcontextを節約できる場合だけ、最大1体の`project_explorer`を使う。
3. 自己完結した最終設計、`## 要件クロージャ`、PRへ渡す`## ユーザー動作確認`を`plans/<slug>/goal.md`へ書く。UI項目は安定した`UI-CHECK-XX` ID、対象、前提、操作、期待結果を持つ未チェック形式にし、非UIは`対象外: UI変更なし`とする。
4. UI変更時は完成UI、完全Cartesian matrixを持つ`ui-contract.json` version 1、coverage/risk/anchorを宣言する`parity-spec.json` version 4を作る。
5. goalを監査し、UI変更時はauthoring中のCSS buildを1回だけ行う。revisionをgoalへ記録後、`parity-runner.mjs preflight ... --context plan`を1回実行してgoal、contract/profile、source inventory、invariant/probe、coverage/full/selected行数をまとめて検証し、返却直前に影響scopeのtargeted smokeを1回行う。
6. UI planは`./dev-prototype.sh --retain <slug>`でprototypeを確認可能な状態にし、goal、live URL、PID、owner、revision、smoke結果、未確認事項、停止commandを返す。非UI planは確認セッションを作らない。

フィードバックでは同じplanを最終設計として更新する。Browserをauthoring中に使わず、静的作業が完了した返却直前に影響scopeのsmokeを1回だけ行う。全matrixや承認状態は作らない。

#### プランの再整理

会話履歴、却下案、以前の設計との比較が蓄積してplanを理解しづらくなった場合は、同じtaskへ次のpromptを送る。

```text
最終設計を、最初からこの結論を採用していたものとして全面的に書き直してください。

読者はこの会話の経緯を一切知らない新規参加者とする。経緯を知らないと意味が通じない文は残さないこと。

過去案、却下理由、変更履歴、以前の設計との比較として書かれた「◯◯はやらない」は削除してください。
ただし、現在の仕様として必要な制約、安全境界、対象外、互換性、移行・ロールバック条件は残してください。
```

この再整理は同じ`plans/<slug>/goal.md`を編集上の履歴がない最終設計へ書き直す操作である。別skill、custom agent、追加のBrowser確認は起動しない。prototypeまたはUI契約も変更する場合だけ、通常の`$plan`フィードバックとして静的検証、revision更新、返却直前のsmokeを行う。

### `$implement`

1. UI変更では承認済みprototypeを再build・表示せず、`parity-runner.mjs preflight ... --context implement`を1回実行してgoal、revision、profile digest、source inventory、selectionを静的検証し、fresh runへ`approval.json`を記録する。
2. HEAD、task scope、source、contract/profile、要件クロージャ、`## ユーザー動作確認`を静的に照合する。UI checklistは安定した`UI-CHECK-XX` ID、対象、前提、操作、期待結果を持ち、すべて未チェックとする。
3. goalとUI契約に従って実装し、対象unit/contract testで確認する。
4. `validation-digest.mjs`でHEAD、task scope、staged/unstaged/untrackedを含むvalidated diff digestを記録し、変更riskに比例するfocused test、lint、typecheck、必要な場合だけfull test/build、diff checkを行う。同じdigestではfull test/buildを各1回までとし、command・scope・pass statusが一致する結果を後工程で再利用する。
5. UI変更では完了候補に対してtask-owned productionとprototypeを同一条件でcoverage実行し、全required row、risk、anchor、artifact、cleanupがpassした場合だけschema version 5の`implementation-parity.json`を確定する。
6. 最終diffをgoal、要件クロージャ、task scope、ユーザー確認checklistと照合し、自動coverageと未実施の人間確認、full parityを分けて報告する。

明示的な`$implement`実行自体を現在のgoal、revision、profile digestへの承認とする。「承認します」という別回答やrevision転記は不要である。静的gateの失敗はproduction差分0件のまま停止する。Browser capability、runtime、prototype、parity lifecycleはUI実装と静的check後のfinal boundaryでだけ使い、authoring中や非UI変更では使わない。`確認セッションを保持`は現在のinvocationにある場合だけfinal coverage後のtask-owned surface保持を許可する。

局所変更は対象testとlint、typecheck、diff checkを基本とする。全testは無関係suiteへ波及し得る場合または信頼できる対象testがない場合、production buildはroute、configuration、bundling、server boundaryを変える場合またはrepositoryの明示要件がある場合だけ行う。source修正後は影響checkだけを再実行する。

coverage/full runner、adapter、schemaはUI`$implement`のfinal coverageとrelease、CI、定期、ユーザー明示要求の独立parity taskで共有する。currentな計画駆動UI変更ではschema version 5のcoverage証跡を実装・通常review・shippingの完了条件とし、schema version 1から4はlegacy read-only互換として扱う。

### `$review`

1. exact diffとvalidated diff digestを固定し、実装済みcheckはcommand・scope・pass status・digest一致時に再実行せず、UI影響、goal/prototype/approval、ユーザー確認checklistを監査する。UI変更ではcurrentなschema version 5 `implementation-parity.json`を必須とし、coverage、risk、anchor、artifact、checkpoint、cleanup、digestをread-only検証する。
2. 通常は親がdiffとgoal適合の2観点を確認する。独立判断が必要な場合のみ、理由を示して履歴なし`independent_reviewer`で並行実行する。親だけの結果を独立・blind検証済みと表現しない。
3. `plans/<slug>/review/`へHTML reportを作り、desktopと390×844でreport自体を確認する。これはproduction UI検証ではない。現在のinvocationにexact phrase `確認セッションを保持`がある場合だけ、review reportを同じslugの確認セッションへhandoffする。

HTML reportは実装を変更せず、`採用 / 却下 / 未確定`、comment、Markdown生成、copyを提供する。

#### レビュー後のフィードバック対応

1. 各指摘の判断とcommentを確定し、Markdownをcopyする。
2. goal、完成UI、interaction、contract、profileを変える場合は同じgoalへ`$plan`する。
3. 採用指摘がある場合は最新goalへ`$implement`する。
4. 必要なら再度`$review`する。
5. 出荷する場合だけ`$git-commit-push-pr`する。

現行goalへの実装逸脱、test不足、approval/checklist不備だけなら2を省略する。focus trap、Tab循環、背景の`inert`化などUI契約を変える指摘は`$plan`後の別メッセージで`$implement`する。

```text
$plan plans/<slug>/goal.md
レビューHTMLで採用した指摘を同じplanへ反映してください。
<生成したMarkdown>

# $plan完了後
$implement plans/<slug>/goal.md
```

### `$git-commit-push-pr`

1. Git規約、状態、remote、GitHub認証、repository対応を確認してfetchする。
2. canonical goalとplan inventoryを解決し、UI変更では`verify-run`でcurrentなfinal coverage証跡を検証する。欠落・失敗・stale・曖昧ならbranchやindexを変更せず停止する。
3. baseとtopic branchを解決し、protected branch上または安全条件を満たすdetached HEADならtopic branchを作る。
4. 未commit変更があればcurrent taskのpathだけをstageする。staging前後でvalidated diff digestが一致すれば成功済みtest/buildを再利用し、`git diff --cached --check`とhookの後にgoal全文を含む1件のcommitを作る。既にtask差分がcommit済みならgoal archive専用commitを1件作る。
5. canonical goalではraw commit objectのgoal path、byte length、SHA-256、payloadをdisk上goalと照合し、planを残したまま、branch・remote・base ref/OID・HEAD・archive SHA・goal SHA・inventoryを固定した`$plan-finalize` handoffを返して停止する。同期、cleanup、push、PRは行わない。
6. canonical planがdisk上から消えたtaskは、検証済み`$plan-finalize` continuation handoffを明示再送された場合だけ、handoffのHEAD/base/archive/goal SHA/inventory/guardを再検証して続行する。通常taskの出荷は従来どおりbase同期後に続行する。
7. continuationまたは通常taskではhistoryを書き換えずにpushし、localとremoteのSHA一致を確認する。
8. 同じheadのPRを作成するか、必要な箇所だけを更新する。`確認内容`へgoal archive commit SHAとgoal SHA-256を記録し、自動確認とユーザー動作確認を分け、goalの`UI-CHECK-XX`を未チェックで転記する。未確認の必須UI項目がある新規PRはDraftにし、既存PRではdraft/ready、手動メモ、既存check状態を保持する。
9. PRのbase/head OID、draft、mergeability、merge stateを1回の`gh pr view --json`でreadbackして報告する。未確定値のためにpollせず、unverifiedとして分離する。

現在のユーザーが明示した場合だけ実行する。detached HEADではremoteとGitHub repositoryを確認してfetchした後、HEADが唯一のbase候補の履歴内にあり、task path、index、未使用branch名が一意な場合だけ`git switch -c`で新規topic branchを作り、通常のshippingへ合流する。

`main`と`develop`のbase候補が競合する、別topicのcommitを含む、branch名が既存、同名branchを別worktreeが使用中、またはstaged scopeが曖昧な場合は、branch、index、remote、GitHubを変更せず停止する。停止報告にはrepository、full HEAD、baseとOID、未使用topic branch、task path、staged pathとdigest、index policy、必要なhistory decisionを実値で埋めた`次に送るプロンプト`を提示する。選択肢が複数ならplaceholderのない独立promptを提示し、ユーザーが一つを再送した時点でその値を明示判断として扱う。snapshotが一致すれば同じ停止理由を再質問せず、必要なexact pathのindex-only unstage、commit、同期、non-force push、PR作成または最小更新、readbackまで続行する。snapshotが変わっていれば何も部分適用せず、現在値から停止し直す。

force push、force-create、shared worktree checkout、stash、変更破棄、広域stage、自動競合解決、PR merge、CI待機は行わない。再開promptが許可できるindex変更は、列挙された対象外pathへの`git restore --staged --`だけとし、working treeを変更しない。競合、remote divergence、複数PR、認証・repository不一致など、再開promptが解消していない独立条件は停止条件とする。plan・review生成物はstageせず、plan削除は`$plan-finalize`の検証済みhandoffだけに限定する。別planがあれば削除せず停止する。

最新baseが進んでいること自体は停止理由にしない。`$plan-finalize`とcontinuation shippingは共通のbase同期契約を使う。同期が必要な場合は、incoming base pathとtask外の未追跡・ignored artifactについて、同一path、祖先・子孫、file／directory／symlink置換の衝突がないことを確認し、path・type・内容digestのsnapshotを取る。indexとtracked working treeが同期可能であれば、非衝突artifactを元の場所に保持したまま、未公開branchは`git rebase --no-autostash`、公開済みbranchはhistoryを書き換えないmergeで同期し、成功後またはabort後にsnapshotを照合する。tracked dirty、local artifactとのpath衝突、semantic conflictは自動stash・一時移動・削除・復元を行わず停止する。

### `$plan-finalize`

初回`$git-commit-push-pr`が返した完全なhandoffをユーザーが明示再送した場合だけ実行する。repository、remote、branch、initial HEAD、base ref/OID、goal path/SHA-256、archive SHA、plan inventoryを再検証し、foreign plan、template drift、active confirmation session、archive不一致、tracked dirty、remote divergence、同期競合では削除0件で停止する。base同期後は`base..HEAD`からgoal SHA-256が一致するarchiveを一意に再解決し、rebaseで変化したarchive SHAを採用してcurrent slugだけをcleanupする。

cleanup成功には`plans/template.md`だけ、`npm run plans:guard`成功、clean indexを必須とする。`$plan-finalize`はstage、task commit、push、PR作成/更新を行わず、post-cleanup HEAD、base OID、branch、archive SHA、goal SHA、template-only inventory、clean indexを固定した`$git-commit-push-pr` continuation handoffを返す。ユーザーがそのhandoffを明示再送するまで、出荷を続けない。

## 任意の振り返り

### `$workflow-retrospective`（別task推奨）

完了または意図的に中断したtaskを振り返る場合は、開発時間と振り返り時間を分離するため、新しいtaskから`$workflow-retrospective codex://threads/<thread-id>`を明示実行する。別taskから参照するsource taskが実行中なら監査しない。同じtaskで使う場合は開発完了後に限り、現在の振り返りturnを除いた完了済みturnだけを対象にする。

初回監査は追跡ファイルを変更せず、同じtaskの再監査で上書きする`plans/workflow-retrospectives/<thread-id>.md`だけを作る。現行contractで解消済みの問題を除外し、改善候補を最大3件へ優先順位付けする。候補IDをユーザーが明示選択した場合だけ、対象skill、本文書、共通runner、関連testの正確なallowlist内で改善する。P1とP2では必須工程、Browser実行、ユーザー確認、required command、skill instruction量を増やさない。

この操作を標準フローの末尾へ追加せず、`$plan`、`$implement`、`$review`から自動実行・自動提案・自動通知しない。一時reportは他のplan生成物と同様に`plans:cleanup`の対象になる。

### `$workflow-performance-audit`（複数taskの期間監査）

同じrepositoryの複数taskについて実行時間の再発要因を調べる場合は、別taskから`$workflow-performance-audit`を明示実行する。既定は現在timezoneの直近4暦日で、local session JSONLを1-passで解析し、raw transcriptやcommand本文を返さない。active/current taskと監査中に変化したsourceは暫定値へ分離し、完了taskだけを比較する。

判定は`ボトルネックあり`、`ボトルネックなし`、`判定不能`を区別する。P1は同じ回避可能なroot causeが2件以上の比較可能taskで再発した場合、P0は単一taskでも決定的なprogress-stop証拠がある場合に限る。必要telemetryが揃った2件以上で候補がなければ`改善提案なし・現行workflowを変更しない`と返し、証拠不足を「なし」へ補完しない。候補適用は行わず、実装する場合は別途`$plan`、代表taskを深掘りする場合は`$workflow-retrospective`を使う。

この監査も標準フローへ自動追加せず、subagent、Browser、runtime、web、外部service、report file、Git/PR変更を使わない。

## UI変更の共通契約

### Prototypeと比較条件

prototypeは完成UI契約であり、data、persistence、authorization、backend side effectだけをmockにできる。既存shell、component、Tailwind utility、semantic token、light/dark、responsive、interaction、DOM、accessibilityは本番相当にする。

```sh
node .agents/skills/plan/scripts/build-prototype-css.mjs plans/<slug>/prototype
node .agents/skills/plan/scripts/prototype-revision.mjs plans/<slug>/prototype
node .agents/skills/plan/scripts/parity-runner.mjs preflight plans/<slug>/prototype \
  --context plan --target <changed-target> --state <changed-state> [--risk <risk>]
./dev-prototype.sh <slug>
```

`ui-contract.json` version 1には完全なproduction `sources` inventory、runtime owner、checkout、route、state、theme、responsive、interaction、安定したtargetとmatrix行を記録する。比較条件はviewport、DPR、locale、theme、fixture、authorization、queryと、両surfaceの`window.scrollX` / `window.scrollY`から実測したexact `scroll: {x, y}`を一致させる。

`parity-spec.json` version 4にはdeterministic setup、state identity assertion、targetごとの`browserSetups`、全row mapping、coverage/anchor probe tier、axis順序、targetごとのanchor、risk row、全sourceのimpact、固定batch、artifact policyを記録する。coverage probeは全rowでroute、setup、state、viewport、theme、control、overflow、consoleをrequiredにし、screenshot・DOM・accessibility・style・geometry・focus・keyboard・networkはanchorへ限定する。version 1から3はlegacy read-only互換として維持する。正本は`.agents/skills/plan/references/parity-runner.md`とする。

plan中のsmokeはtargetedな代表desktopと390×844を基本とし、具体的なtheme、breakpoint、dialog、menu、keyboard、focusリスクだけを追加する。coverageとfullは`$plan`では実行しない。

### Manifestのサイズ超過への対応

現行runnerの2 MiBはworkspace JSONの生成・読込上限であり、Browserの制約や要件数の上限ではない。整形用空白を省いても収まらない場合は、契約・検証定義を含む論理manifestを自動分割し、索引から順序付きのpath・digestで参照する。各ファイルは2 MiB以内、論理JSON全体は32 MiB以内・最大256分割とし、読込時に復元と整合性検証を行う。今後の超過は拒否だけで解決済みにせず、要件・source・比較行・risk・anchor・probeを維持して保存形式を改善する。

基本方針は、契約・検証定義をファイルごとの上限内へ分割し、manifestからpathとdigestで参照すること。想定規模とメモリ使用量に根拠がある限定的な対応では、生成側・全読込側の上限を同時に引き上げてもよい。無制限化や比較ケースの削減はしない。自動分割は実装済みであり、総量・分割数の上限引き上げは必要性を確認して行う改善方針とする。

詳細と検証条件は[Manifest size recovery policy](../../.agents/skills/plan/references/parity-runner.md#manifest-size-recovery-policy)を正本とする。ユーザーが検証基盤修正を明示した場合は、その依頼をscope拡張として扱い、元のfeature planの対象外という理由だけで再承認を求めない。文書方針の更新だけでrunner実装を始めず、修正時は既存証跡・checkpoint・無関係な変更を保全する。保存・読込の復旧とBrowser coverageの完了は別に報告する。

### 承認、ユーザー確認、final parity証跡

`$implement`はfreshな`plans/<slug>/evidence/<run-id>/approval.json`へgoal digest、prototype revision、profile digestを記録する。`evidence/`とrun directoryはumaskに依存せず`0700`、canonical JSONは`0600`で排他的に作成し、既存pathのtype、symlink、realpath、mode不一致では修復せず停止する。runtimeと人間判断が必要な項目はgoalの`## ユーザー動作確認`へ未チェックで残し、shipping時にPRへ転記する。

- `approval.json`: goal digest、prototype revision、profile digest

UI`$implement`と独立parity taskで作る新規parity fileはfinal-onlyのschema version 5とし、`matrixScope: coverage | full`、exact row、全target-state/viewport/theme coverage、risk、anchor、checkpoint/resume、required probe、digest、artifact index、cleanupを記録する。通常UI実装はcoverageを必須とし、自動coverage、人間のUI承認、full parityは独立statusにする。既存schema version 1から4はread-only互換で暗黙に書き換えない。`$review`はcurrent UI変更についてこのfileを要求する。

各targetのcovering matrix基本行数は`max(state数, viewport数, theme数)`である。18 target、5 state、8 viewport、2 themeの基準profileは通常144行、full 1,440行になる。risk/anchor座標が基本selection内なら重複させず昇格し、外なら一意な追加rowにする。

UIの最終的な視覚品質はCodexが承認済みprototypeとの画像比較で監査する。人による承認は任意の別状態とし、未実施だけを理由に停止しない。

### UI final coverageと独立parity taskのRuntime所有権

1. Localはport 3000、worktreeはruntime manifestの割当portについて、関連process、container、Compose、dependencyのbaselineとownerを記録する。
2. UI`$implement`と独立parity taskは実装・静的検証・diff確認後にだけBrowserとprototype serverを起動する。非UI`$implement`では起動しない。
3. buildが必要な場合だけidentityを再確認し、agent-owned runtimeだけを停止する。
4. final coverageの完了直前に`./dev-compose.sh ensure`を1回実行し、同commandの最終出力にある`RUNTIME_OWNERSHIP=verified`、`ACTIVE_RUNTIME_HEALTH=healthy`、`RUNTIME_RESTART_REQUIRED=0`、PID/container、cwd、mount、Compose project、port、`PRODUCTION_URL`をauthoritative readbackとして使う。進行中に外側status、固定sleep、30秒poll、`docker logs -f`を発行せず、`finalize-run`直前だけdriftを1回読む。ensure失敗時だけ同じprojectのstatus、process state、直近logのbounded diagnosticを各1回取得する。
5. 最終確認後はworktreeだけ`./dev-compose.sh cleanup`を使い、baselineとの差分だけをcleanupする。

Localでは同じcheckoutのhealthyなnative Next.jsまたは正しいCompose `web`を`http://localhost:3000`で再利用する。worktreeではcanonical checkout pathから固有Compose projectとweb・PostgreSQL・Studio portを割り当て、DB、named volume、network、originを他checkoutと分離する。worktreeはloopbackだけにbindし、LANとCloudflareはLocal専用とする。

記録にはPID、command、cwd、Compose project、checkout mount、container ID、URL、fixture、authorizationを含める。`prepare-run`の`--runtime-owner`と`--runtime-checkout`はこの外部readback値をcontract、current checkout、manifest、evidenceへ結び付ける宣言値であり、CLI自身はprocess、container、listener、mount、healthを検査しない。引数同士やcontractとの一致だけを実runtime所有権の確認として扱わない。

通常変更はHMRを使い、wrapperが自動再起動できるのはpending migration適用後のverified `web`だけとする。新規route、stale cache、package、runtime設定の変更は理由を報告し、明示的な`./dev-compose.sh restart web`（`Web restart`）操作を待つ。他serviceやproject全体を停止しない。ユーザー所有dev serverはbuildのために停止せず、安全な隔離buildができなければblockedとする。広域な`docker compose down`や既存resource、named volumeの削除は行わない。

## Workflowの検証

通常のcontract testは対象testを先に使い、workflow全体の変更、CI、release、明示要求では`npm test`を1回実行する。認証済みCodex CLIのforward evalは変更pathに対する`npm run eval:plan-skills -- --affected-from <base> --concurrency 2`を通常入口とし、共通skill/runtime契約変更時だけ全scenarioを1回実行する。fixture isolationやrate limitを満たせなければ`--concurrency 1`へ下げ、失敗後はresult manifestを`--resume`へ渡して失敗scenarioだけを再実行する。

CLI evalはUI`$implement`または独立parity taskのCodexアプリ内Browserを代替しない。runtime所有権、build、migration起因のverified Compose `web` restart、live parity、cleanupの契約を変えた場合は、shipping前にCodex Desktopで成功・停止経路をmanual確認する。

contract testはUI`$implement`がstatic preflight、approval、focused test、lint、typecheck、必要時だけfull test/build、diff check後にcoverage lifecycleへ進み、schema version 5 evidenceなしで完了しないことを決定的に検証する。runner互換testは18×5×8×2 profileのcoverage 144行/full 1,440行、schema version 1から4のread-only互換とversion 4 writerを維持する。PR shipping evalはUI evidence fail-closed、goal archive、限定cleanup、UI checklistの未チェック転記、Draft作成、既存PRのdraft/ready・手動メモ・check状態保持を検証する。

## 権限とcleanup

goalやskillは追加権限ではない。deploy、外部API書き込み、共有・本番DB変更、secret操作、削除、commit、push、PRには現在のユーザー依頼による権限が必要である。

`npm run plans:cleanup`は`plans/template.md`以外の削除候補をpreviewする。manual cleanupは別の明示操作として`npm run plans:cleanup -- --apply`を使う。canonical planの削除は、ユーザーが初回shipping handoffを明示再送した`$plan-finalize`だけが、goal archiveとbase同期後の一意archiveを検証して`npm run plans:cleanup -- --apply --goal plans/<slug>/goal.md --commit <sha>`でexact current planへ行える。

`.gitignore`で`plans/`やlegacy `plan/`を隠さない。GitHub Actionsの`Verify plan artifacts`はcheckoutを走査し、regular tracked fileの`plans/template.md`以外のfile、directory、symlink、legacy path、template変更を拒否する。goal archive blockがあるchanged commitはversion、path、byte length、SHA-256、6見出しも検証する。mergeを実際にblockするにはGitHub rulesetでこのjobをrequired checkにする。

active confirmation sessionのslugが削除候補に含まれる場合、applyは何も削除せず`./dev-confirmation.sh stop <slug>`を表示する。stateがmalformed、symlink、別checkoutの場合も所有権を推測せず停止する。

## 要件・組合せ・実動作・Codex目視の監査

正本は`.agents/skills/plan/references/fidelity-audit.md`。NISTの指針を基に、要件から因子・同値クラス・境界・強さ・制約を定義する。現行coverageは単独軸の網羅でpairwiseの保証ではない。全軸/risk/anchorを維持し、指定t-wayの成立可能tupleが不足する場合だけ決定的に補完する。63件は固定上限でも十分性保証でもない。

`$plan`はREQ ID、phase比較、static checks、interaction groups、通常画面でのruntime checks、Codex visual checksをprofile v4に明示する。`$implement`はCLI検証後、実アプリとBrowser/CDPで選択行を実行し、通常操作・必要な再読込を確認し、Codexが選定画像を閲覧する。変更前との差を求めるsmokeと、承認済みprototypeへの一致を求めるfinalを区別する。承認後の期待値を弱めて合格させない。

schema v5は`interactionCoverage`を実行成功probeから再計算し、`auditStatus`のstatic/runtime/requirements/visualがすべてpassの場合だけ完了する。`$review`とshippingも同じ条件を使う。旧profile v1〜3/evidence v1〜4は履歴のread-only互換であり、新しい監査へ合格した証拠として扱わない。製品API/DBと二段階Git出荷は変更しない。

CDP capability／DPRのterminal failureでは、設定無効やセッション不調と断定せず、新規Codexタスクで同条件を再検証することを案内し、対象goal・証跡・成功済みcheck/digest・未実施項目・cleanupを埋めたコピー可能な継続プロンプトを必ず返す。現在タスクのIDが取得できる場合は `codex://threads/<current-thread-id>` をプロンプト内に記載し、不明な場合のみ「前タスクのディープリンク: ［ユーザーが入力］」を用意する。詳細は `.agents/skills/plan/references/fidelity-audit.md` のfresh-task handoffに従う。新規タスクの自動作成、権限拒否の回避、繰り返しのセッション切替、直接CDP成功だけによる全体完了は行わない。

## 開発用ポート

Browserの利用範囲と出力URLを照合し、範囲外ならBrowserを開かず作業を止める。起動・保持・予約解放、権限登録、移行・保全・rollbackは[開発用ポートの固定範囲](development-ports.md)に従う。非UIの起動ツール変更ではgoalが要求する限定runtime確認だけを行い、BrowserやUI parityは開始しない。
