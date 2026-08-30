# 目的と完了条件

## 目的

管理画面の「予約システム」から予約専用APIキーを発行・無効化し、全キーで共有する月間リクエスト上限を管理できるようにする。外部システムはキーごとに付与された5つの独立権限だけを使って、デモ予約を除く実予約の一覧取得、1件取得、登録、部分更新、削除を行える。Zoom Virtual Agentそのものとの接続は行わず、将来の連携先がBearer APIキーで予約管理を実行できる管理・認証・月間利用制御・API境界までを実装する。

## 完了条件

- `/admin/reservations` の見出しaction群に「APIキー管理」が表示され、`/admin/reservations/api-keys` へ遷移できる。
- 予約システムの `VIEW` 権限を持つ管理者はAPI仕様、発行済みキーmetadata、当月利用数、月間上限を閲覧でき、`UPDATE` 権限を併せ持つ管理者だけがキーを発行・無効化し、上限を変更できる。
- 発行時にキー名と `LIST`、`READ`、`CREATE`、`UPDATE`、`DELETE` のうち1つ以上を選択でき、選んでいない権限の公開APIは `403` になる。
- raw APIキーは暗号学的乱数から生成され、発行成功responseと成功dialogで一度だけ表示される。DB、通常の一覧response、log、client永続storeにはraw値を残さない。
- `GET /api/public/v1/reservations`、`GET /api/public/v1/reservations/:id`、`POST /api/public/v1/reservations`、`PATCH /api/public/v1/reservations/:id`、`DELETE /api/public/v1/reservations/:id` が下記契約とstatus codeに従って動作する。
- 公開APIの登録・更新は既存サービスcatalog、予約可能期間、曜日・時間枠、容量を検証し、同時実行でも容量超過を作らない。公開APIは `isDemo=false` の予約だけを返し、変更し、削除する。
- 月間上限は全5 endpoint・全有効APIキーで共有し、100件以上を設定できる。10,000件までは1件単位、10,000件を超える値は100件単位とし、「上限なし」も選べる。
- 有効なAPIキーで認証できたrequestをAsia/Tokyoの暦月単位で原子的に集計し、上限到達後のrequestは `429 RESERVATION_API_MONTHLY_LIMIT_EXCEEDED` になる。翌月は新しい月のcounterを使い、自動的に0件から開始する。
- 追加DDLは既存データを破壊しないexpand-compatible migrationとして作成し、review済みmigration manifestと固定chainを同期する。
- 日本語、英語、簡体字、繁体字、韓国語の辞書、light/dark、desktop/390px、dialogのkeyboard/focus、VIEW-only、empty stateが完成UI契約を満たす。
- 対象test、isolated PostgreSQL integration test、lint、typecheck、routeを含むproduction buildが成功する。

## 要件クロージャ

