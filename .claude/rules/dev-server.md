# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 実アプリ

- 通常の`$implement`は実アプリ、prototype、Browser、CDP、Playwright、Computer Useを起動・操作せず、静的検証で完了する。以下の実アプリ規約は、release、CI、定期、またはユーザーがproduction UIのruntime/parity確認を明示した独立taskにだけ適用する。
- preflightのprocess起動・再利用より前に`./dev-compose.sh status`とread-onlyなprocess・Docker inspectionでbaselineを採る。Localはport 3000、worktreeは`.codex/runtime.local.env`の割当portについて、LISTEN address、PIDまたはcontainer ID、cwd、command、runtime owner、Compose project、checkout mount、service、volume、network、dependency artifactのstable IDまたはpathを記録する。各項目が既存か今回起動・生成かを区別し、この完全なbaselineを所有権判断とcleanupの正本にする。
- 正しい既存serverは再利用する。Localでは同じcheckoutのhealthyなnative Next.js processまたは正しいCompose project・mountの`web`を`http://localhost:3000`で再利用する。worktreeでは`./dev-compose.sh prepare`が割り当てた固有Compose project、DB、volume、networkと、`3100-3899`内の`http://localhost:<allocated-port>`を使い、別checkoutの3000を使わない。起動が必要な場合だけ`./dev-compose.sh ensure`を使う。通常変更はHMRに任せ、自動的な`web`再起動はpending migration適用後にwrapperが所有するCompose runtimeへ反映する場合だけとする。migration以外のstale cache・package・設定変更では理由を報告し、明示的な`./dev-compose.sh restart web`操作なしに再起動しない。
- 独立runtime検証では、`./dev-compose.sh ensure`を1回実行し、その最終出力が返した所有権検証済みURLと必要なprototype URLを開く。runtime owner・checkout・commit・mount・route、fixture・authorization・query、`window.scrollX`/`window.scrollY`実測値、その他のBrowser条件と選択rowを確認する。ensure進行中の外側status、固定sleep、poll、追尾logは禁止し、失敗時だけ同じprojectのbounded diagnosticを各1回取得する。
- checkoutまたはruntime outputを共有・置換し得るbuildの前には、preflightで今回のagentが起動・所有したと確認できる実アプリだけを、PID・cwd・command・container identity・service identityを再照合して停止する。対象checkoutまたはoutputを使うユーザー所有のdev serverとbuildを同時実行せず、そのserverも停止しない。現在の変更を正確に含む安全な隔離buildを使うか、ユーザーへ停止を依頼し、どちらもできなければbuildはblockedと報告する。
- buildを実行した場合の最終確認では、agent所有の実アプリを`./dev-compose.sh ensure`で同じcheckout固有runtimeへ戻す。ユーザー所有serverを再利用する場合も含め、同commandの最終statusにある割当portのLISTEN address、PIDまたはcontainer ID、cwd、command、runtime owner、Compose project、checkout mount、`PRODUCTION_URL`、fixture・authorizationなどの比較条件を再確認してからparityを実行する。`finalize-run`直前のdrift readback以外に外側statusを重ねない。
- 独立parity検証ではCodexアプリ内Browserで宣言されたscopeを確認する。`coverage`は各targetの全state、全viewport、light/darkを最低1回含み、具体的なresponsive・permission・failure・dialog・keyboard・focus・networkの交互作用はrisk row、詳細な視覚/DOM/a11y/style/geometryはanchor rowで補完する。full Cartesian parityはrelease、CI、定期、明示要求に限定する。`curl`やtestだけで実画面確認済みとしない。

## 管理画面ログイン

Codexが明示された独立runtime検証で管理画面へログインする場合は、次の順序を守る。通常の`$implement`ではこの手順を実行しない。

1. `./dev-compose.sh exec web npm run db:check-seed-admin`を実行する。この確認はread-onlyで、出力はパスワードを含まないJSONとする。
2. `MISSING`の場合だけ`./dev-compose.sh exec web npm run db:seed-admin`を実行し、checkを再実行する。
3. `PRESENT_STANDARD`では現在のseed用credentialでログインを1回試す。この状態はpassword一致を保証しない。
4. `PRESENT_NONSTANDARD`または既存ユーザーのログイン失敗ではseedを自動実行しない。ユーザーへ状態と影響を報告する。
5. ユーザーがローカルseed管理者のパスワード復旧を明示的に承認した場合だけ、`./dev-compose.sh exec web env NODE_ENV=development CONFIRM_LOCAL_SEED_ADMIN_PASSWORD_RESET=1 npm run db:reset-seed-admin-password`を実行する。実行後はcheckとログインを再確認する。

