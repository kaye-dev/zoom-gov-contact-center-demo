# Codex計画・実装・HTMLレビューワークフロー

## 目的

大きな変更を、goal、必要なUI prototype、production実装、独立reviewの順に進める。各skillは成果物を次工程へ渡す薄い役割とし、独自runtime、custom implementation agent、lifecycle state machineは作らない。custom agentは、壁打ち、広範な読み取り探索、独立reviewという限定されたread-onlyロールだけに使う。

本文は日常の判断と操作だけを示す。詳細契約は各`SKILL.md`と`.agents/skills/plan/references/`、HTML report仕様は`.agents/skills/review/references/review-contract.md`、dev server操作は`.claude/rules/dev-server.md`を正本とする。この責務分離は[OpenAIのskill設計ガイド](https://learn.chatgpt.com/docs/build-skills)に従う。

## 成果物

`plans/template.md`だけを追跡し、生成物はplan単位で同じdirectoryへ置く。1つのbranchで複数のplanを作成・実装できるよう、各planを固有のslugで`plans/`配下へ並列に保持する。

```text
plans/<slug>/
├── goal.md
├── prototype/  # UI変更時
├── evidence/   # UI変更の$implement時
└── review/     # $review時
```

生成directoryはGitへ追加しない。

## モデル選択

親エージェントのproject-local既定モデルは設けない。通常処理と各skillの親エージェントは、Codexのcomposerでユーザーが選択したモデルとreasoningを維持する。品質と利用量のバランスを考える際は、次の組み合わせを参考に手動選択する。

| skill | 推奨モデル | reasoning |
| --- | --- | --- |
| `$plan` | `gpt-5.6-sol` | `high` |
| `$implement` | `gpt-5.6-sol` | `high` |
| `$review` | `gpt-5.6-sol` | `high` |
| `$git-commit-push-pr` | `gpt-5.6-luna` | `medium` |
| `$workflow-retrospective` | `gpt-5.6-terra` | `high` |

read-only custom agentのモデルはスキルメタデータではなく、`.codex/config.toml`の登録と`.codex/agents/*.toml`で固定する。

| 呼び出し元 | custom agent | 固定モデル | reasoning | 起動条件とfallback |
| --- | --- | --- | --- | --- |
| `$kabeuchi` | `product_advisor` | `gpt-5.6-terra` | `medium` | 明示呼び出しで1体だけ起動する。利用不能なら壁打ち未実行として停止する |
| `$plan` | `project_explorer` | `gpt-5.6-luna` | `medium` | 複数subsystemまたは大量資料を横断するread-only探索だけで最大1体起動する。利用不能なら親が継続して未使用を報告する |
| `$review` | `independent_reviewer` | `gpt-5.6-terra` | `high` | 分離したblind reviewとgoal適合reviewに2体を並行起動する。片方でも利用不能なら停止する |

これらのcustom agentはすべて`read-only`とし、spawn時のmodelまたはreasoning overrideを渡さない。`$implement`、`$git-commit-push-pr`、`$workflow-retrospective`はsubagentへ委譲せず、親エージェントが単独で実行する。全体のsubagent既定モデル、既定reasoning、同時実行数制限はproject-local設定へ追加しない。上表以外の一般subagentは、Codexの通常動作として親taskで選択した設定を継承する。ユーザーまたは管理者の上位設定によるoverrideはrepositoryの管理対象外とする。

`xhigh`、`max`、`ultra`は親エージェントのskill別推奨にもcustom agentの固定設定にも使わない。推奨設定で品質不足が確認された場合だけ、対象taskの親エージェントで明示的に選択する。

skillメタデータとproject-local `profiles`ではmodelを指定しない。親エージェントのmodel切替はcomposerだけで行い、custom agentの固定routingだけを`.codex/agents/*.toml`で管理する。モデルの役割とreasoningは[OpenAIモデルガイド](https://developers.openai.com/api/docs/guides/latest-model)、設定項目は[Codex Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、custom agentとsubagentの継承は[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)を根拠とする。

## 任意の壁打ち

`$kabeuchi`は標準の実装フローとは独立した、明示呼び出し専用のread-only相談である。現在の相談、確定済み判断、必要最小限のrepository evidenceだけをfreshな`product_advisor`へ渡す。親エージェントは助言を証拠と照合し、推奨案、トレードオフ、未確認事項、次に決めることを統合して返す。

壁打ちではファイル編集、plan作成、実装、Git操作、外部変更を行わない。変更が必要なら、相談を終えた後に対応するskillを別途明示実行する。

## 標準フロー

基本は次の順で進める。

1. `$plan`: goalと必要なUI prototypeを作る。
2. `$implement`: 現在のgoalとprototypeを承認して実装・検証する。
3. `$review`（必要な場合）: diffとgoalへの適合性をreviewする。
4. `$git-commit-push-pr`（明示依頼時）: commit、push、PRを行う。

plan成果物のcleanupは、この流れとは別の明示操作として行う。

### `$plan`

1. 最新要求、確定済み判断、採用済み資料を整理する。
2. repository、runtime、code、testを確認し、UI変更時はclosest live UIも確認する。複数subsystemまたは大量資料を横断し、独立した要約で親のcontextを節約できる場合だけ、最大1体の`project_explorer`を使う。
3. 自己完結した最終設計と`## 要件クロージャ`を`plans/<slug>/goal.md`へ書く。
4. UI変更時は完成UI、完全Cartesian matrixを持つ`ui-contract.json` version 1、coverage/risk/anchorを宣言する`parity-spec.json` version 3を作る。
5. goalを監査し、UI変更時はCSS build、contract/profile validation、coverage/full行数、revision計算を終えてから、返却直前に影響scopeのtargeted smokeを1回行う。
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

1. goal、prototype revision、validation profile digestを検証し、fresh runへ承認を記録する。新規UI planは`parity-spec.json` version 3、target全件の`browserSetups`、state identity assertion、coverage/anchor probe、risk row、source impact、batch/artifact policyを必須とする。
2. UI変更時はBrowserを開かず、HEAD、checkout mount、source、contract、deterministic coverage selectionを静的に検証する。
3. 通常は`coverage`を固定し、全target-state、target-viewport、target-theme、risk、anchorを選ぶ。`full`はrelease、CI、定期、明示要求の独立実行だけにする。
4. goalとUI契約に従って実装し、Browserを使わず対象testで確認する。
5. 変更riskに比例するtest、lint、typecheck、必要な場合だけbuild、diff checkを行う。
6. 完了候補ができた最後にruntime ownership/healthを読み戻し、common adapterと`prepare-run` / `next-batch` / `record-batch` / `record-failure` / `resume-run` / `invalidate-run` / `finalize-run`へ渡す。runnerがbounded batchを機械実行し、LLMへはcompact summaryだけを返す。
7. required coverageとcleanupのpass後だけschema version 4の最終証跡を書く。現在のinvocationにexact phrase `確認セッションを保持`がある場合だけ同じprototypeとownership検証済みappを確認セッションへhandoffし、なければagent-ownedなbaseline差分だけをcleanupする。

明示的な`$implement`実行自体を現在のgoal、revision、profile digestへの承認とする。「承認します」という別回答やrevision転記は不要である。静的gateの失敗はproduction差分0件のまま停止する。Browser unavailable、required probe失敗、再試行後のterminal tool failure、drift、欠落coverageは自動UI検証完了にせず、実装差分、検証済みcoverage、未実行row、stable code、人間確認項目を報告する。

`coverage`を通常既定とし、局所変更でも各targetの全state、全viewport、light/darkを最低1回確認する。具体的な交互作用はrisk row、詳細probeはanchor rowへ追加する。prototype・contract、global style、semantic token、共通shell、responsive規則を変更したという分類だけでは自動的にfullへ昇格しない。具体的な横断リスクと許可execution contextがある場合だけ、別の非LLM実行でfullを使う。

pre-editとaffectedのBrowser phaseは新規runで実行しない。同じassertionを追加sweepや個別manual checkで重複確認しない。common adapterはpure ESMとdata-only JSON batchだけを読み込み、freshな選択済みtab 1つでproductionからprototypeへ直列に移動する。task固有adapter、実行可能bundle、runtime shimを新設しない。時間による打ち切りは設けず、required coverage全pass、required probe failure、同じfailure batchの1回再試行後のterminal failure、cleanup/readback terminal failureのいずれかで終了する。

実装不具合の修正後は、target固有ならそのtarget、shared sourceなら宣言consumer、global style/theme/shellなら全targetを無効化する。影響しないpass rowとsource変更のない静的検証結果は再利用し、先頭からやり直さない。

局所変更は対象testとlint、typecheck、diff checkを基本とする。全testは無関係suiteへ波及し得る場合または信頼できる対象testがない場合、production buildはroute、configuration、bundling、server boundaryを変える場合またはrepositoryの明示要件がある場合だけ行う。

### `$review`

1. exact diffと必要なcontextを固定し、UI影響と構造化証跡を監査する。
2. blind diff reviewとgoal適合reviewを独立した履歴なし`independent_reviewer`で並行実行する。
3. `plans/<slug>/review/`へHTML reportを作り、desktopと390×844で確認する。現在のinvocationにexact phrase `確認セッションを保持`がある場合だけ、review、prototype、ownership検証済みappを同じslugの確認セッションへhandoffする。

HTML reportは実装を変更せず、`採用 / 却下 / 未確定`、comment、Markdown生成、copyを提供する。

#### レビュー後のフィードバック対応

1. 各指摘の判断とcommentを確定し、Markdownをcopyする。
2. goal、完成UI、interaction、contract、profileを変える場合は同じgoalへ`$plan`する。
3. 採用指摘がある場合は最新goalへ`$implement`する。
4. 必要なら再度`$review`する。
5. 出荷する場合だけ`$git-commit-push-pr`する。

現行goalへの実装逸脱、test不足、証跡不備だけなら2を省略する。focus trap、Tab循環、背景の`inert`化などUI契約を変える指摘は`$plan`後の別メッセージで`$implement`する。

```text
$plan plans/<slug>/goal.md
レビューHTMLで採用した指摘を同じplanへ反映してください。
<生成したMarkdown>

# $plan完了後
$implement plans/<slug>/goal.md
```

### `$git-commit-push-pr`

1. Git規約、状態、remote、GitHub認証、repository対応を確認してfetchする。
2. baseとtopic branchを解決し、protected branch上または安全条件を満たすdetached HEADならtopic branchを作る。
3. 未commit変更があればcurrent taskのpathだけをstageし、検証後に1件のcommitを作る。
4. 最新baseへ安全に同期する。
5. historyを書き換えずにpushし、localとremoteのSHA一致を確認する。
6. 同じheadのPRを作成するか、必要な箇所だけを更新する。
7. PRのbase/head OID、draft、mergeability、merge stateをreadbackして報告する。

現在のユーザーが明示した場合だけ実行する。detached HEADではremoteとGitHub repositoryを確認してfetchした後、HEADが唯一のbase候補の履歴内にあり、task path、index、未使用branch名が一意な場合だけ`git switch -c`で新規topic branchを作り、通常のshippingへ合流する。

`main`と`develop`のbase候補が競合する、別topicのcommitを含む、branch名が既存、同名branchを別worktreeが使用中、またはstaged scopeが曖昧な場合は、branch、index、remote、GitHubを変更せず停止する。停止報告にはrepository、full HEAD、baseとOID、未使用topic branch、task path、staged pathとdigest、index policy、必要なhistory decisionを実値で埋めた`次に送るプロンプト`を提示する。選択肢が複数ならplaceholderのない独立promptを提示し、ユーザーが一つを再送した時点でその値を明示判断として扱う。snapshotが一致すれば同じ停止理由を再質問せず、必要なexact pathのindex-only unstage、commit、同期、non-force push、PR作成または最小更新、readbackまで続行する。snapshotが変わっていれば何も部分適用せず、現在値から停止し直す。

force push、force-create、shared worktree checkout、stash、変更破棄、広域stage、自動競合解決、PR merge、CI待機は行わない。再開promptが許可できるindex変更は、列挙された対象外pathへの`git restore --staged --`だけとし、working treeを変更しない。競合、remote divergence、複数PR、認証・repository不一致など、再開promptが解消していない独立条件は停止条件とする。plan・review生成物は明示scope外ならstageも削除もしない。

最新baseが進んでいること自体は停止理由にしない。同期が必要な場合は、incoming base pathとtask外の未追跡・ignored artifactについて、同一path、祖先・子孫、file／directory／symlink置換の衝突がないことを確認し、path・type・内容digestのsnapshotを取る。indexとtracked working treeが同期可能であれば、非衝突artifactを元の場所に保持したまま、未公開branchは`git rebase --no-autostash`、公開済みbranchはhistoryを書き換えないmergeで同期し、成功後またはabort後にsnapshotを照合する。tracked dirty、local artifactとのpath衝突、semantic conflictは自動stash・一時移動・削除・復元を行わず停止する。

## 任意の振り返り

### `$workflow-retrospective`（別task推奨）

完了または意図的に中断したtaskを振り返る場合は、開発時間と振り返り時間を分離するため、新しいtaskから`$workflow-retrospective codex://threads/<thread-id>`を明示実行する。別taskから参照するsource taskが実行中なら監査しない。同じtaskで使う場合は開発完了後に限り、現在の振り返りturnを除いた完了済みturnだけを対象にする。

初回監査は追跡ファイルを変更せず、同じtaskの再監査で上書きする`plans/workflow-retrospectives/<thread-id>.md`だけを作る。現行contractで解消済みの問題を除外し、改善候補を最大3件へ優先順位付けする。候補IDをユーザーが明示選択した場合だけ、対象skill、本文書、共通runner、関連testの正確なallowlist内で改善する。P1とP2では必須工程、Browser実行、ユーザー確認、required command、skill instruction量を増やさない。

この操作を標準フローの末尾へ追加せず、`$plan`、`$implement`、`$review`から自動実行・自動提案・自動通知しない。一時reportは他のplan生成物と同様に`plans:cleanup`の対象になる。

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

`parity-spec.json` version 3にはdeterministic setup、state identity assertion、targetごとの`browserSetups`、全row mapping、coverage/anchor probe tier、axis順序、targetごとのanchor、risk row、全sourceのimpact、固定batch、artifact policyを記録する。coverage probeは全rowでroute、setup、state、viewport、theme、control、overflow、consoleをrequiredにし、screenshot・DOM・accessibility・style・geometry・focus・keyboard・networkはanchorへ限定する。version 1と2はlegacy read-only互換として維持する。正本は`.agents/skills/plan/references/parity-runner.md`とする。

plan中のsmokeはtargetedな代表desktopと390×844を基本とし、具体的なtheme、breakpoint、dialog、menu、keyboard、focusリスクだけを追加する。coverageとfullは`$plan`では実行しない。

### 承認と証跡

`$implement`はfreshな`plans/<slug>/evidence/<run-id>/`へ次を作る。`evidence/`とrun directoryはumaskに依存せず`0700`、canonical JSONは`0600`で排他的に作成し、既存pathのtype、symlink、realpath、mode不一致では修復せず停止する。

- `approval.json`: goal digest、prototype revision、profile digest
- `implementation-parity.json`: 完了候補の最後にcoverageまたはfullを実行した結果

新規parity fileはfinal-onlyのschema version 4とし、`matrixScope: coverage | full`、exact row、全target-state/viewport/theme coverage、risk、anchor、checkpoint/resume、required probe、digest、artifact index、cleanupを記録する。自動coverage、人間のUI承認、full parityは独立statusにする。既存schema version 1、2、3はlegacy read-onlyで暗黙に書き換えない。raw screenshot、DOM、accessibility treeはprivate artifactへ保存し、LLMには件数、失敗row ID、stable code、bounded diagnostic、checkpoint、cleanupだけを返す。全required coverage、capability、`390x844 / DPR 1`実測、artifact digest、CDP/viewport cleanup、workspace absenceが揃った場合だけ`finalize-run`がcanonical evidenceを排他的に作る。goal、prototype、contract/profile、source、fixture、authorization、query、route、Browser条件のdriftは承認または証跡を失効させる。

各targetのcovering matrix基本行数は`max(state数, viewport数, theme数)`である。18 target、5 state、8 viewport、2 themeの基準profileは通常144行、full 1,440行になる。risk/anchor座標が基本selection内なら重複させず昇格し、外なら一意な追加rowにする。

UIの最終的な視覚品質は人間が代表screenshotまたはURLを確認する。最終報告ではstate、viewport、theme、risk、anchorの自動結果と、pixel、余白、font rendering、視覚的完成度の人間判断、full parityの状態を分ける。

### Runtime所有権

1. Localはport 3000、worktreeはruntime manifestの割当portについて、関連process、container、Compose、dependencyのbaselineとownerを記録する。
2. implementationと静的検証が終わるまでBrowserとprototype serverを起動しない。
3. buildが必要な場合だけidentityを再確認し、agent-owned runtimeだけを停止する。
4. 完了直前に`./dev-compose.sh ensure`で実アプリを再利用または起動し、`./dev-compose.sh status`の`RUNTIME_OWNERSHIP=verified`、`ACTIVE_RUNTIME_HEALTH=healthy`、`RUNTIME_RESTART_REQUIRED=0`、PID/container、cwd、mount、Compose project、portを読み戻す。続いて`./dev-compose.sh status --url`のURLとprototypeでfinal parityを行い、`finalize-run`直前にも同じreadbackを繰り返す。
5. 最終確認後はworktreeだけ`./dev-compose.sh cleanup`を使い、baselineとの差分だけをcleanupする。

Localでは同じcheckoutのhealthyなnative Next.jsまたは正しいCompose `web`を`http://localhost:3000`で再利用する。worktreeではcanonical checkout pathから固有Compose projectとweb・PostgreSQL・Studio portを割り当て、DB、named volume、network、originを他checkoutと分離する。保持するnamed volumeのcreation identityはsession間で固定し、可変なcurrent session labelを理由にdatabase再作成を要求しない。worktreeはloopbackだけにbindし、LANとCloudflareはLocal専用とする。

記録にはPID、command、cwd、Compose project、checkout mount、container ID、URL、fixture、authorizationを含める。`prepare-run`の`--runtime-owner`と`--runtime-checkout`はこの外部readback値をcontract、current checkout、manifest、evidenceへ結び付ける宣言値であり、CLI自身はprocess、container、listener、mount、healthを検査しない。引数同士やcontractとの一致だけを実runtime所有権の確認として扱わない。

通常変更はHMRを使い、wrapperが自動再起動できるのはpending migration適用後のverified `web`だけとする。新規route、stale cache、package、runtime設定の変更は理由を報告し、明示的な`./dev-compose.sh restart web`（`Web restart`）操作を待つ。他serviceやproject全体を停止しない。ユーザー所有dev serverはbuildのために停止せず、安全な隔離buildができなければblockedとする。広域な`docker compose down`や既存resource、named volumeの削除は行わない。

## Workflowの検証

通常のcontract testは`npm test`、認証済みCodex CLIでのforward evalは`npm run eval:plan-skills`を使う。contract testは18×5×8×2 profileのcoverage 144行/full 1,440行、重複なし、risk/anchor tier、checkpoint/resume、target/shared/global invalidation、1回retry、compact summary、legacy readerを検証する。forward evalはplan smoke、invocation承認、coverage既定、full context制限、静的gate停止、terminal Browser failure、drift、raw output非返却、静的検証再利用を検証する。

CLI evalはCodexアプリ内Browserを代替しない。runtime所有権、build、migration起因のverified Compose `web` restart、live parity、cleanupの契約を変えた場合は、shipping前にCodex DesktopでLocal再利用、worktree分離、foreign owner停止、session限定cleanupの成功・停止経路をmanual確認する。

局所変更の評価でも宣言済み全state、viewport、theme coverageを省略しない。task固有adapter/shim、pre-edit/affected Browser、追加sweep、不要な全test/build、rowごとのLLM実況が0回であることを確認する。通常coverage、risk/anchor、checkpoint再利用とfull分離により、品質を落とさず直積・重複・context消費を削減できているかを評価する。

## 権限とcleanup

goalやskillは追加権限ではない。deploy、外部API書き込み、共有・本番DB変更、secret操作、削除、commit、push、PRには現在のユーザー依頼による権限が必要である。

`npm run plans:cleanup`は`plans/template.md`以外の削除候補をpreviewする。実際に削除する場合だけ、別の明示操作として`npm run plans:cleanup -- --apply`を使う。

active confirmation sessionのslugが削除候補に含まれる場合、applyは何も削除せず`./dev-confirmation.sh stop <slug>`を表示する。stateがmalformed、symlink、別checkoutの場合も所有権を推測せず停止する。