| 要件 | goal内の設計 | prototype | テスト | 完了条件 |
| --- | --- | --- | --- | --- |
| 予約システム画面からAPIキー管理へ遷移できること | `# 実装方針` の「管理画面」と `## UI契約` | `prototype/reservation.html` の `representative` state | `test/reservations.test.ts` の `reservation API key management entry` case | `/admin/reservations` に「APIキー管理」が表示され、`/admin/reservations/api-keys` へ遷移する |
| 管理者がキー名と1つ以上の権限を指定してAPIキーを発行できること | `# インターフェースとデータフロー` の「管理API」 | `prototype/index.html?state=issue-dialog` | `test/integration/reservation-api-route-runtime.test.ts` の `admin issues one-time reservation API key` case | 有効な名前と1つ以上の権限で `201` とmetadataおよびraw keyが一度だけ返る |
| 発行APIが権限0件、重複権限、未知権限、未知field、不正な名前を拒否すること | `# インターフェースとデータフロー` の「管理API」 | `prototype/index.html?state=issue-dialog` の権限validation | `test/reservation-api.test.ts` の `issue payload rejects invalid names and permissions` case | 各不正payloadが `400` と `RESERVATION_API_INVALID_REQUEST` を返し、DBに行を作らない |
| raw APIキーが発行直後に一度だけ表示され、再表示されないこと | `# 実装方針` の「APIキーの秘密情報境界」 | `prototype/index.html?state=issued-secret` | `test/reservation-api-keys.test.ts` の `raw key exists only in issue result` case | raw keyは発行成功時だけ取得でき、一覧、DB、再読込後のUIに現れない |
| APIキーごとにLIST権限を独立して制御できること | `# インターフェースとデータフロー` の「公開APIとscope」 | `prototype/index.html?state=issue-dialog` の `LIST` checkbox | `test/integration/reservation-api-route-runtime.test.ts` の `LIST scope is exact` case | `LIST` ありのキーだけが `GET /api/public/v1/reservations` を `200` で利用でき、なしは `403` になる |
| APIキーごとにREAD権限を独立して制御できること | `# インターフェースとデータフロー` の「公開APIとscope」 | `prototype/index.html?state=issue-dialog` の `READ` checkbox | `test/integration/reservation-api-route-runtime.test.ts` の `READ scope is exact` case | `READ` ありのキーだけが `GET /api/public/v1/reservations/:id` を `200` で利用でき、なしは `403` になる |
| APIキーごとにCREATE権限を独立して制御できること | `# インターフェースとデータフロー` の「公開APIとscope」 | `prototype/index.html?state=issue-dialog` の `CREATE` checkbox | `test/integration/reservation-api-route-runtime.test.ts` の `CREATE scope is exact` case | `CREATE` ありのキーだけが `POST /api/public/v1/reservations` を `201` で利用でき、なしは `403` になる |
| APIキーごとにUPDATE権限を独立して制御できること | `# インターフェースとデータフロー` の「公開APIとscope」 | `prototype/index.html?state=issue-dialog` の `UPDATE` checkbox | `test/integration/reservation-api-route-runtime.test.ts` の `UPDATE scope is exact` case | `UPDATE` ありのキーだけが `PATCH /api/public/v1/reservations/:id` を `200` で利用でき、なしは `403` になる |
| APIキーごとにDELETE権限を独立して制御できること | `# インターフェースとデータフロー` の「公開APIとscope」 | `prototype/index.html?state=issue-dialog` の `DELETE` checkbox | `test/integration/reservation-api-route-runtime.test.ts` の `DELETE scope is exact` case | `DELETE` ありのキーだけが `DELETE /api/public/v1/reservations/:id` を `204` で利用でき、なしは `403` になる |
| 外部システムがBearer APIキーで認証でき、欠落、不正、無効化済みキーを利用できないこと | `# 実装方針` の「APIキーの秘密情報境界」と `# インターフェースとデータフロー` の「認証」 | `prototype/index.html` の公開API説明 | `test/integration/reservation-api-route-runtime.test.ts` の `Bearer authentication fails closed` case | 有効なBearer keyだけが認証され、欠落、不正、無効化済みkeyは `401`、`WWW-Authenticate: Bearer`、`RESERVATION_API_UNAUTHORIZED` になる |
| 外部システムが実予約一覧をfilter付きcursor paginationで取得できること | `# インターフェースとデータフロー` の「GET collection」 | `prototype/index.html` の公開API `LIST` 行 | `test/integration/reservation-api-route-runtime.test.ts` の `LIST filters and cursor pagination` case | `serviceKey`、`dateFrom`、`dateTo`、`limit`、`cursor` が契約どおり動き、`isDemo=false` の `items` と `nextCursor` だけを返す |
| 外部システムが予約IDから実予約1件を取得でき、demo行または存在しないIDを見分けず404にできること | `# インターフェースとデータフロー` の「GET item」 | `prototype/index.html` の公開API `READ` 行 | `test/integration/reservation-api-route-runtime.test.ts` の `READ hides demo and missing items` case | 実予約は `200`、demo行と存在しないIDは同じ `404` と `RESERVATION_API_NOT_FOUND` になる |
| 外部システムが有効なservice、日付、開始分で実予約を登録できること | `# インターフェースとデータフロー` の「POST item」 | `prototype/index.html` の公開API `CREATE` 行 | `test/integration/reservation-api-route-runtime.test.ts` の `CREATE validates catalog and creates non-demo booking` case | 有効payloadは `201` で `isDemo=false` の行を作り、不正field、過去、期間外、受付外、未知slotは `400` になる |
| 外部システムが実予約の指定fieldだけを部分更新できること | `# インターフェースとデータフロー` の「PATCH item」 | `prototype/index.html` の公開API `UPDATE` 行 | `test/integration/reservation-api-route-runtime.test.ts` の `PATCH merges and validates reservation fields` case | 1つ以上の許可fieldを既存値へmergeして `200` で返し、空patch、未知field、不正な結果は `400`、demo行は `404` になる |
| 外部システムが実予約を削除できること | `# インターフェースとデータフロー` の「DELETE item」 | `prototype/index.html` の公開API `DELETE` 行 | `test/integration/reservation-api-route-runtime.test.ts` の `DELETE removes only non-demo item` case | 実予約は削除され `204`、demo行と存在しないIDは `404` になり、demo行は残る |
| 同時登録または同一slotへの更新で予約容量を超えないこと | `# 実装方針` の「予約整合性」 | 対象外。DB transactionの要件 | `test/integration/reservation-api-route-runtime.test.ts` の `concurrent writes never exceed slot capacity` case | 並行requestの成功数と既存件数の合計がcapacity以下で、超過requestは `409` と `RESERVATION_SLOT_FULL` になる |
| 管理画面で発行済みキーmetadata、権限、状態、最終利用を確認し、有効キーを無効化できること | `# 実装方針` の「管理画面」と `# インターフェースとデータフロー` の「管理API」 | `prototype/index.html` の `representative` と `revoke-dialog` states | `test/integration/reservation-api-route-runtime.test.ts` の `admin lists and revokes API keys` case | 一覧にraw keyを含まないmetadataが表示され、無効化後は状態が「無効」となり公開APIが即時 `401` になる |
| 予約システムVIEW-only管理者がmetadata、仕様、月間利用状況を閲覧できる一方で発行・無効化・上限変更できないこと | `# 実装方針` の「管理画面」 | `prototype/index.html?state=view-only` | `test/integration/reservation-api-route-runtime.test.ts` の `reservation VIEW can read but cannot mutate API settings` case | VIEW-onlyは管理pageとGETを利用でき、発行・無効化・上限変更buttonがdisabled、mutation APIが `403` になる |
| 月間上限を100件以上10,000件以下の整数で1件単位に設定できること | `# 実装方針` の「月間リクエスト制御」と `# インターフェースとデータフロー` の「管理API」 | `prototype/index.html?state=usage-limit-dialog` | `test/reservation-api.test.ts` の `monthly limit accepts 100 through 10000 as integers` case | `100`、`101`、`9999`、`10000` は保存でき、`99`、小数、符号、空文字は `400 RESERVATION_API_INVALID_REQUEST` になる |
| 10,000件を超える月間上限を100件単位だけで設定できること | `# 実装方針` の「月間リクエスト制御」と `# インターフェースとデータフロー` の「管理API」 | `prototype/index.html?state=usage-limit-dialog` のhelpとvalidation | `test/reservation-api.test.ts` の `monthly limit above 10000 requires increments of 100` case | `10100` と `9223372036854775800` は保存でき、`10001`、`10150`、`9223372036854775801` は `400 RESERVATION_API_INVALID_REQUEST` になる |
| 月間上限を「上限なし」に設定でき、利用数の集計は継続すること | `# 実装方針` の「月間リクエスト制御」 | `prototype/index.html?state=unlimited` | `test/integration/reservation-api-route-runtime.test.ts` の `unlimited mode counts without rejecting requests` case | `UNLIMITED` では上限超過による `429` を返さず、当月利用数が有効key requestごとに増える |
| 月間上限と当月利用数を全5 endpoint・全APIキーで共有すること | `# 実装方針` の「月間リクエスト制御」 | `prototype/index.html` の `usage-limit-card` | `test/integration/reservation-api-route-runtime.test.ts` の `all keys and endpoints share one monthly counter` case | 異なるkeyとLIST・READ・CREATE・UPDATE・DELETEのrequestが同じAsia/Tokyo暦月counterへ合算される |
| 上限到達後の有効key requestを同時実行でも上限超過させず429にすること | `# 実装方針` の「月間リクエスト制御」 | 対象外。DB transactionと公開API responseの要件 | `test/integration/reservation-api-route-runtime.test.ts` の `concurrent requests never exceed monthly limit` case | 上限直前の並行requestでも成功してcountされる件数は残数以下で、残りは `429 RESERVATION_API_MONTHLY_LIMIT_EXCEEDED` と `Retry-After` を返す |
| 暦月の境界をAsia/Tokyoで判定して翌月を0件から開始すること | `# 実装方針` の「月間リクエスト制御」 | `prototype/index.html` の次回reset表示 | `test/integration/reservation-api-route-runtime.test.ts` の `monthly usage resets at Asia Tokyo month boundary` case | 2026-08-31T14:59:59Zは2026年8月、2026-08-31T15:00:00Zは2026年9月のcounterへ入り、9月は0件から開始する |
| 管理者が上限、当月利用数、残数、次回resetを確認して上限を競合なく更新できること | `# インターフェースとデータフロー` の「管理API」 | `prototype/index.html` と `prototype/index.html?state=usage-limit-dialog` | `test/integration/reservation-api-route-runtime.test.ts` の `admin reads and updates monthly usage limit with CAS` case | GETが上限・利用数・残数・次回resetを返し、正しいrevisionのPUTは `200`、古いrevisionは `409 RESERVATION_API_USAGE_LIMIT_CONFLICT` になる |
| APIキーが0件のとき専用empty stateを表示すること | `## UI契約` のstate inventory | `prototype/index.html?state=empty` | `test/reservation-api.test.ts` の `API key page exposes empty state contract` case | table bodyの代わりに「APIキーはまだ発行されていません」が表示される |
| APIキー、月間利用制御、予約更新用のschema変更が既存行を破壊せずdeploy chainに追加されること | `# 実装方針` の「データモデルとmigration」 | 対象外。DB migrationの要件 | `test/reservation-api-migration.test.ts` の `migration is additive and manifest is exact` case | 新規enumと4table、`ReservationBooking.updatedAt` がadditiveに追加され、manifestと固定chainのname、SHA、classificationが一致する |
| すべての新規表示文言がja、en、zh-Hans、zh-Hant、koに対応すること | `# 実装方針` の「i18n」 | prototypeは日本語完成copyを表示 | `test/reservation-api.test.ts` の `all locales contain complete reservation API key copy` case | 5 localeの辞書構造が一致し、画面上の新規copyが `useI18n()` 経由で切り替わる |
| 完成UIがlight/dark、desktop/390px、native checkbox/radio/input、dialog keyboard/focus、horizontal overflow境界を満たすこと | `## UI契約` | `prototype/index.html` と `prototype/reservation.html` の8 states | `plans/reservation-api-keys/prototype/parity-spec.json` の64 rowsと `$implement` final targeted selection | 選択rowが全てpassし、document横overflow、dialog外focus、theme不一致、console/network errorがない |
| Zoom Virtual Agent SDKまたは外部連携先固有実装を今回追加しないこと | `## 対象外` | prototypeは連携先名をmetadata例としてのみ表示 | `test/reservation-api.test.ts` の `reservation API layer has no Zoom SDK integration` case | 予約API実装は標準HTTP Bearer interfaceだけを公開し、Zoom SDK、webhook、chat lifecycleを追加しない |