`db:reset-seed-admin-password`は`NODE_ENV=development`、確認変数、local／Compose DB hostをすべて検証する。対象ユーザーが存在しなければ失敗し、ユーザーを新規作成しない。成功時はcredential passwordを現在の`SEED_ADMIN_PASSWORD`へ更新し、パスワード変更要求を解除して対象ユーザーの既存sessionを削除する。name、role、ban状態、access role assignment、他ユーザー、migration、named volumeは変更しない。パスワード、hash、接続URLをログへ出力しない。

## plan prototypeとHTMLレビュー

`plans/<slug>/prototype/`は次の軽量なloopback serverで配信する。引数なしではcanonical prototypeから最終更新されたものを自動選択する。対象を指定する場合だけslugを渡す。

```sh
./dev-prototype.sh
./dev-prototype.sh <slug>
./dev-prototype.sh --retain <slug>
```

`plans/<slug>/review/`は対象を明示して同じserver本体で配信する。

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

保持する確認セッションは次で操作する。checkoutごとに同時に1 slugだけを許可し、別slugを暗黙停止しない。

```sh
./dev-confirmation.sh start <slug> prototype
./dev-confirmation.sh start <slug> review
./dev-confirmation.sh attach-app <slug>
./dev-confirmation.sh status <slug>
./dev-confirmation.sh stop <slug>
```

- 出力された`127.0.0.1`のURLをCodexアプリ内Browserで開く。
- `$implement`では`dev-prototype.sh`、`dev-compose.sh`、`dev-confirmation.sh`を実行しない。承認digest取得後にartifact、goal、またはvalidation profileが変わった場合は、新しい`$implement`実行を必要とする。
- UI planは返却直前のsmoke後に`./dev-prototype.sh --retain <slug>`を使い、URL、PID、owner、停止commandを返す。`$review`は現在のinvocationにexact phrase `確認セッションを保持`がある場合だけHTML reportのretain入口を使う。保持surfaceのlive状態はproduction UIのverification合格を意味しない。
- UI prototypeは作成前に最も近い実画面、shell、token、共通componentを確認する。mockにしてよいのはdata、永続化、authorization、backend side effectだけであり、brand、navigation、layout、typography、color、control、icon、responsive behaviorは本番相当とする。
- prototypeは本番と同じTailwind foundationである`app/styles/ui-foundation.css`を使い、prototype自身だけをTailwind sourceとして探索する。plan中は変更target/stateを代表desktopと390×844でtargeted smoke確認し、具体的なtheme・responsive・interaction riskだけを追加する。coverageとfullは許可された独立実行に限定する。
- prototypeの最終CSS build後に`prototype-revision.mjs`を実行し、goalの`approval contract: plans/<slug>/prototype/ui-contract.json — version 1`、`validation profile: plans/<slug>/prototype/parity-spec.json — version 3`、`prototype revision`を照合する。`ui-contract.json`は完全な`sources` inventory、runtime identity、comparison conditions、comparison target、不変なCartesian matrix rowを保持する。`parity-spec.json`はstate setup/assertion、coverage/anchor probe、risk row、source impact、batch/artifact policyを保持する。
- HTML reviewのcanonical assetsが未変更ならdesktopと390×844のload、console、networkだけを確認する。リスクfilter、判断button、コメント、Markdown生成・copy、keyboard、focusの全確認はassetsまたはruntime contractが変わった場合だけ行う。
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- prototype確認、HTML review、独立runtime検証は別の証拠として扱う。
- Browserを利用できない場合は未検証と報告する。
- 新規`$implement`がUI承認境界で作るのは`plans/<slug>/evidence/<run-id>/approval.json`だけであり、`implementation-parity.json`は作らない。schema-version-4 parity evidenceは独立実行だけが作成する。最終fileはcoverage/full scope、exact row、全軸coverage、risk、anchor、checkpoint、artifact、cleanupと自動coverage・人間承認・fullの独立statusを持つ。既存schema version 1から4はread-only互換として扱い、task固有adapterやruntime shimをfeature実装中に作らない。
- 終了時は完全なbaselineとの差分だけをcleanupする。worktreeは`./dev-compose.sh cleanup`でsession baseline差分とruntime/session labelが一致するcontainer・networkだけを削除し、named volumeを保持する。exact runtimeをactive confirmation sessionが保持している間のenvironment cleanupは削除0件でskipし、`./dev-confirmation.sh stop <slug>`から一致するsession IDが渡された場合だけ通常のownership guardを通す。保持するvolumeはcreation sessionとconfig digestを安定した所有identityとしてmanifestへ残し、次sessionの可変labelで再作成対象にしない。Local cleanupはno-opとする。広域な`docker compose down`、`docker compose down -v`、project全体のstop、volume削除は実行せず、既存またはユーザー所有のprocess、container、service、volume、network、dependencyを停止・削除しない。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
