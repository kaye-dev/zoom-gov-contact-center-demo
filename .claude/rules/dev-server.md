# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 確認範囲

UIはCodexアプリ内Browserで通常1〜3シナリオのsmokeを行い、prototypeの構成・主要な見た目との照合、大きなUI崩れと主要な正常系操作の完了を確認する。planは完成prototype、implementは静的検証後に同じ代表条件でprototypeと実アプリを表示して照合する。[共通検証契約](../../.agents/skills/plan/references/workflow-verification-contract.md)に従い、片方を表示できなければ視覚照合は未確認とする。reviewと出荷は有効な結果を再利用する。非UI変更は採用goalの限定検証を行う。

Browserを操作する前に、現在の公開API文書を読む。初期化・既読確認が必要ならtoolの手順に従い、reset後は文書とhandleを更新する。詳細は[Browser文書確認](../../.agents/skills/plan/references/browser-api-bootstrap.md)を参照する。公開APIによる通常操作を使い、未読を権限エラーと断定しない。権限拒否を別Browserや新taskで回避しない。

詳細parity、CDP canary、DPR固定、行列・全state・全境界の操作検証はこの手順に含めない。`curl`やtest、prototypeの表示だけで実アプリの保存成功とは報告しない。Browserが利用できない場合はUI未確認と報告し、実装修正を保持する。同じ障害の反復は打ち切り、検証基盤の整備を完了条件に追加しない。

## 実アプリの所有権

- 起動・再利用前に`./dev-compose.sh status`と必要なread-only process/Docker inspectionでbaselineを採る。割当port、LISTEN address、PID/container ID、cwd、command、owner、Compose project、checkout mount、serviceと今回作成する資源を照合する。
- Localは同じcheckoutのhealthyなnative Next.js processまたは正しいCompose `web`を`http://localhost:3000`で再利用する。worktreeは`./dev-compose.sh prepare`の固有project・DB・volume・networkと割当portを使い、別checkoutの3000を使わない。[開発用ポート](../../docs/development/development-ports.md)を守る。
- 実アプリのsmokeでは`./dev-compose.sh ensure`を1回実行し、その最終statusの所有権検証済み`PRODUCTION_URL`を使う。進行中に外側status、固定sleep、poll、追尾logを重ねない。失敗時だけ同projectのbounded diagnosticを各1回取得する。
- 通常変更はHMRへ任せる。pending migration後のwrapper所有Compose `web`への反映を除き、restartは理由を示した明示`./dev-compose.sh restart web`操作で行う。
- ユーザー所有serverと同じoutputへbuildしない。隔離buildを使うか必要な停止を依頼する。task所有serverを停止する場合もPID/cwd/command/container/serviceを再照合する。build後にsmokeが必要なら同じcheckoutのruntimeをensureして確認する。

## 管理画面ログイン

Codexが所有権確認済みのローカルruntimeで管理画面へログインする場合は、次の順序を守る。

1. `./dev-compose.sh exec web npm run db:check-seed-admin`を実行する。この確認はread-onlyで、出力はパスワードを含まないJSONとする。
2. `MISSING`の場合だけ`./dev-compose.sh exec web npm run db:seed-admin`を実行し、checkを再実行する。
3. `PRESENT_STANDARD`では現在のseed用credentialでログインを1回試す。この状態はpassword一致を保証しない。
4. `PRESENT_NONSTANDARD`または既存ユーザーのログイン失敗ではseedを自動実行しない。ユーザーへ状態と影響を報告する。
5. ユーザーがローカルseed管理者のパスワード復旧を明示的に承認した場合だけ、`./dev-compose.sh exec web env NODE_ENV=development CONFIRM_LOCAL_SEED_ADMIN_PASSWORD_RESET=1 npm run db:reset-seed-admin-password`を実行する。実行後はcheckとログインを再確認する。

`db:reset-seed-admin-password`は`NODE_ENV=development`、確認変数、local／Compose DB hostをすべて検証する。対象ユーザーが存在しなければ失敗し、ユーザーを新規作成しない。成功時はcredential passwordを現在の`SEED_ADMIN_PASSWORD`へ更新し、パスワード変更要求を解除して対象ユーザーの既存sessionを削除する。name、role、ban状態、access role assignment、他ユーザー、migration、named volumeは変更しない。パスワード、hash、接続URLをログへ出力しない。

## prototypeとHTML report

新規prototypeは共通Next.js hostでTSXと既存表示componentを使う。rootの依存を再利用し、`app/styles/ui-foundation.css`、選択prototype、採用時のshared sourceとhostをTailwindの探索範囲とする。mockはdata・永続化・authorization・backend副作用に限定する。`node scripts/prototype-runtime.mjs check <slug>`で対象の型・lintを確認してから次のloopback serverで配信する。通常のNext.js buildやplan別installは不要。旧HTMLは従来のCSS builderを使う。