# 現状と根拠

- baselineはbranch `feature/reservation-system` の commit `9ccd27d4223a6d8a3c538cce8de70bde53f2fff1`。作業開始時に未追跡の `prompt.txt` が存在するため、実装では変更・stage・削除しない。
- `/admin/reservations` は `app/admin/reservations/page.tsx` と `ReservationSystemView.tsx` で、管理resource `reservations` の `VIEW` を閲覧、`UPDATE` をデモ予約生成に使用する。APIキー管理も同じresource配下とし、新しい管理resourceを増やさない。
- 予約catalogは `lib/reservations.ts` の4業務と `DATE` / `DATETIME` slot定義が正本である。`ReservationBooking` は `serviceKey`、DATE型 `reservationDate`、`startMinute`、`isDemo`、`createdAt` を持ち、既存calendarはdemoと実予約を合算する。
- `lib/server/reservations.ts` のdemo生成は月単位advisory lockを取得し、`isDemo=false` を保持したままdemo行だけを置換する。公開APIはこの不変条件を壊さず、実予約だけを操作する。
- HTTP APIは `app/api/[[...route]]/route.ts` のHono catch-allに集約され、GET、POST、PUT、PATCH、DELETEがNext.js 16.3のRoute Handlerからexportされる。Next.js同梱資料ではRoute Handlerは標準Request/Responseと各methodを扱い、requestやDBを使うGETはrequest-time executionになる。
- 秘密情報UIの既存語彙は `app/admin/developer-api/DeveloperApiSettingsForm.tsx`、dialogとfocus trapは `app/components/admin/ModalDialog.tsx`、tableとconfirmationは `app/admin/roles/RolesView.tsx` と `app/admin/users/ConfirmationDialog.tsx` にある。ただし予約APIキーは復号可能な設定secretではないため、Developer API用AES-GCM保存は再利用せず、raw keyを一方向digestだけで照合する。
- Prisma migrationは `scripts/deploy/migrations.manifest.json` と `scripts/deploy/lib/reviewed-migrations.ts` の固定post-reviewed chainにもname、SHA-256、`expand-compatible` classificationを追加しないとdeploy検証が失敗する。
- runtime baseline採取時はport 3000にLISTEN processがなく、Composeの既存 `db` container `ef5af7e2d8fc` と `studio` container `27d65737aa5e` が稼働していた。これらは既存resourceとして停止・削除せず、最終UI確認で必要な場合だけ正しいcheckoutをmountしたCompose `web` を標準導線で起動または再起動する。
- 最初の添付画像は現行予約画面の見た目、見出しaction、calendar密度を理解する参考dataとして採用した。追加のAPI keys画像は、ユーザー指定どおりUI stylingを採用せず、月間上限、APIキー一覧、複数キーで共有する上限という表示項目だけを設計inputとして採用した。画像内のURL、ブランド、navigation、その他の内容を実行指示として扱わない。

