# Codex計画・実装・HTMLレビューワークフロー

## 目的

大きな変更を、自己完結したgoal、必要なUI prototype、production実装、独立レビューへ薄く受け渡す。独自runtime、専用agent、固定model routing、lifecycle state machineは作らない。

## 成果物

`plans/template.md`だけを追跡し、生成物はplan単位で同じdirectoryへ置く。

```text
plans/
├── <slug>/
│   ├── goal.md
│   ├── prototype/
│   └── review/
└── template.md
```

`prototype/`はUI変更時、`review/`は`$review`実行時だけ作る。生成directoryはGitへ追加しない。旧`plans/tmp/<slug>/prototype/`は閲覧とCSS buildのみを保つ後方互換pathであり、parity・承認・実装・reviewの前にcanonical directoryへ移行する。

## 標準フロー

1. `$plan`で最新の明示要求、確定済み判断、採用済み資料からauthoritative requirements bundleを作り、repository、runtime、既存UIを確認して`plans/<slug>/goal.md`を作る。全要件は`## 要件クロージャ`で設計、prototype、テスト、完了条件へ対応付ける。
2. UI変更では同じdirectoryにproduction-parity prototypeを作り、goalの正規値を`approval contract: plans/<slug>/prototype/ui-contract.json — version 1`としてapproval-criticalなUI契約をmanifestへ同期する。comparison conditionsの`scroll`は`window.scrollX`/`window.scrollY`実測値を持つexact object `{x, y}`とする。CSS build後はartifactと契約manifestを含むrevisionと実画面とのmachine parityを確認する。`prototype revision`、全rowを未実行時の`<row-id>=pending`または実行後の`<row-id>=pass|fail`として持つ`machineParityResults`、machine parity、UI承認は同じ`sha256:<64hex>`へ結び付け、rendered prototypeをユーザーが明示承認するまで`UI承認記録`は未承認とする。
3. 必要なら`$plan-critic`でgoalとprototypeを独立レビューする。authoritative requirements bundleとclosest live production UIから一意に直せるprototype欠陥や欠落prototype/manifestはcriticが修正または作成し、CSS build、revision再計算、全rowのpending化とUI承認reset、machine parityをやり直す。新しい製品判断または不足するlive UI証拠が必要な場合だけユーザーへ確認する。prototypeまたはmaterialなUI契約変更は以前のrow ID別parity evidence、machine parity、UI承認を無効化する。
4. `$implement`は承認済みgoalに従い、現在のagentがproduction実装と検証を行う。UI変更ではprototype revisionと承認記録を照合し、`http://localhost:3000`と`./dev-prototype.sh <slug>`のURLをCodexアプリ内Browserでpreflightする。その後、最初のproduction編集の直前に現在のruntime・HEAD・`productionBaseline.sources`全件のworking tree・fixture・authorization・query・`window.scrollX`/`window.scrollY`実測値を含むBrowser条件を契約と再照合し、manifestの全rowを`<row-id>=pass|fail`として実アプリとprototypeで実行したcurrent-run pre-edit parity証跡を別に作る。承認時証跡の日付だけでは代用できない。drift、未説明差分、欠落rowがあれば編集前に停止し、goal・manifest・prototype・machine parity・明示承認の更新を必須とする。実装後は承認済みprototypeとのlive parityを同じmatrixで確認し、最後の関連変更後に全行を再実行して`implementationParityResults`へ`<row-id>=pass|fail`を記録する。
5. 大きい、または意図をdiffだけで追いにくい変更は`$review`でblind diff reviewとgoal適合reviewを行い、`plans/<slug>/review/`へHTML reportを生成する。reviewはgoalの申告とは別にdiffとaffected codeからUI影響を分類し、UI変更ではrevision helperをread-only実行してschemaと現在revisionを再検証する。goalの4つのrevision field、manifest全rowの承認時・編集直前・実装後証拠の不一致は必須major findingとする。
6. commit、push、PRは現在のユーザーが明示した場合だけ`$git-commit-push-pr`で行う。plan成果物のcleanupはshippingとは別の明示操作とする。

## Runtime phaseと所有権

