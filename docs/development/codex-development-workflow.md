# Codex計画・実装・HTMLレビューワークフロー

## 目的

大きな変更を、goal、必要なUI prototype、production実装、独立reviewの順に進める。各skillは成果物を次の工程へ渡すだけの薄い役割とし、独自runtime、専用agent、固定model routing、lifecycle state machineは作らない。

skill本文は短い手順、referenceは詳細契約、scriptは反復する決定論的処理を担当する。この責務分離は[OpenAIのskill設計ガイド](https://learn.chatgpt.com/docs/build-skills)に従う。改善効果は成功率、完全性、token、latencyと、このworkflow固有のphase時間・操作回数で測り、[OpenAIの評価指針](https://developers.openai.com/api/docs/guides/latest-model)に沿ってforward evalとnegative controlを併用する。

## 成果物

`plans/template.md`だけを追跡し、生成物はplan単位で同じdirectoryへ置く。

```text
plans/
├── <slug>/
│   ├── goal.md
│   ├── prototype/
│   ├── evidence/
│   └── review/
└── template.md
```

`prototype/`はUI変更時、`evidence/`はUI変更を`$implement`する時、`review/`は`$review`実行時だけ作る。生成directoryはGitへ追加しない。

`plans/tmp/<slug>/prototype/`は、閲覧とCSS buildだけに使える後方互換pathである。parity、承認、実装、reviewの前にcanonical directoryへ移行する。

## 標準フロー

基本は次の順で進める。

1. `$plan`: goalと必要なUI prototypeを作る。
2. `$plan-critic`（任意）: goalとprototypeを独立reviewする。
3. `$implement`: 現在のgoalとprototypeを承認して実装・検証する。
4. `$review`（必要な場合）: diffとgoalへの適合性をreviewする。
5. `$git-commit-push-pr`（明示依頼時）: commit、push、PRを行う。

plan成果物のcleanupは、この流れとは別の明示操作として行う。

### `$plan`

`$plan`は次の順で進める。

1. `要求整理`: 最新要求、確定済み判断、採用済み資料を整理する。
2. `現状確認`: repository、runtime、関連するcodeとtestを確認し、UI変更時はclosest live UIも確認する。
3. `goal`: 自己完結した最終設計と要件クロージャを`plans/<slug>/goal.md`へ書く。
4. `UI prototype`（UI変更時）: 完成UI、`ui-contract.json`、`parity-spec.json`を作る。
5. `検証`: goalを最終監査し、UI変更時はCSS build、contract/profile validation、revision計算、影響scopeのsmokeも行う。
6. `フィードバック`: goal、prototype URL、revision、smoke結果、未確認事項を返す。

最新の明示要求、確定済み判断、採用済み資料からauthoritative requirements bundleを作る。repositoryとruntimeを確認し、UI変更では既存UIも確認して、`plans/<slug>/goal.md`へ自己完結した最終設計を書く。

全要件は`## 要件クロージャ`で、設計、prototype、テスト、完了条件へ対応付ける。UI変更では同じdirectoryにproduction-parity prototypeを作り、静的検証と変更target/stateのsmokeまででユーザーへURLを返す。フィードバック後は同じplanを最終設計として更新し、全matrixは実行しない。

### `$plan-critic`

`$plan-critic`は次の順で進める。

1. `対象解決`: 対象のgoalと必要なprototype、contract、profileを特定する。
2. `独立review`: freshな履歴なしsubagentで要件、設計、検証、UI parityを確認する。
3. `修正`: 採用済み要件とlive evidenceから一意に直せる欠陥だけを修正する。
4. `再検証`: goalを最終監査し、UI変更時はCSS build、contract/profile validation、revision再計算、影響scopeのsmokeも行う。
5. `結果報告`: 更新path、revision、smoke結果、修正内容、残るriskを返す。

goalとprototypeを独立reviewする。authoritative requirements bundleとclosest live production UIから一意に直せる欠陥は修正し、不足するprototypeまたはmanifestも決定論的に作成する。

UI変更の修正後はCSS build、contract/profile validation、revision再計算、変更範囲のsmokeを行う。新しい製品判断または不足するlive UI証拠が必要な場合だけ、ユーザーへ確認する。plan中に全matrixや承認状態を作り直さない。

### `$implement`

`$implement`は次の順で進める。

1. `承認取得`: goal、prototype revision、validation profile digestを検証してfresh runへ記録する。
2. `baseline`（UI変更時）: runtime、process、container、checkout mount、source、比較条件を記録する。
3. `pre-edit`（UI変更時）: production編集直前に全matrixを1回実行する。
4. `実装`: goalとUI契約に従ってproductionを変更し、affected rowを確認する。
5. `自動検証`: 対象scopeのtest、lint、typecheck、build、diff checkを行う。
6. `final`（UI変更時）: 最後の関連変更後に全matrixを1回実行して最終証跡を書く。
7. `cleanup・報告`: agent-ownedなbaseline差分だけを片付け、変更と検証結果を返す。

明示的な`$implement`実行を、解決したgoal、現在のprototype revision、validation profile digestへの承認とする。現在のagentがproduction実装と検証を行い、別の承認応答やgoal内の承認記録を要求しない。

UI変更ではproduction編集の前にruntimeと契約のdriftを確認し、全rowのpre-edit parityを1回実行する。実装中はaffected rowだけを確認し、最後の関連変更後に全rowのfinal parityを1回実行する。

具体的な停止条件、Browser条件、証跡形式は「Runtime phaseと所有権」と「UI prototype」に従う。

### `$review`

大きい変更、または意図をdiffだけで追いにくい変更を対象にする。blind diff reviewとgoal適合reviewを行い、`plans/<slug>/review/`へHTML reportを生成する。

UI変更では、diffとaffected codeからUI影響を独立分類する。revision helperをread-onlyで実行し、schemaと現在revisionを再検証する。

goalの`prototype revision`と、選択runの`approval.json`、`pre-edit-parity.json`、`implementation-parity.json`を再検証する。legacy planだけは従来のgoal/Markdown証拠をread-onlyで検証する。不一致は必須major findingとする。

#### レビュー後のフィードバック対応フロー

HTML report生成後は次の順で進める。

1. `HTML report`: 各指摘を`採用 / 却下 / 未確定`に分類し、必要なcommentを入力する。
2. `Markdown`: 対応する指摘をすべて確定し、フィードバックを生成・copyする。
3. `$plan`（契約変更時）: 採用した指摘を同じgoalとprototypeへ反映する。
4. `$plan-critic`（任意）: 更新したgoalとprototypeを独立reviewする。
5. `$implement`（採用指摘がある場合）: 現在のgoalとprototypeを承認し、修正・検証する。
6. `$review`（必要な場合）: 修正後のdiffとgoalへの適合性を再reviewする。
7. `$git-commit-push-pr`（明示依頼時）: commit、push、PRを行う。

HTML reportは指摘への判断を整理する成果物であり、画面上の選択だけではgoal、prototype、production実装を変更しない。次の依頼には対象の`plans/<slug>/goal.md`とcopyしたMarkdownを一緒に渡し、採用する指摘をユーザーの明示要求として伝える。採用指摘がなければ3から6を省略できる。

採用した指摘がgoal、完成UI、interaction、`ui-contract.json`、`parity-spec.json`のいずれかを変える場合は3から進める。たとえばfocus trap、Tab循環、背景の`inert`化はUI契約変更として扱う。`$plan`は採用内容をgoalとprototypeへ反映し、CSS build、revision再計算、影響scopeのsmokeまでを行う。`$plan-critic`を実行してprototypeまたは契約が変わった場合も、そこで再計算された最新revisionを5の対象とする。

採用した指摘が現行goalに既に定義された要件への実装逸脱、test不足、または証跡不備だけで、goalとUI契約を変えない場合は3と4を省略して5へ進む。`$implement` invocation自体が現在のgoal、prototype revision、validation profile digestへの承認なので、「承認します」という別回答やrevisionの転記は不要である。production変更と最終証跡はfresh runで作り直す。

UI契約変更を伴う依頼は、`$plan`の完了後に`$implement`を別のメッセージで実行する。

```text
$plan plans/<slug>/goal.md
レビューHTMLで採用した以下の指摘を、同じplanのgoal、prototype、ui-contract.json、parity-spec.jsonへ反映してください。
<生成したMarkdown>
```

必要な場合だけ、その完了後に次を実行する。

```text
$plan-critic plans/<slug>/goal.md
```

最後に、最新のgoalとrevisionへ次を実行する。

```text
$implement plans/<slug>/goal.md
```

### `$git-commit-push-pr`

`$git-commit-push-pr`は次の順で進める。

1. `preflight`: Git規約、状態、remote、GitHub認証、repository対応を確認してfetchする。
2. `branch`: baseとtopic branchを解決し、protected branch上ならtopic branchを作る。
3. `commit`（未commit変更がある場合）: current taskのpathだけをstageし、差分検証後に1件のcommitを作る。
4. `同期`: 最新baseをfetchし、公開状態に応じてrebaseまたはmergeする。
5. `push`: historyを書き換えずにpushし、localとremoteのSHA一致を確認する。
6. `PR`: 同じheadのPRを作成するか、必要な箇所だけを更新する。
7. `readback`: PRのbase/head OID、draft、mergeability、merge stateを確認して報告する。

現在のユーザーが明示した場合だけ、commit、push、PRを行う。実装やreviewから自動では実行しない。

force push、stash、変更破棄、広域stage、自動競合解決、PR merge、CI待機は行わない。競合、remote divergence、複数PR、GitHub認証またはrepository対応の不一致は停止条件とする。planとreviewの生成物は文脈であり、明示されたshipping scopeへ含まれない限りstageも削除もしない。

## Runtime phaseと所有権

UI workflowは次の順でruntimeを扱う。

1. baselineを記録する。
2. 実アプリとprototypeをpreflightする。
3. 所有権を確認してbuildする。
4. 実アプリを再確認し、最終parityを行う。
5. baselineとの差分だけをcleanupする。

### 1. baseline

preflightより前に、port 3000のLISTEN addressと関連resourceを記録する。対象はprocess、container、Compose service、volume、network、dependency artifactである。

各resourceには、該当するPID、stable resource IDまたはpath、cwd、command、runtime owner、container identity、checkout mountを記録する。既存項目と今回起動・生成する項目を区別する。

### 2. preflight

正しい既存runtimeだけを再利用する。存在しなければrepository標準導線で実アプリを起動し、実URLが正確に`http://localhost:3000`であることを確認する。

新規routeまたはstale dev cacheで再起動が必要な場合は、Compose project、対象checkout mount、`web` service identityを再確認して`./dev-compose.sh restart web`を実行できる。ユーザー所有runtimeでも追加確認は不要である。再起動前後のcontainer ID、mount、port、URL、fixture、authorizationを記録し、他serviceやproject全体は停止しない。

prototypeは`./dev-prototype.sh <slug>`で1回だけ起動する。そのPIDと`127.0.0.1` URLをBrowser preflightから最終parityまで再利用する。captured revisionが不変のまま終了した場合だけ再起動し、新しいPIDとURLを記録する。

### 3. build

checkoutまたはruntime outputを共有・置換し得るbuildの前に、今回のagentが起動・所有した実アプリだけをidentity再確認後に停止する。

対象checkoutまたはoutputを使うユーザー所有dev serverとは同時buildせず、そのserverも停止しない。現在の変更を正確に含む安全な隔離buildを使うか、ユーザーへ停止を依頼する。どちらもできなければbuildをblockedとする。

### 4. build後と最終parity

build後は、agent所有の実アプリを同じrepository標準導線と条件で再起動する。または、正しいユーザー所有runtimeを再利用する。

PID、cwd、command、owner、container、mount、実URL、fixture、authorizationを再確認する。同じprototype PID、URL、比較条件で最終parityを行う。

### 5. cleanup

最終parity後は、完全なbaselineとの差分だけをcleanupする。今回のagentだけが起動・生成した正確なPID、container、service、volume、network、dependency artifactを対象にする。

stable identityと所有権を再確認してから個別に停止または削除する。広域な`docker compose down`、`docker compose down -v`、project全体のstop、既存またはユーザー所有resourceの停止・削除は行わない。

## UI prototype

### 基本方針

prototypeは完成UI契約であり、wireframeや別productではない。data、persistence、authorization、backend side effectだけをmockとする。

既存shell、copy、component、Tailwind utility、semantic token、theme、responsive behavior、interaction、DOM、accessibilityは本番相当にする。

### Buildと配信

stylingは`app/globals.css`と本番Tailwind utilityを使う。次のcommandでcompileし、revisionを計算する。

```sh
node .agents/skills/plan/scripts/build-prototype-css.mjs plans/<slug>/prototype
node .agents/skills/plan/scripts/prototype-revision.mjs plans/<slug>/prototype
node .agents/skills/plan/scripts/parity-runner.mjs validate plans/<slug>/prototype
```

次のcommandでloopback配信する。

```sh
./dev-prototype.sh <slug>
```

revision helperは、対応する全artifact fileのrelative pathと内容から`sha256:<64hex>`を生成する。`ui-contract.json` version 1と`parity-spec.json` version 1もrevisionへ含める。

CSS build後にrevisionを計算し、parity runnerでmanifestとvalidation profileを検証する。

### UI契約

manifestは、次の3種類の情報を持つ。

- production baseline
- comparison conditions
- UIの状態と期待値

production baselineには、page、shell、共通component、global style、tokenを網羅する一意な`sources` inventoryを記録する。runtime owner、checkout、40桁commit SHA、canonical routeも含める。

comparison conditionsには、viewport、DPR、`scroll: {x, y}`、locale、theme、fixture、authorization、queryを記録する。`scroll`はexactに`x`と`y`だけを持ち、各surfaceの`window.scrollX`と`window.scrollY`を実測する。

UIの状態と期待値には、state、responsive、視覚的不変条件、意図した差分、interaction、`comparisonTargets`、不変なparity matrix行定義を記録する。goalの`UI契約`とmanifestを一致させる。

各targetは、安定ID、entry、production route、surfaceを持つ。各rowは、安定ID、`targetId`、一致するentry、route、surface、state、viewport、theme、breakpoint、期待するinvariantまたはdifference IDを持つ。

### Validation profile

`plans/<slug>/prototype/parity-spec.json` version 1は次を持つ。

- target/stateごとのproduction・prototype queryとallowlist action
- screenshot、DOM、accessibility、visibility、text、attribute、computed style、geometry、focus、console、networkのprobe
- manifest全rowとprobeの一対一mapping

actionは`click`、`press`、`focus`、`fill`、`waitForVisible`、`waitForHidden`だけを許可する。任意JavaScriptと外部URLをprofileへ入れない。詳細schemaとBrowser adapterは`.agents/skills/plan/references/parity-runner.md`を正本とする。

### 反復確認と承認

plan中は、変更target/stateを代表desktopと390×844でsmoke確認する。theme・token・native controlはlight/dark、responsive・shell・navigation・layoutは影響breakpoint全件、dialog・menu・keyboard・focusは該当interaction probeを追加する。ユーザーのフィードバック後も影響scopeだけを再実行し、全matrixは実行しない。

明示的な`$implement`実行を現在のgoal、prototype revision、validation profile digestへの承認とする。別の承認応答やgoal内承認状態は作らない。`$implement`後にこれらが変わった場合はproduction編集を止め、新しい`$implement`実行を必要とする。

### 構造化証跡

`$implement`はfreshな`plans/<slug>/evidence/<run-id>/`へ次を作る。

- `approval.json`: goal digest、prototype revision、profile digest、実行時刻、`explicit-$implement-invocation`
- `pre-edit-parity.json`: production編集直前のruntime/source条件と全row結果
- `implementation-parity.json`: 最後の関連変更後のruntime条件と全row結果

executed rowは各file内に1回だけ現れ、statusは`pass`または`fail`とする。未実行はfile欠落で表し、巨大なpending一覧を作らない。各surfaceのscrollは`{x, y, source: "window.scrollX/window.scrollY"}`で記録する。

### 実装前後の確認

`$implement`は`http://localhost:3000`と`./dev-prototype.sh <slug>`のURLをCodexアプリ内Browserでpreflightする。Browser sessionごとにcapability canaryを1回実行し、tab、viewport、DPR、network sourceを確認する。

最初のproduction編集の直前にruntime、HEAD、全baseline source、fixture、authorization、query、Browser条件を再照合し、`pre-edit`でmanifest全rowを1回実行する。失敗、drift、未説明差分、欠落rowがあればproduction差分0件のまま停止する。

実装中は`affected` rowだけを確認する。最後の関連変更後に`final`で全rowを1回実行する。その後のproduction、goal、prototype、contract/profile、source、fixture、authorization、query、route、Browser条件への関連変更は最終証拠を失効させる。

## Skill behavioral eval

### 自動eval

通常の`npm test`はskill contractとartifact graderを検証する。実際のCodex promptによるforward testは、認証済みCodex CLIが利用できる環境で次を実行する。

```sh
npm run eval:plan-skills
```

evalは、Codex CLIの`workspace-write` sandbox内に一時repositoryを作る。環境allowlist、出力量上限、artifact allowlistを適用し、通常のskill discoveryと明示`$skill` invocationを使う。modelは固定しない。

確認する主なcaseは、canonical plan生成、既存artifact衝突停止、要件漏れの復元、欠落prototype・manifest・profileの決定論的再構築、2回のfeedback中に全matrixを実行しないこと、`$implement` invocationによる承認証跡、pre-edit失敗時のproduction差分0件、stale revision/profile停止、全baseline sourceのdrift停止、Browser unavailable停止である。

runnerはprocess identity、process group、run marker、一時fixtureをcwdとして保持するprocessを再照合する。inspectorが完全に利用できなければ、結果を受理しない。

この仕組みは通常経路のcleanupであり、OS-level security boundaryではない。token、cwd、file descriptorをすべて捨てて別sessionへdetachする任意のhostile executableまで封じ込める必要がある場合は、container、PID namespace、cgroup、Job Object等を持つ隔離環境を使う。

### Manual integration gate

CLIのforward evalにはCodexアプリ内Browserがない。そのため、`$implement`のruntime所有権、build停止・再起動、最終live parity、cleanupの成功経路を代替検証したとは扱わない。

これらの契約またはdev server導線を変更した場合は、shipping前にCodex desktopでmanual integration gateを行う。基本手順は次のとおり。

1. `$plan`でprototype feedbackを2回行い、smokeだけが実行されることを確認する。
2. baselineとagent-owned resourceを記録する。
3. `$implement` invocationの承認証跡とproduction編集前の全parityを確認する。
4. agent-owned runtimeでbuild、最終parityを確認する。
5. verified user-owned Compose `web`の限定再起動と他resource保護を確認する。
6. 二つのreview passが並行実行され、agent-ownedな差分だけをcleanupすることを確認する。

実行記録には、日付、対象commit、baselineとfinalのprocess・container一覧、各command、Browserの実URL、matrix行ID別結果、cleanup後の差分を含める。

#### 1. baseline

port 3000に既存processがない状態でbaselineを採る。関連するprocess、container、service、volume、network、dependency artifactを記録する。

agentがrepository標準導線から起動・生成したresourceだけをagent-ownedとする。prototypeは`./dev-prototype.sh <slug>`で1回だけ起動し、そのPIDとURLをpreflightから最終parityまで再利用する。

#### 2. production編集前のparity

Codexアプリ内Browserで実アプリとprototypeを開く。現在のruntime、HEAD、全baseline sourceのworking treeを照合する。

同一fixture、authorization、query、viewport、DPR、`window.scrollX`と`window.scrollY`の実測値によるexact `scroll: {x, y}`、locale、theme、route、state、keyboard・focus条件でmanifestの全rowを実行する。

日付、revision/profile digest、実URL、runtime identity、source inventory、条件、row ID別の`pass|fail`結果を`pre-edit-parity.json`として記録する。

Browserまたは条件が欠けるnegative case、およびbaseline source、fixture、authorization、queryを一つずつdriftさせるnegative caseでは、production差分が0件であることを確認する。

#### 3. agent-owned runtime

共有outputを使うbuildの前に、agent-owned実アプリのidentityを再照合し、そのprocessだけを停止する。build後は同じrepository標準導線で再起動する。

PID、cwd、command、owner、mount、URLを再確認し、最終matrixの全rowをBrowserで実行する。

#### 4. user-owned runtime

別runで、対象checkoutまたはoutputを使うuser-owned dev serverを先に起動する。agentがそれを停止せず、同時buildもせず、安全な隔離buildまたは明示的なblockを選ぶことをcommand logとprocess生存で確認する。

#### 5. cleanup

cleanupはbaselineとの差分にあるagent-owned PID/container/service/volume/network/dependency artifactだけを対象にする。identityを再照合してから個別に停止または削除する。

baselineに存在したresource、user-owned resource、user-owned dependencyは維持する。verified `web` restart以外のユーザー所有resource操作と広域Compose停止commandが実行されていないこともcommand logで確認する。

記録にはphase別経過時間、shell command数、Browser操作数、全matrix実行回数を含める。plan feedback中の全matrixは0回、1回の`$implement`でpre-editとfinalは各1回、承認とverified `web` restartの追加ユーザー往復は0回を合格条件とする。

## HTML review

`$review`は変更を意図単位・リスク順にまとめる。blind reviewとgoal適合reviewをsource付きで保持し、画面では`採用 / 却下 / 未確定`、人間comment、Markdown生成、copyを提供する。

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

HTML reviewは、自動test、prototype parity、実アプリ確認の代わりにはならない。

## 権限とcleanup

goalやskillは追加権限ではない。deploy、外部API書き込み、共有・本番DB変更、secret操作、削除、commit、push、PRには、現在のユーザー依頼による権限が必要である。

`npm run plans:cleanup`は`plans/template.md`以外の削除候補をpreviewする。実際に削除する場合だけ、別の明示操作として`npm run plans:cleanup -- --apply`を使う。