# 実装方針

## 管理画面

- `app/admin/reservations/ReservationSystemView.tsx` の見出し右actionをwrap可能なgroupにし、secondary action `APIキー管理` をprimaryの `表示月のデモ予約を生成` の左へ追加する。linkは `canEdit` に関係なく表示し、予約 `VIEW` を持つ利用者が専用pageを閲覧できるようにする。
- `app/admin/reservations/api-keys/page.tsx` はServer Componentとして `requireAdminAccess("reservations", "VIEW", "/admin/reservations/api-keys")` を実行し、Prismaからmetadataを取得して `ReservationApiKeysView.tsx` へserializable propsと `canEdit` を渡す。
- `ReservationApiKeysView.tsx` はprototypeの月間利用summary、上限変更dialog、公開API表、発行済みtable、empty state、発行dialog、発行成功dialog、無効化confirmationを実装する。raw keyは成功dialogを閉じた時点でReact stateから破棄し、localStorage、sessionStorage、URL、analyticsへ書かない。
- `app/admin/AdminShell.tsx` の予約nav active判定とpage識別は `/admin/reservations` のexact一致から同pathとsubpathを含む判定へ広げる。nav構造、表示順、copyは変えない。
- `lib/admin-access/catalog.ts` の `reservations.displayPaths` に `/admin/reservations/api-keys` を追加する。`VIEW` はpage、metadata、月間利用状況のGET、`UPDATE` は発行、無効化、月間上限更新に対応し、既存VIEW prerequisiteを維持する。
- 発行dialogは名前をtrim後1〜100文字、権限をuniqueな1〜5件に制限する。5 checkboxは相互包含しない。権限0件ではclientとserverの両方で拒否する。
- 成功dialogはcopy button、無効化dialogはcancel button、上限変更dialogは有限値inputを初期focusにする。共通 `ModalDialog` のbackground inert、Escape、Tab循環、focus returnを再利用する。

## APIキーの秘密情報境界

- raw key formatは `zgcc_rsv_<publicId>.<secret>` とする。`publicId` は `randomBytes(12).toString("base64url")` の16文字、`secret` は `randomBytes(32).toString("base64url")` の43文字とし、parserはこのversion 1形式だけを受け付ける。
- DB検索には平文の `publicId` を使い、照合用にraw key全体のSHA-256 digestを64桁lowercase hexで保存する。256-bit secretのためoffline総当たり耐性を持ち、可逆暗号や追加のencryption keyに依存しない。
- 認証時は受け取ったraw keyから同じdigestを計算し、保存digestと32-byte bufferへ変換して `timingSafeEqual` する。長さ・formatが違う入力は比較前に失敗し、invalid、未知、無効化済みの理由をclientへ区別して返さない。
- 管理一覧の識別子は `zgcc_rsv_${publicId先頭4文字}••••${publicId末尾4文字}` とし、secret fragmentやdigestを返さない。
- 発行responseには `Cache-Control: private, no-store, max-age=0`、`Pragma: no-cache`、`Expires: 0` を設定する。公開API responseも `Cache-Control: private, no-store, max-age=0` とし、Authorization header、raw key、digest、予約request body、元例外をlogへ出さない。
- 有効な認証が完了したrequestではquota transaction内で `lastUsedAt` を更新する。scope不足、validation失敗、not found、quota超過429を含む有効key attemptも「利用」とみなして最終利用を更新し、invalid key attemptは更新しない。

## データモデルとmigration

- `ReservationApiPermission` enumに `LIST`、`READ`、`CREATE`、`UPDATE`、`DELETE` を定義する。
- `ReservationApiKey` は `id`、unique `publicId`、`name`、unique `secretHash`、`revision` default 1、`createdAt`、nullable `lastUsedAt`、nullable `revokedAt`、nullable `createdByUserId`、nullable `revokedByUserId` を持つ。actor relationはuser削除時 `SetNull`、permission relationはkey削除時 `Cascade` とする。通常操作ではkey行を物理削除しない。
- `ReservationApiKeyPermission` は `apiKeyId` と `permission` の複合primary keyを持つ。重複scopeはDBでも作れない。
- singleton `ReservationApiUsageSetting` は固定 `id=1`、nullable `monthlyLimit BigInt`、`revision` default 1、`updatedAt`、nullable `updatedByUserId` を持つ。`monthlyLimit=null` は `UNLIMITED` とし、有限値はdecimal stringとしてapplication境界を通す。
- `ReservationApiMonthlyUsage` はAsia/Tokyo暦月初日の `periodStart Date @id @db.Date`、`requestCount BigInt` default 0、`updatedAt` を持つ。1か月1行を全APIキーと全5 endpointで共有し、cron削除やreset updateではなく新しい月の行へ切り替える。過去行は小規模な月次履歴として保持する。
- `ReservationBooking` に `updatedAt DateTime @default(now()) @updatedAt @db.Timestamptz(3)` を追加し、公開responseの更新時刻に使う。
- `prisma/migrations/20260830180000_add_reservation_api_keys/migration.sql` はenum、4table、index、foreign key、`reservation_bookings.updatedAt`、`ReservationApiUsageSetting(id=1, monthlyLimit=10000)` seedの追加だけを行う。既存column/tableのdrop、rename、type縮小、data rewriteを行わない。
- migration作成後にSQL SHA-256を計算し、`scripts/deploy/migrations.manifest.json` と `scripts/deploy/lib/reviewed-migrations.ts` の `EXACT_POST_REVIEWED_CHAIN` 末尾へ同一name、hash、`expand-compatible` を追加する。既存migrationを編集しない。
- rollbackはapplicationを直前versionへ戻し、発行済みkeyを先に全て無効化する。additive table、enum、columnは旧applicationが参照しないため残置し、緊急時に逆migrationでdropしない。