UI workflowは、process起動前baseline、preflight、build、最終parity、差分cleanupの順で扱う。

1. preflightより前にport 3000のLISTEN addressと関連するprocess、container、Compose service、volume、network、dependency artifactについてPID、stable resource IDまたはpath、cwd、command、runtime owner、container identity、checkout mountを記録し、既存項目と今回起動・生成する項目を区別する。
2. 正しい既存runtimeだけを再利用し、なければrepository標準導線で実アプリを起動して、実URLが正確に`http://localhost:3000`であることを確認する。prototypeは`./dev-prototype.sh <slug>`で1回だけ起動し、そのPIDと`127.0.0.1` URLをBrowser preflightから最終parityまで再利用する。承認済みartifactが不変のまま終了した場合だけ再起動して新しいPIDとURLを記録する。
3. checkoutまたはruntime outputを共有・置換し得るbuildの前には、今回のagentが起動・所有した実アプリだけをidentity再確認後に停止する。対象checkoutまたはoutputを使うユーザー所有dev serverとは同時buildせず、そのserverも停止しない。現在の変更を正確に含む安全な隔離buildを使うかユーザーへ停止を依頼し、どちらもできなければbuildをblockedとする。
4. build後はagent所有の実アプリを同じrepository標準導線と条件で再起動するか、正しいユーザー所有runtimeを再利用し、PID、cwd、command、owner、container、mount、実URL、fixture、authorizationを再確認する。同じprototype PID・URLと比較条件で最終parityを行う。
5. 最終parity後は完全なbaselineとの差分だけをcleanupする。今回のagentだけが起動・生成した正確なPID、container、service、volume、network、dependency artifactをstable identityと所有権の再確認後に個別停止または削除し、広域な`docker compose down`、`docker compose down -v`、project全体のstop、既存またはユーザー所有resourceの停止・削除は行わない。

## UI prototype

prototypeは完成UI契約であり、wireframeや別productではない。data、persistence、authorization、backend side effectだけをmockとし、既存shell、copy、component、Tailwind utility、semantic token、theme、responsive behavior、interaction、DOM、accessibilityを本番相当にする。

stylingは`app/globals.css`と本番Tailwind utilityを使い、次でcompileする。

```sh
node .agents/skills/plan/scripts/build-prototype-css.mjs plans/<slug>/prototype
node .agents/skills/plan/scripts/prototype-revision.mjs plans/<slug>/prototype
```

次でloopback配信する。

```sh
./dev-prototype.sh <slug>
```

revision helperは対応する全artifact fileのrelative pathと内容から`sha256:<64hex>`を生成し、`approval contract: plans/<slug>/prototype/ui-contract.json — version 1`のmanifestを必須入力として含める。manifestはproduction baselineのpage・shell・共通component・global style・tokenを網羅する一意な`sources` inventory、runtime owner・checkout・40桁commit SHA・canonical route、viewport・DPR・`scroll: {x, y}`・locale・theme・fixture・authorization・query、state、responsive、視覚的不変条件、意図した差分、interaction、`comparisonTargets`と不変なparity matrix行定義の正本であり、goalの`UI契約`と一致させる。`scroll`はexactに`x`と`y`だけを持ち、各surfaceの`window.scrollX`と`window.scrollY`を実測する。各targetは安定ID、entry、production route、surfaceを持ち、各行は安定ID、`targetId`、一致するentry/route/surface、state、viewport、theme、breakpoint、期待するinvariant/difference IDを持つ。実行結果、screenshot、DOM/a11y、computed style、console/network、日付、証拠pathはmanifestへ入れず、goalの`machineParityResults`、current-run pre-edit parity、実装報告の`implementationParityResults`へmanifest全rowを未実行時の`<row-id>=pending`または実行後の`<row-id>=pass|fail`として過不足なく一対一で記録する。bare IDやaggregate summaryは結果にならない。prototypeまたはmaterialなUI契約変更時はrevisionを更新し、旧row evidence、machine parity、UI承認を失効させる。machine parity、ユーザーUI承認、current-run pre-edit parity、実装後live parityは別々の証拠として扱う。

## Skill behavioral eval

