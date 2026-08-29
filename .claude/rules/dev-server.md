# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 実アプリ

- preflightのprocess起動・再利用より前にbaselineを採る。port 3000のLISTEN address、PID、cwd、command、runtime ownerと、関連するprocess・container・Compose service・volume・network・dependency artifactのstable IDまたはpathを記録する。containerではcontainer identityと対象checkoutのmountも記録し、各項目が既存か今回起動・生成かを区別する。この完全なbaselineを所有権判断とcleanupの正本にする。
- 正しい既存serverは再利用する。存在しない場合だけ、DB依存を含むgoalではrepository標準のCompose導線、単体のNext.jsで足りるgoalでは`npm run dev`を使い、実URLを`http://localhost:3000`にする。別portや別originで代用しない。正しいCompose project、対象checkout mount、`web` service identityを再確認でき、新規routeまたはstale dev cacheの解消に必要な場合は、ユーザー所有runtimeでも確認を挟まず`./dev-compose.sh restart web`を実行してよい。再起動前後のcontainer ID、mount、port、URL、fixture、authorizationを記録する。他service、project全体、volumeは停止・削除しない。
- UI実装前にCodexアプリ内Browserが`http://localhost:3000`と`./dev-prototype.sh <slug>`の出力URLを開けることをpreflightする。明示的な`$implement`実行を、解決したgoal、現在のprototype revision、validation profile digestへの承認とする。最初のproduction編集の直前に、`productionBaseline.sources`全件のworking tree状態、HEAD、runtime owner・checkout・commit・mount・route、fixture・authorization・query、`window.scrollX`/`window.scrollY`実測値、その他のBrowser条件を契約と照合し、manifest全rowを共通parity runnerで1回実行する。Browser、URL、条件が利用できない、driftがある、または未説明差分があればproduction編集前に停止する。
- checkoutまたはruntime outputを共有・置換し得るbuildの前には、preflightで今回のagentが起動・所有したと確認できる実アプリだけを、PID・cwd・command・container identity・service identityを再照合して停止する。対象checkoutまたはoutputを使うユーザー所有のdev serverとbuildを同時実行せず、そのserverも停止しない。現在の変更を正確に含む安全な隔離buildを使うか、ユーザーへ停止を依頼し、どちらもできなければbuildはblockedと報告する。
- build後の最終確認では、agent所有の実アプリを同じrepository標準導線・同じ条件で再起動する。ユーザー所有serverを再利用する場合も含め、port 3000のLISTEN address、PID、cwd、command、runtime owner、container identity、checkout mount、実URL、fixture・authorizationなどの比較条件を再確認してからparityを実行する。
- UI変更はCodexアプリ内Browserでlight・dark双方のdesktopと390×844、影響するresponsive breakpointの直前・境界、主要操作、keyboard、focus、主要state、console、networkを確認する。`curl`やtestだけで実画面確認済みとしない。

## plan prototypeとHTMLレビュー

`plans/<slug>/prototype/`は次の軽量なloopback serverで配信する。引数なしではcanonical prototypeから最終更新されたものを自動選択し、canonicalが1件もない場合だけ`plans/tmp/<slug>/prototype/`へフォールバックする。このpathは閲覧とCSS buildの後方互換だけであり、parity、実装、reviewには使わない。それらの前にcanonical `plans/<slug>/prototype/`へ移行し、version 1 manifestとvalidation profileを作成する。対象を指定する場合だけslugを渡す。

```sh
./dev-prototype.sh
./dev-prototype.sh <slug>
```

`plans/<slug>/review/`は対象を明示して同じserver本体で配信する。

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

- 出力された`127.0.0.1`のURLをCodexアプリ内Browserで開く。
- UI実装preflightでは`./dev-prototype.sh <slug>`を1回だけ起動し、出力PIDとURLを保持して実装後の最終parityまで同じprocessを再利用する。2つ目を起動しない。artifactが不変のままprocessが終了した場合だけ再起動して新しいPID・URLを記録する。`$implement`が承認digestを取得した後にartifact、goal、またはvalidation profileが変わった場合は、production編集を止めて新しい`$implement`実行を必要とする。
- UI prototypeは作成前に最も近い実画面、shell、token、共通componentを確認する。mockにしてよいのはdata、永続化、authorization、backend side effectだけであり、brand、navigation、layout、typography、color、control、icon、responsive behaviorは本番相当とする。
- prototypeは本番と同じTailwind utilityと`app/globals.css`を使う。plan中は変更target/stateを代表desktopと390×844でsmoke確認し、theme・responsive・interactionのrisk tagに応じてlight/dark、breakpoint境界、keyboard/focusを追加する。全matrixはproduction編集直前と最終変更後に各1回実行する。
- prototypeの最終CSS build後に`prototype-revision.mjs`を実行し、goalの`approval contract: plans/<slug>/prototype/ui-contract.json — version 1`、`validation profile: plans/<slug>/prototype/parity-spec.json — version 1`、`prototype revision`を照合する。`ui-contract.json`は完全な`sources` inventory、runtime identity、comparison conditions、comparison target、不変なmatrix rowを保持する。`parity-spec.json`はstate setup、probe、row mappingを保持し、共通runnerがtab、viewport、DOM・a11y、computed style、focus、console、networkと実測scrollを検証する。
- HTML reviewはdesktopと390×844でリスクfilter、判断button、コメント、Markdown生成・copy、keyboard、focus、console、networkを確認する。
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- prototype確認、HTML review、実装後の実アプリ確認は別の証拠として扱う。
- Browserを利用できない場合は未検証と報告する。
- `$implement`は`plans/<slug>/evidence/<run-id>/approval.json`、`pre-edit-parity.json`、`implementation-parity.json`を作る。各executed rowは1回だけ現れ、statusは`pass`または`fail`とする。各surfaceのscrollは`{x, y, source: "window.scrollX/window.scrollY"}`として記録する。最後の関連変更後に全rowを再実行し、その後のproduction、prototype、goal、baseline source、fixture、authorization、query、route、Browser条件への関連変更は最終証拠を失効させる。
- 終了時は完全なbaselineとの差分だけをcleanupし、今回のagentだけが起動・生成した正確なPID・container・Compose service・volume・network・dependency artifactだけをstable identityと所有権の再確認後に個別停止または削除する。広域な`docker compose down`、`docker compose down -v`、project全体のstopは実行せず、既存またはユーザー所有のprocess、container、service、volume、network、dependencyを停止・削除しない。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