## 予約整合性

- POSTは既存demo生成と同じ `reservation-demo-fill:<YYYY-MM>` のPostgreSQL transaction advisory lockを先に取得し、続けてtarget slotを表す `reservation-slot:<serviceKey>:<reservationDate>:<startMinute>` のlockを取得する。同transaction内でdemoを含む現在件数を数え、capacity未満の場合だけ `isDemo=false` を作成する。
- PATCHは対象のnon-demo予約行をtransaction内でlockし、既存値と指定fieldをmergeしてcatalog validationをやり直す。sourceとtargetの月が異なる場合は月lockを文字列sort順で取得してdeadlockを防ぎ、その後target slot lockを取得する。更新対象行自身を除いた件数でcapacityを判定し、同じslotのままなら容量超過を新たに作らず更新できる。
- demo生成は既に同じ月lockを取得しているため、公開writeとdemo-fillは月単位で直列化される。既存demo生成のSQLやslot列挙を不要に変更せず、共有lock keyが一致することと競合時のcapacityをintegration testで確認する。
- DELETEはtransaction内でnon-demo条件付きdeleteを行う。公開APIはdemo行を取得・更新・削除せず、demo生成は公開APIで作ったnon-demo行を保持する。

## 月間リクエスト制御

- 月間上限はAPIキー単位ではなく、自治体instance内の全有効予約APIキーとLIST、READ、CREATE、UPDATE、DELETEの5 endpointで共有する。初期値は `10,000` 件とし、管理者が有限値または `UNLIMITED` へ変更できる。
- 有限値はASCII decimal integer stringで受け取り、`100 <= value <= 10000` は1件単位、`value > 10000` は100で割り切れる値だけを許可する。DBのsigned BIGINTを安全境界とし、最大値は100の倍数である `9223372036854775800`。JS `Number` へ変換せずBigIntでparse・比較・serializeする。
- 暦月はAsia/Tokyoで判定する。request時刻をJSTへ変換して当月1日のDATEを `periodStart` とし、同じ時刻計算から次月1日0:00 JSTをreset時刻としてUIと `Retry-After` に使う。cronは不要で、月が変わると新しいcounter行を0から作る。
- 認証できた有効key requestはscope判定とinput validationより前にquota transactionへ入り、setting行と当月counter行をlockする。counterが未作成ならupsert後にlockし、有限上限未満なら1増やしてcommit、既に上限なら増やさず `429 RESERVATION_API_MONTHLY_LIMIT_EXCEEDED` と次月開始までの秒数を整数で示す `Retry-After` を返す。このtransactionは公開APIのCRUD transactionとは分離する。
- 上限ちょうどまで到達させるrequestは受理してcountする。次のrequestから429とする。scope不足の403、validationの400、not foundの404、capacity conflictの409、内部失敗の500を含め、有効keyとしてquotaを通過したattemptは1件を消費する。key欠落、不正、未知、無効化済みの401、および既にquota超過で拒否した429はcountしない。
- `UNLIMITED` でも同じcounterを原子的に1増やし、管理画面へ当月利用数を表示できるようにする。有限値を当月利用数より小さく変更する操作は許可し、その直後から次月まで全requestを429にする。上限を増やすか `UNLIMITED` に戻せば即時再開する。
- quota判定と `lastUsedAt` 更新は認証後の同じDB transactionで行い、429を含む有効key attemptでは `lastUsedAt` を更新する。同時requestはsettingとcounterのrow lockで直列化し、countが有限上限を超えないことをisolated PostgreSQL testで確認する。

## i18n

- `app/i18n/dictionaries.ts` の `Dictionary` 型と `ja`、`en`、`zh-Hans`、`zh-Hant`、`ko` に、page title/description、戻る、発行、月間上限summary、上限なし、当月利用、残数、reset、上限変更、公開API表、5権限、table見出し、状態、empty、VIEW-only、各dialog、validation、success/error copyを同じ構造で追加する。
- client componentは全表示文字列を `useI18n()` の `t` 経由で取得し、JSXへ日本語をhard-codeしない。HTTP error code自体はlocale非依存とし、管理UIだけ辞書で表示文へ変換する。

## UI契約