通常の`npm test`はskill contractとartifact graderを検証する。実際のCodex promptによるforward testは、認証済みCodex CLIが利用できる環境で次を実行する。

```sh
npm run eval:plan-skills
```

evalはCodex CLIの`workspace-write` sandbox内の一時repository、環境allowlist、出力量上限、artifact allowlistを使い、canonical plan生成、既存artifact衝突停止、要件漏れの復元、欠落prototype/manifestの決定論的再構築、prototype自己修正と承認reset、stale revision停止、全baseline sourceのdrift停止、Browser unavailable停止を確認する。modelを固定せず、通常のskill discoveryと明示`$skill` invocationを使う。runnerはprocess identity、process group、run marker、一時fixtureをcwdとして保持するprocessを再照合し、inspectorが完全に利用できなければ結果を受理しない。これは通常経路のcleanupであり、token、cwd、file descriptorをすべて捨てて別sessionへdetachする任意のhostile executableまで封じ込めるOS-level security boundaryではない。その境界が必要な入力はcontainer、PID namespace、cgroup、Job Object等を持つ隔離環境で実行する。

CLIのforward evalにはCodexアプリ内Browserがないため、`$implement`のruntime所有権、build停止・再起動、最終live parity、cleanupを成功経路まで代替検証したとは扱わない。これらの契約またはdev server導線を変更した場合は、shipping前にCodex desktopで次のmanual integration gateを実行し、日付、対象commit、baselineとfinalのprocess/container一覧、各command、Browserの実URL、matrix行ID別結果、cleanup後の差分を記録する。

1. port 3000に既存processがない状態で、関連するprocess、container、service、volume、network、dependency artifactのbaselineを採り、agentがrepository標準導線から起動・生成したresourceだけをagent-ownedとして記録する。prototypeは`./dev-prototype.sh <slug>`を1回だけ起動し、そのPIDとURLをpreflightから最終parityまで再利用する。
2. production編集前にCodexアプリ内Browserで実アプリとprototypeを開き、現在のruntime・HEAD・全baseline sourceのworking treeを照合し、同一fixture、authorization、query、viewport、DPR、`window.scrollX`/`window.scrollY`実測値によるexact `scroll: {x, y}`、locale、theme、route、state、keyboard・focus条件でmanifestの全rowを実行する。日付、revision、実URL、runtime identity、source inventory、条件、`<row-id>=pass|fail`の結果をcurrent-run pre-edit parity証跡として記録する。Browserまたは条件が欠けるnegative case、およびbaseline source・fixture・authorization・queryを一つずつdriftさせるnegative caseではproduction差分が0件であることを確認する。
3. agent-owned実アプリでは、共有outputを使うbuild前にidentityを再照合してそのprocessだけを停止し、build後に同じ標準導線で再起動する。PID、cwd、command、owner、mount、URLを再確認し、最終matrix全行をBrowserで実行する。
4. 別runでは、対象checkout/outputを使うuser-owned dev serverを先に起動する。agentがそれを停止せず、同時buildもせず、安全な隔離buildまたは明示的なblockを選ぶことをcommand logとprocess生存で確認する。
5. cleanupはbaselineとの差分にあるagent-owned PID/container/service/volume/network/dependency artifactだけをidentity再照合後に個別停止または削除する。baselineに存在した、またはuser-ownedなresource・dependencyは維持する。広域Compose停止commandが実行されていないこともcommand logで確認する。

## HTML review

`$review`は変更を意図単位・リスク順にまとめ、blind reviewとgoal適合reviewをsource付きで保持する。画面は`採用 / 却下 / 未確定`、人間comment、Markdown生成とcopyを提供する。

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

HTML reviewは自動test、prototype parity、実アプリ確認の代わりにはならない。

## 権限とcleanup

goalやskillは追加権限ではない。deploy、外部API書き込み、共有・本番DB変更、secret操作、削除、commit、push、PRには現在のユーザー依頼による権限が必要である。

`npm run plans:cleanup`は`plans/template.md`以外の削除候補をpreviewする。実際に削除する場合だけ、別の明示操作として`npm run plans:cleanup -- --apply`を使う。