```sh
./dev-prototype.sh <slug>
./dev-prototype.sh --retain <slug>
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

返されたloopback URLを使い、`file://`、外部CDN/API/analytics、repository全体の公開は行わない。新規は`entry.tsx`、既存HTMLは`index.html`を入口にし、両方の併存は曖昧な入口として拒否する。詳細は[prototype authoring](../../.agents/skills/plan/references/ui-prototype-quality.md)に従う。parity manifestやrevision helperの実行を前提にしない。

Next.js hostのcacheは`.local/prototype-runtime/<slug>/.next`に隔離し、HTMLと同じartifact slot/PID/token契約で配信する。初回routeの応答を待ってreadyを返す。Next.jsのcold起動は最大60秒の単一待機とし、通常編集はHMR、同じslugはprocessを再利用する。失敗時に外側pollや別portを追加しない。停止は当該process・upgrade socket・登録だけを終了し、cacheと採用sourceを保全する。

implementの照合では一致する既存prototype serverを再利用するか、`./dev-prototype.sh <slug>`で一時配信する。照合のためにprototypeを編集せず、新たな保持sessionを作らない。今回起動した一時配信processだけを終了し、planで保持済みのserverは残す。

planは静的確認後に`./dev-prototype.sh --retain <slug>`を完了まで待ち、コマンド終了後の別呼出しで`./dev-confirmation.sh status <slug>`を1回実行する。成功した保持URLに必要なtenant/view等のqueryを付け、同じprocessで返却直前の最終smokeを行う。保持前後でsmokeを二重実行しない。URL、PID、owner、確認結果、`./dev-confirmation.sh stop <slug>`を返す。確認セッションはcheckoutごとに同時に1 slugだけで、他slugを暗黙停止しない。

保持サーバーのstdioは親のpipeに接続せず、起動結果をIPCで通知する。初回readyは対象routeのGET本文受信完了を意味し、親終了後の応答はstatusで別に確認する。statusは所有tokenと対象routeのGET本文を期限付きで確認し、PID/LISTEN/root HEADだけを成功根拠にしない。

保持後のtimeout/HTTP失敗はruntimeの実失敗であり、Browser利用不可とは区別する。HTTP成功でBrowserだけ利用不能ならUI未確認とする。失敗時は当該ownerのprocess・出力先・ログのbounded diagnosticを各1回取得し、認可scope内の修正と必要な再起動だけを行う。未解決のURLは到達不能と報告する。別port/別Browserへの回避、無制限poll、他slug/checkoutや所有不明PIDの停止は行わない。修正版を取り込んだcheckoutから所有serverを再起動して適用し、他セッションを一括変更しない。

```sh
./dev-confirmation.sh start <slug> prototype
./dev-confirmation.sh start <slug> review
./dev-confirmation.sh attach-app <slug>
./dev-confirmation.sh status <slug>
./dev-confirmation.sh stop <slug>
```

implementの実アプリ保持とreviewのreport保持は、現在のinvocationにexact phrase `確認セッションを保持`がある場合だけ行う。reviewではreportだけを保持し、実アプリやprototypeを起動・attachしない。HTML reportのcanonical assetsが未変更ならdesktopと390×844のload・console・networkを確認する。reportのinteraction変更時だけ影響操作を確認する。report確認と製品UI確認、保持URLのavailabilityは別の結果として報告する。

並列checkoutの稼働状況は任意のcheckoutで`./dev-compose.sh wt`を実行して確認する。非対話実行は一覧だけを表示する。TTYでは矢印キーで移動し、Enter/Spaceで対象を選択、`s`で確認画面へ進み、Enterで停止する。これはユーザーが明示選択した停止操作だけに許可される例外であり、選択checkoutの確認session、Compose service、CWDとNext.js commandを照合できるnative processを対象とする。所有権を検証できないresourceは停止せず、named volumeは保持する。停止・cleanup成功後は、LISTEN・稼働container・保持sessionが残っていないことを再検証してポート予約とruntime manifestを解除し、次回prepareで再割当する。失敗時は割当を保全する。

## cleanup

終了時はbaselineとの差分のうちtask所有と証明できる資源だけをcleanupする。worktreeは`./dev-compose.sh cleanup`でsession labelと一致するcontainer・networkを扱い、named volumeを保持する。Local cleanupはno-opとする。

active confirmation sessionがexact runtimeを保持している間、environment cleanupは削除0件でskipする。`./dev-confirmation.sh stop <slug>`で一致するsession IDを渡した場合だけ通常の所有権guardを通す。広域な`docker compose down`、`docker compose down -v`、volume削除、既存/ユーザー所有process・container・serviceの停止は禁止する。

非UIの起動ツール変更でgoalが限定runtime確認を要求する場合は、所有baselineを採り隔離fixtureまたは所有slotだけを検証できる。Codex設定は`.codex/config.toml`、Claude Code設定は`.mcp.json`を参照する。
