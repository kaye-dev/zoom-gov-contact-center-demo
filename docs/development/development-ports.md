# 開発用ポートの固定範囲

## 利用範囲と割り当て

Browserで利用する範囲はslot 0〜5です。同じcheckoutにはアプリとartifact（prototypeまたはHTML review）のポートを一組で予約します。

| 用途 | 通常checkout（slot 0） | worktree（slot 1〜5） |
| --- | --- | --- |
| アプリ | 3000 | 3001〜3005 |
| prototype / HTML review | 4000 | 4001〜4005 |

slot nはアプリ3000+n、artifact4000+nです。現在のallocatorはworktreeにslot 10まで（3001–3010／4001–4010）を割り当てるため、Browser利用範囲に収まる保証はありません。既存予約や外部のポート占有により、5 worktree以下でもslot 6以上を返す場合があります。出力URLが上表の範囲外ならBrowserを開かず作業を止め、予約状況を確認してください。HOST_PORTやleaseを手編集したり、他者のprocessを停止したり、権限を自動拡大したりしません。

予約はユーザー単位の`~/.local/state/zoom-gov-contact-center-demo/development-ports`で共有し、停止後も保持します。別リポジトリの通常checkout同士は同じ組を同時に使えません。割り当て時はlock、IPv4/IPv6 listener、Compose公開portを確認します。枯渇・固定port競合・所有者不明・lease破損ではエラーになり、allocatorの範囲外へfallbackしません。

## 起動・再利用・停止

アプリの割り当て確認と起動には次を使います。`prepare`は割り当てを準備し、`ensure`は所有権を確認したhealthyなアプリを再利用するか、必要なサービスを起動します。

```sh
./dev-compose.sh prepare
./dev-compose.sh status
./dev-compose.sh ensure
```

prototype単独の起動ではDocker・DB・アプリを起動しません。引数なしでは最新のcanonical prototypeを選び、slug指定で対象を固定します。保持する場合は`--retain`を使います。

```sh
./dev-prototype.sh
./dev-prototype.sh <slug>
./dev-prototype.sh --retain <slug>
```

HTML reviewも同じartifact serverを使います。同じcheckoutで起動できるartifactは1つです。同一slug/surfaceは所有者とPIDを確認して再利用し、異なるslug/surfaceが稼働中なら停止方法を表示します。

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
./dev-confirmation.sh start <slug> review
./dev-confirmation.sh attach-app <slug>
./dev-confirmation.sh status <slug>
./dev-confirmation.sh stop <slug>
```

`attach-app`は既存の確認セッションへ所有権確認済みのアプリを関連付けます。通常の停止は予約を保持するため、再起動後も同じURLを使います。起動出力のURL、PID、PORT_SLOT、PORT_ALLOCATION_SCHEMAとownerを確認してください。

予約が不要になった場合はstatusのownerを使って明示的に解放します。Web/artifactと関連Composeサービスが起動中なら解放できません。

```sh
node scripts/development-port-allocation.mjs status --checkout <checkout>
node scripts/development-port-allocation.mjs release --checkout <checkout> --owner <statusで確認したowner>
```

allocatorのstatusはschemaVersion、slot、appPort、artifactPort、ownerをJSONで返します。runtimeの割り当ては`.codex/runtime.local.env`で管理し、HOST_PORTやCOMPOSE_PROJECT_NAMEを手作業で指定しません。

## Browserの権限登録

次の各6件、合計12 originを登録します。

| アプリ | prototype / HTML review |
| --- | --- |
| `http://**.localhost:3000` | `http://127.0.0.1:4000` |
| `http://**.localhost:3001` | `http://127.0.0.1:4001` |
| `http://**.localhost:3002` | `http://127.0.0.1:4002` |
| `http://**.localhost:3003` | `http://127.0.0.1:4003` |
| `http://**.localhost:3004` | `http://127.0.0.1:4004` |
| `http://**.localhost:3005` | `http://127.0.0.1:4005` |

`**.localhost`はlocalhost自身とサブドメインを含みます。`127.0.0.1`は別originであり、その3000番台はprototype用登録には使いません。ポートのwildcardは使えません。GUIでは保存されたホスト名とポートを確認してください。

`browser_use.origins`のallowは通常のサイト/CDP承認チェックを続行できる設定であり、承認そのものを付与しません。登録完了は実CDP/DPR操作の成功を意味しません。一次情報は[Browser origin設定](https://learn.chatgpt.com/docs/config-file/config-reference)を参照してください。

## 移行

`PORT_MIGRATION_REQUIRED`はruntimeまたは保持セッションの移行が必要な状態です。既存manifestと保持セッションはstatus・所有権照合付きstopで扱えます。移行対象のWeb/artifactが稼働中なら移行は拒否され、自動停止しません。

1. `./dev-compose.sh status`と、保持中なら`./dev-confirmation.sh status <slug>`でcheckout・owner・対象processを確認する。
2. 対象のCompose Webは`./dev-compose.sh stop web`、artifactは`./dev-confirmation.sh stop <slug>`で明示的に停止する。native Webは確認した所有processの起動元で停止する。DBは維持する。
3. `./dev-compose.sh migrate-ports`を実行する。
4. 返されたURLとslotが利用範囲内であることを確認してから、`./dev-compose.sh ensure`と必要なprototype起動を実行する。

WebとDB/Studioのslotは独立しています。LocalのDB/Studioは5432/5555、worktreeは15432–16231／25555–26354を使います。移行ではDB container、port、volume/config identity、networkを保持します。保持volumeのcreation identityはsession間で固定し、現在のsession labelを理由に再作成しません。所有権が一致しない場合は停止します。広域な`docker compose down`やvolume削除は行わず、対象外の資源を保全します。

移行トランザクションは追跡対象外の`.codex/port-migration.local.json`に保存します。manifest確定前の失敗では移行前のmanifestを保持し、今回作成した予約だけを所有状態の再確認後に取り消します。確定後の書き込み中断も含め、復元が必要な場合はWeb/artifactを停止して`./dev-compose.sh migrate-ports --rollback`を使います。owner、journalのdigest、manifest、allocation identity、復元先portを再検証し、不一致や競合がある場合は復元を拒否します。

parity証跡は原本を保持します。実行可能なorigin条件を満たさないrunは再開・確定できません。originが変わる場合は新runを作成し、過去の合格行やURL文字列を書き換えて転用しません。
