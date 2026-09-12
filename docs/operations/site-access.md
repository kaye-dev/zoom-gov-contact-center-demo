# デモ入口と限定公開の運用

[English](site-access.en.md)

`http://localhost:<port>/`は自治体・大学の入口です。リンクは同じportの`lg.localhost`と`univ.localhost`に進みます。本番の登録済みHost、Preview等の未登録Hostの既存フォールバックは変わりません。localhostの一般下層URLは入口へ戻ります。管理画面のURL・認証は既存のままです。

## 設定と閲覧

管理画面の「メンテナンス管理」で、既存メンテナンスフォームの後にある「限定公開」を保存します。環境（Development / Preview / Production）はHostと既存の環境判定から決まり、画面で別環境を指定できません。

- 全体共通、自治体、大学を独立保存します。入口は共通設定、各業種は「共通またはその業種」が限定公開ならコードが必要です。業種を公開にしても共通制限は解除できません。
- 有効な共通コードはすべての業種、有効な業種コードはその業種に使えます。共通制限中の入口は有効な業種コードでも通過できますが、別業種への権限は与えません。
- コードは半角英数字8〜64文字で大文字小文字を区別します。初回有効化にはコードが必要です。既存コードがある場合は空欄で維持します。平文の再表示はできません。
- 有効期間は認証から1日（24時間）が既定で、正の整数日を設定できます。日時として表現できない値は拒否します。ブラウザーの保存期間が短い場合は早く再入力が必要です。
- 入口・自治体・大学はそれぞれ初回入力が必要です。cookieはhost-onlyで、ホスト横断ログインを行いません。
- 公開切替、日数、コードを保存するとそのスコープのrevisionが進み、そのスコープで発行した認証が失効します。他スコープの認証は維持します。
- VIEW権限で閲覧、UPDATE権限で変更します。共通設定は両業種への権限がある場合だけ表示・更新できます。競合時は入力が残るため、内容を確認してから再読み込みしてください。

既存メンテナンスは閲覧認証の後に適用されます。コードを入力してもメンテナンスは解除されません。中立な入口には自治体のメンテナンスを適用しません。

## 外部受付と保護境界

限定公開中の対象業種への外部受付は、APIキーや閲覧cookieにかかわらず、保存・enqueue・外部呼出し前に503 `SITE_RESTRICTED`を返します。管理者認証と操作権限を持つ管理APIからの発信・同期は維持します。解除後の受付は再開しますが、Webhookの再試行・欠落回収や受理済み処理の取消は保証しません。

| 経路 | 分類・対象 |
| --- | --- |
| `/admin`、`/admin/**`、`/api/admin/**` | 既存管理認証・権限を維持 |
| `/api/auth/**`、`/api/account/change-password`、`/api/password-reset-requests`、旧ログインredirect | 管理認証フロー |
| `/access`、`POST /api/site-access/verify` | 閲覧認証。Origin、入力、試行上限を検証 |
| `/api/public/v1/**` | 外部予約API、自治体 |
| `/api/disaster-radio-subscriptions`、`/api/municipal-notification-registrations` | 外部登録、自治体 |
| `/api/zaad/municipal/**`、`/api/internal/zaad/municipal/**` | 自治体のWebhook・処理受付 |
| `/api/zaad/provider-events`、`/api/university-notification-registrations` | 外部受付、大学 |
| GET/HEAD `/api/municipal-notification-options`、`/api/university-notification-options` | 対応する業種の閲覧補助。別Hostでも対象業種の制限を適用 |
| GET `/api/public/consultation-availability` | Hostの業種の閲覧補助 |
| `/api/docs-md/**`、一般ページ、RSC、文書、sitemap | 閲覧認証対象。拡張子で除外しない |
| その他のAPI・Webhook | 対象不明の外部受付。いずれかの制限中は503 |
| `/_next/static/**`、開発HMR、theme-init、明示favicon、robots、health | 基盤の限定allowlist。画像optimizerは許可faviconだけ除外 |

未認証のHTML遷移は307で認証画面へ、RSC・POST・文書等は401です。制限中の応答はprivate/no-storeか同等のno-storeとし、noindexを維持します。設定欠落、不正値、DB読取障害は503で閉じます。認証試行はDBで15分窓あたり10回まで共有計数します。Vercelで検証された転送元IPだけを信頼し、それ以外では任意の転送ヘッダーを使わず共通bucketで制限します。

## DB・リリース・復旧

`20260912090000_add_site_access_control`は3環境×3スコープを公開・1日・revision 1で作成します。既存のメンテナンス行は変更しません。`site_access_settings`、`site_access_sessions`、`site_access_attempts`、`site_access_audits`を追加します。コードはsalt付きscrypt、sessionは256bit乱数tokenのSHA-256 digestのみ保存します。監査はscope・環境・revision・actor・日時だけです。期限切れsession/試行行は認証時に各100行以内で削除します。

新アプリの公開前に通常の承認済みmigration手順で追加migrationを適用してください。DB接続先はread/write endpointが必要です。本変更自体はProductionへのmigrationやdeployを行いません。既存deploy smokeが公開HTMLの200を要求する構成では、限定公開の307/401を成功とは扱いません。リリース検証時の公開設定と期待値を事前に確認してください。

解除は管理画面で対象スコープを公開に戻します。DB障害時はDBを復旧してから再確認します。rollbackでは全スコープを公開へ戻すか、旧アプリにgateがないことを踏まえて外部アクセスを別途遮断してから戻してください。保全のため追加テーブルを直ちに削除しないでください。既にダウンロードされた内容や静的JSを秘密保管領域として扱うことはできません。
