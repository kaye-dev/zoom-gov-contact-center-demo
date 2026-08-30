# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 実アプリ

- preflightのprocess起動・再利用より前にbaselineを採る。port 3000のLISTEN address、PID、cwd、command、runtime ownerと、関連するprocess・container・Compose service・volume・network・dependency artifactのstable IDまたはpathを記録する。containerではcontainer identityと対象checkoutのmountも記録し、各項目が既存か今回起動・生成かを区別する。この完全なbaselineを所有権判断とcleanupの正本にする。
- 正しい既存serverは再利用する。存在しない場合だけ、DB依存を含むgoalではrepository標準のCompose導線、単体のNext.jsで足りるgoalでは`npm run dev`を使い、実URLを`http://localhost:3000`にする。別portや別originで代用しない。正しいCompose project、対象checkout mount、`web` service identityを再確認でき、新規routeまたはstale dev cacheの解消に必要な場合は、ユーザー所有runtimeでも確認を挟まず`./dev-compose.sh restart web`を実行してよい。再起動前後のcontainer ID、mount、port、URL、fixture、authorizationを記録する。他service、project全体、volumeは停止・削除しない。
- UI実装前はCodexアプリ内Browserを開かず、prototype serverも起動しない。明示的な`$implement`実行を、解決したgoal、現在のprototype revision、validation profile digestへの承認とする。production編集前は`productionBaseline.sources`全件のworking tree状態、HEAD、checkout・mount、contract/profile、matrix selectionだけを静的に照合する。完了候補ができた最後に`http://localhost:3000`と`./dev-prototype.sh <slug>`の出力URLを開き、runtime owner・checkout・commit・mount・route、fixture・authorization・query、`window.scrollX`/`window.scrollY`実測値、その他のBrowser条件と選択rowを1回確認する。
- checkoutまたはruntime outputを共有・置換し得るbuildの前には、preflightで今回のagentが起動・所有したと確認できる実アプリだけを、PID・cwd・command・container identity・service identityを再照合して停止する。対象checkoutまたはoutputを使うユーザー所有のdev serverとbuildを同時実行せず、そのserverも停止しない。現在の変更を正確に含む安全な隔離buildを使うか、ユーザーへ停止を依頼し、どちらもできなければbuildはblockedと報告する。
- buildを実行した場合の最終確認では、agent所有の実アプリを同じrepository標準導線・同じ条件で再起動する。ユーザー所有serverを再利用する場合も含め、port 3000のLISTEN address、PID、cwd、command、runtime owner、container identity、checkout mount、実URL、fixture・authorizationなどの比較条件を再確認してからparityを実行する。
- UI変更はCodexアプリ内Browserで影響するtarget、state、theme、viewport、responsive breakpoint、操作、keyboard、focus、console、networkを確認する。局所的またはviewport固有の変更へ無関係なtheme・desktop・breakpointを追加しない。global style・token・shell・navigation・横断responsive変更ではlight・dark双方のdesktopと390×844および影響境界を含むfull matrixを使う。`curl`やtestだけで実画面確認済みとしない。

## plan prototypeとHTMLレビュー

`plan/<slug>/prototype/`は次の軽量なloopback serverで配信する。引数なしではcanonical prototypeから最終更新されたものを自動選択する。対象を指定する場合だけslugを渡す。

```sh
./dev-prototype.sh
./dev-prototype.sh <slug>
```

`plan/<slug>/review/`は対象を明示して同じserver本体で配信する。

```sh
node scripts/serve-plan-artifact.mjs plan/<slug>/review
```

- 出力された`127.0.0.1`のURLをCodexアプリ内Browserで開く。
- `$implement`ではimplementationと静的検証が終わった後に`./dev-prototype.sh <slug>`を1回だけ起動し、final parityまで同じprocessを使う。2つ目を起動しない。`$implement`が承認digestを取得した後にartifact、goal、またはvalidation profileが変わった場合は、新しい`$implement`実行を必要とする。
- UI prototypeは作成前に最も近い実画面、shell、token、共通componentを確認する。mockにしてよいのはdata、永続化、authorization、backend side effectだけであり、brand、navigation、layout、typography、color、control、icon、responsive behaviorは本番相当とする。
- prototypeは本番と同じTailwind utilityと`app/globals.css`を使う。plan中は変更target/stateを代表desktopと390×844でsmoke確認し、theme・responsive・interactionのrisk tagに応じてlight/dark、breakpoint境界、keyboard/focusを追加する。`$implement`中は`targeted`を既定とし、prototype・contract、global style・token、shell layout・navigation構造、横断responsive規則、複数の無関係target、または明示要求を変える場合だけ`full`を使う。
- prototypeの最終CSS build後に`prototype-revision.mjs`を実行し、goalの`approval contract: plan/<slug>/prototype/ui-contract.json — version 1`、`validation profile: plan/<slug>/prototype/parity-spec.json — version 1`、`prototype revision`を照合する。`ui-contract.json`は完全な`sources` inventory、runtime identity、comparison conditions、comparison target、不変なmatrix rowを保持する。`parity-spec.json`はstate setup、probe、row mappingを保持し、共通runnerがtab、viewport、DOM・a11y、computed style、focus、console、networkと実測scrollを検証する。
- HTML reviewのcanonical assetsが未変更ならdesktopと390×844のload、console、networkだけを確認する。リスクfilter、判断button、コメント、Markdown生成・copy、keyboard、focusの全確認はassetsまたはruntime contractが変わった場合だけ行う。
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- prototype確認、HTML review、実装後の実アプリ確認は別の証拠として扱う。
- Browserを利用できない場合は未検証と報告する。
- 新規`$implement`は`plan/<slug>/evidence/<run-id>/approval.json`とschema-version-3 `implementation-parity.json`だけを作る。Browserは完了候補ができた最後に1回だけ使い、pre-edit/affected parityを作らない。最終fileは`matrixScope`とselectionを持ち、各executed rowは1回だけ現れ、statusは`pass`または`fail`とする。各surfaceのscrollは`{x, y, source: "window.scrollX/window.scrollY"}`として記録する。その後の関連変更は最終証拠を失効させる。同じBrowser assertionを追加sweepや個別manual checkで重複確認せず、task固有の大規模adapterやruntime shimをfeature実装中に作らない。
- 終了時は完全なbaselineとの差分だけをcleanupし、今回のagentだけが起動・生成した正確なPID・container・Compose service・volume・network・dependency artifactだけをstable identityと所有権の再確認後に個別停止または削除する。広域な`docker compose down`、`docker compose down -v`、project全体のstopは実行せず、既存またはユーザー所有のprocess、container、service、volume、network、dependencyを停止・削除しない。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
