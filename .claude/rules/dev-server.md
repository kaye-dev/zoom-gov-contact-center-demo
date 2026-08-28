# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 実アプリ

- preflightのprocess起動・再利用より前にbaselineを採る。port 3000のLISTEN address、PID、cwd、command、runtime ownerと、関連するprocess・container・Compose service・volume・network・dependency artifactのstable IDまたはpathを記録する。containerではcontainer identityと対象checkoutのmountも記録し、各項目が既存か今回起動・生成かを区別する。この完全なbaselineを所有権判断とcleanupの正本にする。
- 正しい既存serverは再利用する。存在しない場合だけ、DB依存を含むgoalではrepository標準のCompose導線、単体のNext.jsで足りるgoalでは`npm run dev`を使い、実URLを`http://localhost:3000`にする。別portや別originで代用せず、ユーザーの既存processは停止・置換しない。
- UI実装前にCodexアプリ内Browserが`http://localhost:3000`と`./dev-prototype.sh <slug>`の出力URLを開けることをpreflightする。承認時の日付や証跡は現在runの代用にならない。最初のproduction編集の直前に、`productionBaseline.sources`全件のworking tree状態、HEAD、runtime owner・checkout・commit・mount・route、fixture・authorization・query、`window.scrollX`/`window.scrollY`を実測したexact `scroll: {x, y}`、その他の実Browser条件を承認済み契約と照合し、manifestの全row IDを同じ実アプリとprototypeで再実行する。そのcurrent-run pre-edit parity証跡はrevisionと全rowを`<row-id>=pass|fail`として一対一に紐付け、bare IDを結果扱いしない。Browser、URL、必要な条件が利用できない、driftがある、または未説明差分がある場合は承認時証跡を失効扱いとし、production編集前に停止する。
- checkoutまたはruntime outputを共有・置換し得るbuildの前には、preflightで今回のagentが起動・所有したと確認できる実アプリだけを、PID・cwd・command・container identity・service identityを再照合して停止する。対象checkoutまたはoutputを使うユーザー所有のdev serverとbuildを同時実行せず、そのserverも停止しない。現在の変更を正確に含む安全な隔離buildを使うか、ユーザーへ停止を依頼し、どちらもできなければbuildはblockedと報告する。
- build後の最終確認では、agent所有の実アプリを同じrepository標準導線・同じ条件で再起動する。ユーザー所有serverを再利用する場合も含め、port 3000のLISTEN address、PID、cwd、command、runtime owner、container identity、checkout mount、実URL、fixture・authorizationなどの比較条件を再確認してからparityを実行する。
- UI変更はCodexアプリ内Browserでlight・dark双方のdesktopと390×844、影響するresponsive breakpointの直前・境界、主要操作、keyboard、focus、主要state、console、networkを確認する。`curl`やtestだけで実画面確認済みとしない。

## plan prototypeとHTMLレビュー

`plans/<slug>/prototype/`は次の軽量なloopback serverで配信する。引数なしではcanonical prototypeから最終更新されたものを自動選択し、canonicalが1件もない場合だけ旧`plans/tmp/<slug>/prototype/`へフォールバックする。旧pathは閲覧とCSS buildの後方互換だけであり、machine parity、UI承認、実装、reviewには使わない。それらの前にcanonical `plans/<slug>/prototype/`へ移行し、version 1 manifestとrevision-bound evidenceを再作成する。対象を指定する場合だけslugを渡す。

```sh
./dev-prototype.sh
./dev-prototype.sh <slug>
```

`plans/<slug>/review/`は対象を明示して同じserver本体で配信する。

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

- 出力された`127.0.0.1`のURLをCodexアプリ内Browserで開く。
- UI実装preflightでは`./dev-prototype.sh <slug>`を1回だけ起動し、出力PIDとURLを保持して実装後の最終parityまで同じprocessを再利用する。2つ目を起動しない。承認済みartifactが不変のままprocessが終了した場合だけ再起動して新しいPID・URLを記録する。artifact変更時はrevision、machine parity、明示UI承認を更新するまで実装を継続しない。
- UI prototypeは作成前に最も近い実画面、shell、token、共通componentを確認する。mockにしてよいのはdata、永続化、authorization、backend side effectだけであり、brand、navigation、layout、typography、color、control、icon、responsive behaviorは本番相当とする。
- prototypeは本番と同じTailwind utilityと`app/globals.css`を使い、light・dark、desktop、390×844、関連breakpoint境界、主要state、keyboard、focus、DOM・a11y、computed style、console、networkを比較する。
- Browserや自動比較の合格はmachine parityであり、ユーザーのUI承認ではない。rendered prototypeの明示承認前にproduction実装を開始しない。
- prototypeの最終CSS build後に`prototype-revision.mjs`を実行し、goalの`approval contract: plans/<slug>/prototype/ui-contract.json — version 1`、`prototype revision`、row ID別`parity evidence`、machine parity、UI承認を照合する。後ろの4記録には同じ`sha256:<64hex>`を記録する。`ui-contract.json`はpage・shell・共通component・global style・tokenを含む完全な`sources` inventory、runtime owner・checkout・commit・route、fixture・authorization・queryとexact `scroll: {x, y}`を含むcomparison conditions、`comparisonTargets`、各matrix rowの`targetId`を保持する。`scroll.x`と`scroll.y`は各surfaceの`window.scrollX`と`window.scrollY`実測値にする。manifest外の`machineParityResults`と`implementationParityResults`は全rowを未実行時の`<row-id>=pending`または実行後の`<row-id>=pass|fail`として過不足なく1回ずつ持ち、bare IDや`all N`で代用しない。内容変更後はrevisionを再計算し、旧row evidence、machine parity、承認を失効させる。
- HTML reviewはdesktopと390×844でリスクfilter、判断button、コメント、Markdown生成・copy、keyboard、focus、console、networkを確認する。
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- prototype確認、HTML review、実装後の実アプリ確認は別の証拠として扱う。
- Browserを利用できない場合は未検証と報告する。
- 最後の関連変更後にmatrix全行を再実行し、`implementationParityResults`へ各行を`<row-id>=pass|fail`として記録する。その後のproduction、prototype、goal、baseline source inventory・commit、fixture・authorization・query、route、`scroll: {x, y}`を含む比較条件への関連変更は実装後parity証拠を失効させる。
- 終了時は完全なbaselineとの差分だけをcleanupし、今回のagentだけが起動・生成した正確なPID・container・Compose service・volume・network・dependency artifactだけをstable identityと所有権の再確認後に個別停止または削除する。広域な`docker compose down`、`docker compose down -v`、project全体のstopは実行せず、既存またはユーザー所有のprocess、container、service、volume、network、dependencyを停止・削除しない。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