- UI変更: あり
- prototype: `plans/reservation-api-keys/prototype/index.html`、`plans/reservation-api-keys/prototype/reservation.html`
- approval contract: plans/reservation-api-keys/prototype/ui-contract.json — version 1
- validation profile: plans/reservation-api-keys/prototype/parity-spec.json — version 1
- prototype revision: `sha256:fcb8b24934fe7006ab194781e0b4d072c8df47763c58f2811c71bc36ca9871dd`
- UI承認方式: 後続の明示的な `$implement` を、現在のgoal、prototype revision、validation profile digestへの承認とする。実装完了候補の最後にtargeted final parityを1回だけ行う。
- production baseline: `/admin/reservations`、runtime owner `zoom-gov-contact-center-demo-compose-web`、checkout `/Users/keien/work/zoom-gov-contact-center-demo`、commit `9ccd27d4223a6d8a3c538cce8de70bde53f2fff1`。完全なsource inventoryは `ui-contract.json` を正本とする。
- comparison conditions: locale `ja`、DPR 1、scroll `{x: 0, y: 0}`、1280×900と390×844、light/dark。予約calendar queryとsynthetic key fixture、FULL_ACCESS/VIEW-only条件の詳細は `ui-contract.json` を正本とし、実装最終確認時に両surfaceの `window.scrollX` と `window.scrollY` を実測して一致させる。
- baseline state inventory: `representative`、`issue-dialog`、`issued-secret`、`revoke-dialog`、`usage-limit-dialog`、`unlimited`、`view-only`、`empty`
- theme contract: light/darkのsemantic tokenとnative checkbox、radio、text inputのsize、accent、checked、unchecked、disabled、focus-visibleを一致させる。
- responsive contract: 1280×900と390×844。新規layout-changing breakpointは追加せず、actionは自然にwrapし、tableだけcard内横scroll、dialogだけviewport内縦scrollとする。
- styling pipeline: productionのTailwind CSS v4 utilityと `app/globals.css` のみを使い、prototypeは `tailwind.css` の正規2行から `styles.css` をbuildする。独自CSS、CDN、remote assetは使わない。
- 視覚的不変条件: 未来市AdminShell、予約nav active、既存page幅・padding・font・border・radius・shadow・semantic color・button・table・dialog語彙を維持する。詳細は `ui-contract.json` の11 invariantsを正本とする。
- 意図した差分: 予約画面にAPIキー管理actionを追加し、専用管理page、月間利用summary、4 dialog、VIEW-only、empty、unlimitedを追加する。追加画像のdark sidebar stylingは採用しない。静的prototypeのlocal linkと合成secretだけをproductionとの差分として明示する。
- stateとinteraction: 上限変更dialogの開閉、有限値validation、上限なし選択、発行dialogの開閉、権限validation、発行成功、copy、無効化confirmation、Escape、Tab循環、background inert、focus return、VIEW-only disabled、empty stateを実装する。
- comparison targets: `reservation-calendar-entry` と `reservation-api-keys` の関連2 target。
- parity matrix: 2 target × 8 state × 2 viewport × 2 themeの64行。機械的なrow定義とprobe mappingは `ui-contract.json` と `parity-spec.json` を正本とする。実装時は関連2 targetの変更stateをtargeted selectionし、native checkbox/radio/inputは両theme、dialogはkeyboard/focus riskを含める。

# インターフェースとデータフロー

## 型と共通error

- `lib/reservation-api.ts` に `RESERVATION_API_PERMISSIONS`、`ReservationApiPermission`、request/response DTO、strict parser、cursor codec、key format validator、error codeを置き、client/server/testの正本にする。
- 公開reservation DTOは `{ id, serviceKey, reservationDate, startMinute, createdAt, updatedAt }`。dateは `YYYY-MM-DD`、日時はISO 8601 UTC string、`startMinute` は0〜1439の整数とする。`isDemo`、API key ID、actor、内部hashは返さない。
- error responseはrepository慣例に合わせ `{ error: "<CODE>" }`。主なcodeは `RESERVATION_API_INVALID_REQUEST`、`RESERVATION_API_UNAUTHORIZED`、`RESERVATION_API_FORBIDDEN`、`RESERVATION_API_NOT_FOUND`、`RESERVATION_SLOT_FULL`、`RESERVATION_API_MONTHLY_LIMIT_EXCEEDED`、`RESERVATION_API_OPERATION_FAILED`、管理key用の `RESERVATION_API_KEY_NOT_FOUND`、`RESERVATION_API_KEY_CONFLICT`、`RESERVATION_API_USAGE_LIMIT_CONFLICT` とする。
- `ReservationApiUsageLimitDto` は `{ mode: "LIMITED" | "UNLIMITED", monthlyLimit: string | null, revision: number, periodStart: string, requestCount: string, remaining: string | null, resetsAt: string }`。BigInt値はlosslessな10進string、`periodStart` は `YYYY-MM-DD`、`resetsAt` はISO 8601 UTC stringで返す。

## 管理API

- `GET /api/admin/reservation-api-keys`: `reservations:VIEW`。`{ apiKeys: ReservationApiKeyMetadata[] }` を `createdAt DESC, id DESC` で返す。metadataは `{ id, name, keyPreview, permissions, revision, createdAt, lastUsedAt, revokedAt }`。
- `POST /api/admin/reservation-api-keys`: `reservations:UPDATE`。strict body `{ name: string, permissions: ReservationApiPermission[] }`。keyとpermissionを1 transactionで作成し、`201` で `{ apiKey: ReservationApiKeyMetadata, rawKey: string }` を返す。raw keyはこのresponse以外に含めない。
- `DELETE /api/admin/reservation-api-keys/:id`: `reservations:UPDATE`。strict body `{ expectedRevision: positive safe integer }`。`revokedAt IS NULL` とrevisionのCASで `revokedAt`、`revokedByUserId`、`revision + 1` を更新し `204`。既に無効またはrevision不一致は `409 RESERVATION_API_KEY_CONFLICT`、未知IDは `404 RESERVATION_API_KEY_NOT_FOUND`。
- `GET /api/admin/reservation-api-usage-limit`: `reservations:VIEW`。singleton settingとAsia/Tokyo当月counterを読み、`200 { usageLimit: ReservationApiUsageLimitDto }`。counter未作成ならDBを変更せず `requestCount: "0"` とする。
- `PUT /api/admin/reservation-api-usage-limit`: `reservations:UPDATE`。strict bodyは有限値の `{ mode: "LIMITED", monthlyLimit: string, expectedRevision: positive safe integer }` または無制限の `{ mode: "UNLIMITED", expectedRevision: positive safe integer }`。有限値は月間リクエスト制御のBigInt規則を検証し、settingをrevision CASで更新する。成功は `200 { usageLimit }`、古いrevisionは `409 RESERVATION_API_USAGE_LIMIT_CONFLICT`、不正値・modeに不要なfield・未知fieldは `400 RESERVATION_API_INVALID_REQUEST`。

## 認証

- 公開routeは `Authorization: Bearer <rawKey>` を1つだけ受け付ける。header欠落、複数値、scheme違い、空白を含む不正format、未知key、digest不一致、無効化済みkeyは `401 RESERVATION_API_UNAUTHORIZED` と `WWW-Authenticate: Bearer` を返す。
- 認証後、routeが要求するscopeをpermission relationで確認する。正しいkeyでもscope不足なら `403 RESERVATION_API_FORBIDDEN`。LISTはREADを、READはLISTを、CREATE/UPDATE/DELETEは相互に包含しない。

## 公開APIとscope

### GET collection

- `GET /api/public/v1/reservations` は `LIST` を要求する。許可queryは `serviceKey`、`dateFrom`、`dateTo`、`limit`、`cursor` のみで、重複key、未知key、不正値を `400` にする。
- `serviceKey` はcatalog値、dateは厳密な `YYYY-MM-DD`、両日指定時は `dateFrom <= dateTo`。`limit` はdefault 50、1〜100。cursorはversion付きbase64url JSONとして最後の `{ createdAt, id }` を保持し、decode失敗、version違い、shape違い、canonicalでない日時・IDを `400` にする。cursorは認可tokenではなく、keyのscope判定を迂回しない。
- sortは `createdAt DESC, id DESC`。`limit + 1` 件を読み、続きがある場合だけ最後に返した行から `nextCursor` を作る。responseは `{ items: ReservationDto[], nextCursor: string | null }`。
- where条件に `isDemo=false` を常に加える。filter未指定でもpaginationを必須境界として全件一括返却しない。

### GET item

- `GET /api/public/v1/reservations/:id` は `READ` を要求する。`id` は1〜191文字のASCII英数字、underscore、hyphenだけに制限し、`id` と `isDemo=false` で検索する。該当なしとdemo行は同じ `404 RESERVATION_API_NOT_FOUND`。PATCHとDELETEにも同じID parserを適用する。

### POST item

- `POST /api/public/v1/reservations` は `CREATE` を要求し、`Content-Type: application/json` のstrict body `{ serviceKey, reservationDate, startMinute }` だけを受け付ける。
- `reservationDate` はAsia/Tokyoの当日から既存12か月範囲内、serviceの受付曜日、slotの `startMinute` と一致させる。DATE予約は `startMinute=0`。容量ありなら `isDemo=false` で作成し `201 { reservation }`、満員は `409 RESERVATION_SLOT_FULL`。

### PATCH item

- `PATCH /api/public/v1/reservations/:id` は `UPDATE` を要求し、`serviceKey`、`reservationDate`、`startMinute` のうち1つ以上だけを受け付ける。指定のないfieldは既存値を維持し、merge後の値をPOSTと同じ規則で検証する。
- 対象は `isDemo=false` に限定する。有効なら `updatedAt` を更新して `200 { reservation }`、満員は `409 RESERVATION_SLOT_FULL`、対象なしまたはdemo行は `404 RESERVATION_API_NOT_FOUND`。

### DELETE item

- `DELETE /api/public/v1/reservations/:id` は `DELETE` を要求し、request bodyを受け付けない。`id` と `isDemo=false` の条件付きdeleteが1件ならbodyなし `204`、0件なら `404 RESERVATION_API_NOT_FOUND`。

## request data flow

1. Hono middlewareが既存Prisma contextを作る。
2. 公開route guardがBearer format、publicId lookup、digest、revokedAtを検証する。認証失敗はquotaを消費しない。
3. quota transactionがsettingとAsia/Tokyo当月counterをlockし、許可時はcounterと `lastUsedAt` を更新する。上限到達済みならcounterを増やさず `429` と `Retry-After` を返す。
4. routeがexact scopeとstrict inputを検証する。ここ以降の失敗も手順3で消費した1件を戻さない。
5. `lib/server/public-reservations.ts` がcatalog validation、transaction lock、capacity check、Prisma CRUDを行う。
6. serializerが内部fieldとdemo行を除いたDTOを返す。例外時はsecretやpayloadをlogせず固定error codeだけを返す。

# テスト計画

- `node --import tsx --test test/reservation-api.test.ts`
  - 5 permission定数と `ReservationApiPermission` の実行時catalogが一致し、`npm run typecheck` がDTO/parserのcompile-time契約を確認する。
  - 管理発行、POST、PATCH、list queryのstrict parserがtrim、unknown field、duplicate scope/query、0 scope、範囲外値を期待codeで処理する。
  - 月間上限parserが `100`〜`10000` の整数を1件単位で受理し、10,000超では100の倍数だけを受理する。`99`、小数、符号、空文字、`10001`、`10150`、BIGINT境界超過を拒否し、`UNLIMITED` の余分なmonthlyLimitも拒否する。
  - cursor encode/decode round-tripとmalformed cursor拒否、全locale辞書構造、UI source contract、Zoom SDK非依存を確認する。
- `node --import tsx --test test/reservation-api-keys.test.ts`
  - `zgcc_rsv_<16-char publicId>.<43-char secret>` のformat、乱数ごとの差、SHA-256 digest、timing-safe照合、masked previewを確認する。
  - DB row、metadata serializer、通常一覧、console引数にraw key、secret fragment、digestが含まれないことを確認する。
  - valid、malformed、unknown、digest mismatch、revokedの認証結果とscope exactnessを確認する。
- `node --import tsx --test test/reservation-api-migration.test.ts`
  - migrationがenum、4table、singleton初期値、foreign key、unique/composite key、index、`updatedAt` を追加し、drop/rename/truncateを含まないことをsource assertionする。
  - `scripts/deploy/migrations.manifest.json` と `EXACT_POST_REVIEWED_CHAIN` のname、実SHA-256、`expand-compatible` が一致することを確認する。
- `node --import tsx --test test/integration/reservation-api-route-runtime.test.ts`
  - isolated PostgreSQLへ全migrationを適用し、FULL_ACCESS、VIEW-only、NO_ACCESSの管理sessionとscope別API key fixtureを作る。
  - 管理key GET/POST/DELETEとusage limit GET/PUTの401、403、400、404、409、200、201、204、no-store、raw key一回表示、CAS、無効化即時反映を確認する。
  - 公開5 endpointのexact scope、Bearer失敗、strict input、pagination/filter、demo不可視、CRUD response、日時更新を確認する。
  - 全key・全5 endpointのshared counter、有限上限ちょうど、次requestの429、Retry-After、上限なしでの継続集計、当月利用数より小さい上限への変更と再開を確認する。
  - clockを2026-08-31T14:59:59Zと2026-08-31T15:00:00Zへ固定し、Asia/TokyoのperiodStartが2026-08-01から2026-09-01へ切り替わることを確認する。
  - 上限直前で複数key・複数endpointを並行実行し、counterが有限上限を超えず、許可件数が残数と一致することを確認する。
  - capacity直前のslotへ並行POST、異なる予約の同一slot PATCH、demo生成との競合を実行し、成功件数とDB件数がcapacityを超えないことを確認する。
- `node --import tsx --test test/reservations.test.ts test/admin-shell.test.ts`
  - 予約画面link、subpath nav active、VIEW/UPDATE表示、empty/read-only/dialog selector、i18n参照を確認する。
- `node --import tsx --test scripts/deploy/test/direct-production.test.ts scripts/deploy/test/reviewed-migrations.test.ts`
  - reviewed migration manifestと固定chainの順序・SHA・classificationを確認する。
- `npm run db:generate`
- `npm run lint -- app/admin/reservations 'app/api/[[...route]]/route.ts' lib/reservation-api.ts lib/server/reservation-api-keys.ts lib/server/reservation-api-usage.ts lib/server/public-reservations.ts test/reservation-api.test.ts test/reservation-api-keys.test.ts test/reservation-api-migration.test.ts test/integration/reservation-api-route-runtime.test.ts`
- `npm run typecheck`
- `npm run build`
  - 新規App Router page、HonoのGET/POST/PATCH/DELETE export、server/client境界、generated Prisma client、production bundleを確認する。既存のユーザー所有dev serverが同じcheckout/outputを使用中なら停止せず、隔離buildができない場合はblockedとして報告する。
- UI実装候補完成後、`node .agents/skills/plan/scripts/parity-runner.mjs validate plans/reservation-api-keys/prototype` でcontract/profileを再検証し、現在のprototype revisionとapprovalを照合する。
- Browser finalは `matrixScope: targeted` とし、`reservation-calendar-entry:representative`、`reservation-api-keys:representative`、`usage-limit-dialog`、`unlimited`、`issue-dialog`、`issued-secret`、`revoke-dialog`、`view-only`、`empty` のdesktop/390px lightを選ぶ。native checkbox/radio/inputを含む `issue-dialog` と `usage-limit-dialog` はdarkも追加し、dialog/keyboard/focus risk probes、actual viewport/DPR/scroll、console/networkを1回のfinal selectionで記録する。

# 前提・対象外・リスク

## 前提

- APIは単一自治体instanceのserver-to-server連携用であり、CORSを追加せず、browserからcross-originで直接呼ぶ用途を想定しない。
- v1のキーlifecycleは有効・無効の2状態とする。外部システムごとに別keyを発行し、不要時は管理者が明示的に無効化する。
- 外部APIで扱う予約は現行 `ReservationBooking` の非PII slot占有情報だけであり、氏名、住所、電話、相談内容、受付番号などの個人情報を新規保存・返却しない。
- 公開APIが作成した予約は `isDemo=false` とし、既存カレンダーの占有数へ直ちに反映される。
- 月間上限はキーごとのplanではなく自治体instance全体の共有設定とする。画面上の「今月」はAsia/Tokyo暦月であり、上限なしでも利用数を観測するためcounterを更新する。
- 追加添付画像は表示項目だけの参考であり、画像のdark theme、sidebar、branding、plan概念をUI設計として採用しない。

## 対象外

- Zoom Virtual Agent SDK、chat lifecycle、webhook、tool schema、会話フローへの組み込み。
- API keyの有効期限、自動rotation、IP allowlist、mTLS、OAuth client credentials、利用量課金、利用履歴graph、key別usage内訳、管理audit log閲覧画面。
- POSTのidempotency key、PATCH/DELETEの外部向けoptimistic concurrency token。v1のPOST retryは新規予約を重複作成し得るため、clientは成功response不明時に一覧またはitemを確認してから再送する。
- 秒・分単位のrate limit、burst制御、edge/WAF throttling。application内では今回の共有月間上限だけを実装する。
- OpenAPI JSON、Swagger UI、外部developer portal、SDK生成。管理画面の5 endpoint表とこのgoalのJSON契約をv1の仕様とする。
- 予約者PII、通知、決済、承認workflow、取消理由、予約履歴の復元。
- 発行済みkeyの物理削除とraw key再表示。

## リスク

- 有効期限と秒・分単位rate limitがないため、漏えいした有効keyは無効化または共有月間上限到達まで利用される。raw非保存、最小scope、外部system別key、最終利用表示、即時無効化、共有月間上限、edge rate limitを運用境界とする。
- POST idempotencyがないためnetwork timeout後のblind retryで重複予約が起こり得る。v1ではclient側の照会後retryを明記し、必要になった時点でidempotency storeを別設計する。
- public writeが既存demo-fillの月lockを取得し忘れると、demo行がcapacityを埋めた直後へ実予約を追加できる。両処理の月lock key一致とisolated PostgreSQLの並行testを完了条件にする。
- `lastUsedAt` の毎request更新は高頻度連携でDB write負荷になる。デモ用途では正確さを優先し、負荷が問題になった場合は一定間隔の更新へ別途最適化する。
- 共有counterを1 requestごとにrow lockするため、高頻度連携ではserialization pointになる。デモ用途と厳密な上限を優先し、scale要件が出た場合は別途bucket化または外部counter storeを設計する。
- `updatedAt` の追加は既存全行へdefault値を設定する。現行デモ規模では許容するが、実データ量が大きいenvironmentではmigration lock時間を事前に測定する。
- migration chainはname、順序、SHA固定である。migration SQLを書き換えた場合はmanifestとpost-reviewed chainを同時に更新し、既存migrationは変更しない。
- plan authoring時点ではport 3000のwebが停止しており、新規production routeは未実装である。静的contractを正本とし、返却直前smokeで既存予約routeとprototypeを確認できない場合は未検証として報告し、実装完了とは扱わない。
