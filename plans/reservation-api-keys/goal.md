# 目的と完了条件

## 目的

予約公開APIの既存の全体月間リクエスト上限を自治体instance全体の安全弁として維持し、その内側に発行済みAPIキーごとの月間上限と利用カウンターを追加する。管理者はAPIキー発行時と発行後に各キーの有限上限または「キーごとの上限なし」を設定でき、VIEW権限を持つ管理者は全体とキー別の当月利用状況を同じ管理画面で確認できる。公開APIは有効なBearer APIキーごとに全体上限と個別上限を原子的に判定し、どちらの上限に達したかを機械判定できる `429` responseで返す。

## 完了条件

- `/admin/reservations/api-keys` の全体月間上限カードと既存の全5公開endpoint、権限、raw key非保存、無効化、Asia/Tokyo暦月の集計を維持する。
- APIキー発行時に名前、1つ以上の権限、キーごとの有限月間上限または上限なしを必ず指定し、発行後も有効キー単位で上限を変更できる。
- 発行済みキー一覧に各キーの月間上限、当月利用数、残数を表示し、VIEW-onlyでは閲覧のみ、UPDATE権限ありでは個別上限変更と既存mutationを利用できる。
- 有効key requestを全体counterとkey別counterへ同一transactionで集計し、どちらかが到達済みなら両counterを増やさず `429` と翌月までの `Retry-After` を返す。
- 全体上限到達は既存の `RESERVATION_API_MONTHLY_LIMIT_EXCEEDED`、キー個別上限到達は `RESERVATION_API_KEY_MONTHLY_LIMIT_EXCEEDED` で識別でき、両方到達時は既存互換のため全体上限を優先する。
- 既存APIキーはmigration後も利用を継続でき、キー個別上限は `UNLIMITED`、当月key別counterは0件から開始する。既存の全体counterと全体上限は変更しない。
- ja、en、zh-Hans、zh-Hant、ko、light/dark、1280×900、390×844、native controlのsemantic `accent-accent`、dialogのkeyboard/focus、empty、VIEW-onlyが完成UI契約を満たす。
- 対象unit test、isolated PostgreSQL integration test、migration chain test、lint、typecheck、production build、選択したBrowser final parityが成功する。

## 要件クロージャ

| 要件 | goal内の設計 | prototype | テスト | 完了条件 |
| --- | --- | --- | --- | --- |
| 既存の全キー共有月間上限、当月利用数、残数、次回reset、上限変更を維持すること | `# 実装方針` の「全体上限とキー個別上限」 | `prototype/index.html` の `representative` と `usage-limit-dialog` | `test/integration/reservation-api-route-runtime.test.ts` の `global monthly limit remains shared across keys` case | 全体上限カードとGET/PUT APIが従来どおり動き、全キーの許可requestを共有counterへ合算する |
| 新規APIキー発行時にキーごとの有限月間上限または上限なしを必ず指定できること | `# インターフェースとデータフロー` の「管理API」 | `prototype/index.html?state=issue-dialog` | `test/reservation-api.test.ts` の `issue payload requires exact per-key monthly limit` case | 有効な `usageLimit` を含む発行は `201`、欠落・未知field・不正値は `400 RESERVATION_API_INVALID_REQUEST` になりDB行を作らない |
| 発行済みの有効APIキーごとに有限月間上限または上限なしへ変更できること | `# インターフェースとデータフロー` の「管理API」 | `prototype/index.html?state=key-usage-limit-dialog` | `test/integration/reservation-api-route-runtime.test.ts` の `admin updates one key limit with revision CAS` case | 正しいrevisionのPUTは対象keyだけを更新して `200`、古いrevisionは `409 RESERVATION_API_KEY_CONFLICT` になる |
| 個別上限の変更で当月利用数をリセットしないこと | `# 実装方針` の「全体上限とキー個別上限」 | `prototype/index.html?state=key-usage-limit-dialog` | `test/integration/reservation-api-route-runtime.test.ts` の `changing a key limit preserves current usage` case | 有限値・上限なしの相互変更後も対象keyの `requestCount` が変更前と同じ値で返る |
| 発行済みキーごとの上限、当月利用数、残数を一覧で確認できること | `# 実装方針` の「管理画面」 | `prototype/index.html?state=representative` の `api-key-table-wrap` | `test/reservation-api.test.ts` の `API key page exposes per-key usage selectors` case | 各key行に `monthlyLimit`、`requestCount`、`remaining` が対応する表示値で現れる |
| VIEW-only管理者が全体とキー別利用状況を閲覧でき、全体・個別上限を変更できないこと | `# 実装方針` の「管理画面」 | `prototype/index.html?state=view-only` | `test/integration/reservation-api-route-runtime.test.ts` の `reservation VIEW reads usage but cannot mutate limits` case | VIEW-onlyのGETは `200`、全体・個別PUTは `403`、両変更buttonはdisabledになる |
| キー個別の有限上限が100〜10,000件は1件単位、10,000件超は100件単位、最大9,223,372,036,854,775,800件であること | `# 実装方針` の「入力規則」 | `prototype/index.html` の `issue-dialog` と `key-usage-limit-dialog` | `test/reservation-api.test.ts` の `per-key monthly limit reuses exact bigint rules` case | `100`、`101`、`10000`、`10100`、`9223372036854775800` は受理され、`99`、`10001`、`10150`、`9223372036854775801` は `400 RESERVATION_API_INVALID_REQUEST` になる |
| 1つのAPIキーによる全5endpointの有効key requestを同じkey別counterへ合算すること | `# 実装方針` の「request集計とlock順序」 | `prototype/index.html` のキー別利用表示 | `test/integration/reservation-api-route-runtime.test.ts` の `all endpoints share one counter for the authenticated key` case | LIST・READ・CREATE・UPDATE・DELETEで同じkeyの当月counterが許可requestごとに1増える |
| 異なるAPIキーのkey別counterと個別上限が互いに独立すること | `# 実装方針` の「request集計とlock順序」 | `prototype/index.html` の2つのkey行 | `test/integration/reservation-api-route-runtime.test.ts` の `per-key counters and limits are isolated` case | key Aのrequestはkey Aだけを増やし、key Bの残数と個別上限判定を変えない |
| 全体上限とキー個別上限を同一transactionで判定し、どちらか超過時は両counterを増やさないこと | `# 実装方針` の「request集計とlock順序」 | 対象外。DB transactionの要件 | `test/integration/reservation-api-route-runtime.test.ts` の `concurrent global and per-key limits never overcount` case | 上限直前の並行request後もglobal countと各key countは各有限上限以下で、拒否requestはどちらも増やさない |
| 全体上限超過とキー個別上限超過を別error codeで返し、両方到達時は全体を優先すること | `# インターフェースとデータフロー` の「認証・quota response」 | 対象外。公開API responseの要件 | `test/integration/reservation-api-route-runtime.test.ts` の `quota error code identifies global or key limit` case | 全体は `429 RESERVATION_API_MONTHLY_LIMIT_EXCEEDED`、個別は `429 RESERVATION_API_KEY_MONTHLY_LIMIT_EXCEEDED`、同時到達は前者になり、全てに正の `Retry-After` が付く |
| Asia/Tokyo暦月の境界で全体counterと全key counterを新しい月の0件から開始すること | `# 実装方針` の「全体上限とキー個別上限」 | `prototype/index.html` のreset表示 | `test/integration/reservation-api-route-runtime.test.ts` の `global and key usage reset at Tokyo month boundary` case | `2026-08-31T14:59:59Z` は8月、`2026-08-31T15:00:00Z` は9月のcounterを使い、9月の両counterは0件から始まる |
| 既存keyを個別上限なしで移行し、既存の全体設定・counter・key metadataを破壊しないこと | `# 実装方針` の「データモデルとmigration」 | `prototype/index.html` の既存key `上限なし` 表示 | `test/reservation-api-migration.test.ts` の `per-key usage migration is additive and preserves existing rows` case | 既存keyの `monthlyLimit IS NULL`、既存全体行とcounterは同値、新tableは空で、raw keyやpermissionは変化しない |
| `ReservationApiKeyMetadata` と管理APIがkey別usageをlosslessな10進stringで公開すること | `# インターフェースとデータフロー` の「型」と「管理API」 | `prototype/index.html` のkey別数値表示 | `npm run typecheck` と `test/integration/reservation-api-route-runtime.test.ts` の `admin key metadata includes exact usage DTO` case | `ReservationApiKeyMetadata.usage: ReservationApiKeyUsageDto` が完全なsignatureでcompileし、BigInt値を10進stringで返す |
| 公開APIのBearer認証、5権限、実予約CRUD、raw key非保存、無効化を変更しないこと | `# 実装方針` の「互換性境界」 | `prototype/index.html` の公開API表、権限、secret、revoke states | `test/integration/reservation-api-route-runtime.test.ts` の `existing authentication scopes CRUD and revocation remain exact` case | 既存5endpointの成功status、scope不足 `403`、無効key `401`、raw key一度表示の契約が変わらない |
| 新規表示文言をja、en、zh-Hans、zh-Hant、koへ追加すること | `# 実装方針` の「i18n」 | prototypeは日本語完成copyを表示 | `test/reservation-api.test.ts` の `all locales contain per-key usage copy` case | 5 localeの辞書構造が一致し、新規文言が `useI18n()` 経由で切り替わる |
| 完成UIがlight/dark、1280×900、390×844、native checkbox・radio・inputのsemantic `accent-accent`、dialog keyboard・focus、table内横overflowを満たすこと | `## UI契約` | `prototype/index.html` の9 states | `plans/reservation-api-keys/prototype/parity-spec.json` の72 rowsと `$implement` final targeted selection | light/darkでnative checkbox・radioがflex内でも16pxを保持し、computed `accent-color`がsemantic `accent-accent`と一致し、選択rowが全てpassしてdocument横overflow、dialog外focus、theme不一致、console/network errorがない |

# 現状と根拠

- baselineはbranch `feature/reservation-system` の commit `57537117b68f267563412b27cdc2a7f409bee1c3`。作業ツリーには対象外の `.codex/config.toml` 変更があり、実装・stage・cleanupの対象にしない。
- `app/admin/reservations/api-keys/ReservationApiKeysView.tsx` は全体月間上限card、公開API表、発行済みkey table、発行・一度表示・無効化・全体上限変更dialogを持つが、key metadataと発行payloadにkey別上限はない。
- `lib/server/reservation-api-usage.ts` はsingleton `reservation_api_usage_settings` と `reservation_api_monthly_usage` だけをlock・集計する。`lib/server/reservation-api-keys.ts` は有効keyをrow lockした後、scope判定より前にこの全体quotaを消費するため、認証済みrequestは後続の `403`、`400`、`404`、`409` でも1件として扱われる。
- `prisma/schema.prisma` の `ReservationApiKey` は `revision`、`lastUsedAt`、permission relationを持つが、key別 `monthlyLimit` とkey別月次counter relationを持たない。既存migration `20260830180000_add_reservation_api_keys` は編集せず、新しいexpand-compatible migrationを追加する。
- `app/api/[[...route]]/route.ts` のHono catch-allは管理key GET/POST/DELETE、全体usage GET/PUT、公開5endpointをNext.js Route Handlerから公開する。repository同梱のNext.js 16.3資料はGET/POST/PUT/PATCH/DELETEをサポートし、requestやDBへアクセスするGETをrequest-timeで処理する。
- HTTP `429` は認証credential単位またはserver全体など複数の数え方を許容し、conditionの説明と `Retry-After` を返せるため、全体・key別の2段階判定を別error codeと同一reset時刻で表現する。
- port 3000はDocker Compose project `zoom-gov-contact-center-demo` の `web` container `37cf6556a468` がlistenし、`/Users/keien/dev/zoom/zoom-gov-contact-center-demo` を `/app` へbind mountしている。`db` と `studio` も既存resourceであり、停止・削除しない。

# 実装方針

## 全体上限とキー個別上限

- 既存の全体 `ReservationApiUsageLimitDto`、singleton setting、月次counter、管理GET/PUTを維持する。UI見出しを「全体の月間リクエスト上限」とし、key別上限と両方が適用されることを説明する。
- 各API keyにnullable `monthlyLimit` を持たせる。`null` はキーごとの `UNLIMITED` であり、全体上限を無効化しない。有限値は全体上限と同じBigInt規則を使う。
- `ReservationApiKeyMonthlyUsage` はkey IDとAsia/Tokyo月初日の複合主キーで `requestCount` を保持する。上限なしでも観測のため許可requestを集計する。
- 上限変更は当月counterを削除・減算しない。現在値以下へ下げた場合は保存を許可し、次の有効key requestから個別 `429` にする。
- 有効keyが上限到達後にrequestした場合も `lastUsedAt` は更新する。無効・不正keyは全体・key別counterと `lastUsedAt` のいずれも変更しない。

## request集計とlock順序

1. Bearer format、public ID、digest、`revokedAt` を検証し、対象 `reservation_api_keys` rowを `FOR UPDATE` する。
2. key permissionsとkeyの `monthlyLimit` を取得し、全体setting、当月全体counter、当月key別counterをこの順でlockする。全requestで同じ順序を使う。
3. 全体上限、次にkey個別上限を判定する。全体到達時を優先し、どちらかが到達済みなら両counterを増やさず、`lastUsedAt` だけ更新してcommitする。
4. 両方に残数があれば、同一transactionで全体counterと認証keyのcounterを各1増やし、`lastUsedAt` を更新する。transaction rollback時は3値とも戻る。
5. quota通過後に既存どおりscopeとrequestを検証する。後続失敗でも両counterの1件は戻さない。

## データモデルとmigration

- `prisma/schema.prisma` の `ReservationApiKey` に `monthlyLimit BigInt?` と `monthlyUsages ReservationApiKeyMonthlyUsage[]` を追加する。
- `ReservationApiKeyMonthlyUsage` は `apiKeyId String`、`periodStart DateTime @db.Date`、`requestCount BigInt @default(0)`、`updatedAt DateTime @default(now()) @updatedAt @db.Timestamptz(3)`、`@@id([apiKeyId, periodStart])`、`@@index([periodStart])`、keyへの `onDelete: Cascade` relation、table名 `reservation_api_key_monthly_usage` を持つ。
- `prisma/migrations/20260830230000_add_reservation_api_key_usage_limits/migration.sql` はnullable列、同じlimit CHECK、新table、非負counter CHECK、foreign key、indexだけを追加する。既存keyはcolumn defaultなしの `NULL` となり、既存row updateとtable scanを要求しない。
- `scripts/deploy/migrations.manifest.json` と `scripts/deploy/lib/reviewed-migrations.ts` の固定chainへ新migration名、実SHA-256、`expand-compatible` を追加する。既存migration SQLは変更しない。

## 管理画面

- `ReservationApiKeysView.tsx` は発行済みkey tableへ「キーごとの月間上限」「今月の利用」を追加し、有限値では上限・利用・残り、無制限では「上限なし」・利用・「残り 上限なし」を表示する。無効keyも当月snapshotを表示するが個別上限変更はdisabledにする。
- 有効key行の「上限を変更」は対象key名と全体上限も適用される旨を示す `key-usage-limit-dialog` を開く。有限・上限なしのnative radio、数値input、validation、saving、API error、CAS conflict、Escape、Tab循環、background inert、triggerへのfocus returnを既存 `ModalDialog` で実装する。
- 発行dialogへ同じ個別上限controlを追加し、API payloadへ必須の `usageLimit` を含める。画面初期値は `LIMITED`、`10000` とするが、serverは省略時defaultを持たずstrictに拒否する。
- VIEW-only noticeは発行、無効化、全体上限変更、キー個別上限変更にUPDATE権限が必要と明示し、全mutation controlをdisabledにする。

## 入力規則

- 全体とkey別で `isValidMonthlyLimit` を共有し、有限値は10進digitだけを受け付ける。100〜10,000は1件単位、10,000超は100の倍数、最大は `9223372036854775800` とする。
- `UNLIMITED` bodyに `monthlyLimit`、`LIMITED` bodyに未知field、数値型、符号、小数、leading zeroを許さない。発行payloadと更新payloadはexact-key validationを行う。

## 互換性境界

- 公開5endpoint、scope、Reservation DTO、cursor、予約capacity、demo不可視、raw key format・digest・一度表示、無効化、全体usage APIのpathと既存成功statusを変更しない。
- 既存全体quota error codeを維持し、key別だけ新codeを追加する。管理key一覧responseはadditiveに `usage` を追加し、raw keyやdigestは含めない。

## i18n

- `ReservationApiKeyDictionary` とja、en、zh-Hans、zh-Hant、koへ、全体上限の区別、key別上限・利用・残り、発行時設定、個別変更dialog、上限なし、validation、VIEW-only説明を同じ構造で追加する。componentに新規文言をhardcodeしない。

## UI契約

- UI変更: あり
- prototype: `plans/reservation-api-keys/prototype/index.html`、`reservation.html`、`script.js`、`styles.css`
- approval contract: plans/reservation-api-keys/prototype/ui-contract.json — version 1
- validation profile: plans/reservation-api-keys/prototype/parity-spec.json — version 1
- prototype revision: `sha256:3072b6a1679528ddec21492a2fd6e42fe740fc1ac199a65addffdea52e20ee5a`
- UI承認方式: 後続の明示的な `$implement` を現在のgoal、prototype revision、validation profile digestへの承認とし、実装候補完成後にtargeted final parityを1回だけ行う。
- production baseline: `/admin/reservations/api-keys`、runtime owner `zoom-gov-contact-center-demo-compose-web`、checkout `/Users/keien/dev/zoom/zoom-gov-contact-center-demo`、commit `57537117b68f267563412b27cdc2a7f409bee1c3`。完全なsource inventoryは `ui-contract.json` を正本とする。
- comparison conditions: locale `ja-JP`、DPR 1、scroll `{x: 0, y: 0}`、1280×900と390×844、light/dark。FULL_ACCESS、VIEW-only、synthetic usage fixtureの詳細は `ui-contract.json` を正本とし、最終確認時に両surfaceの `window.scrollX` と `window.scrollY` を実測する。
- baseline state inventory: `representative`、`issue-dialog`、`issued-secret`、`revoke-dialog`、`usage-limit-dialog`、`key-usage-limit-dialog`、`unlimited`、`view-only`、`empty`
- theme contract: light/darkのsemantic tokenとnative checkbox、radio、text inputのsize、checked、unchecked、disabled、focus-visibleを一致させる。checkbox・radioはflex内でも16pxを保持し、accentにはproductionとprototypeの両方で `accent-accent` を使う。
- responsive contract: 1280×900と390×844。新しいlayout breakpointは追加せず、key tableだけcard内横scroll、dialogだけviewport内縦scrollとしdocument横overflowを作らない。
- styling pipeline: productionのTailwind CSS v4 utilityと `app/globals.css` のみを使い、正規2行の `tailwind.css` から `styles.css` をbuildする。独自CSS、CDN、remote assetは使わない。
- 視覚的不変条件: 未来市AdminShell、予約nav active、既存page幅・padding・font・border・radius・shadow・semantic color・button・table・dialog語彙、公開API表、raw key一度表示を維持する。正本は `ui-contract.json` の12 invariants。
- 意図した差分: 全体上限cardの名称と説明、key tableの個別上限・利用・残り列と変更action、発行dialogの個別上限field、key個別上限変更dialogを追加する。静的prototypeのlocal linkと合成secretだけをproductionとの差分として残す。
- stateとinteraction: 全体・個別上限dialogの有限値validationと上限なし、発行dialogの権限・個別上限validation、発行成功・copy、無効化、Escape、Tab循環、background inert、focus return、VIEW-only disabled、emptyを実装する。
- comparison targets: `reservation-calendar-entry` と `reservation-api-keys` の2 target。今回の変更targetは `reservation-api-keys`。
- parity matrix: 2 target × 9 state × 2 viewport × 2 themeの72行。機械的rowとprobe mappingは `ui-contract.json` と `parity-spec.json` を正本とする。

# インターフェースとデータフロー

## 型

- `ReservationApiKeyUsageDto` は `{ mode: "LIMITED" \| "UNLIMITED", monthlyLimit: string \| null, periodStart: string, requestCount: string, remaining: string \| null, resetsAt: string }`。BigIntはlosslessな10進string、`periodStart` は `YYYY-MM-DD`、`resetsAt` はISO 8601 UTC stringとする。
- `ReservationApiKeyMetadata` は既存 `{ id, name, keyPreview, permissions, revision, createdAt, lastUsedAt, revokedAt }` に `usage: ReservationApiKeyUsageDto` を追加する。keyのlimit変更とrevokeは同じtop-level `revision` でCASする。
- `ReservationApiKeyLimitInput` は `{ mode: "LIMITED", monthlyLimit: string }` または `{ mode: "UNLIMITED" }`。`parseReservationApiKeyIssue(value)` は `{ name, permissions, usageLimit }`、`parseReservationApiKeyUsageLimit(value)` は `{ mode, monthlyLimit?, expectedRevision }` を返すstrict parserとする。
- `RESERVATION_API_ERROR_CODES.keyMonthlyLimitExceeded` は完全な値 `RESERVATION_API_KEY_MONTHLY_LIMIT_EXCEEDED` とする。既存codeは変更しない。

## 管理API

- `GET /api/admin/reservation-api-keys`: `reservations:VIEW`。Asia/Tokyoの同一 `now` で各keyのusage snapshotを解決し、`200 { apiKeys: ReservationApiKeyMetadata[] }` を返す。未作成counterはDBを変更せず0件として扱う。
- `POST /api/admin/reservation-api-keys`: `reservations:UPDATE`。strict bodyは `{ name, permissions, usageLimit: { mode: "LIMITED", monthlyLimit } }` または `{ name, permissions, usageLimit: { mode: "UNLIMITED" } }`。key、permission、`monthlyLimit` を1 transactionで作成し `201 { apiKey, rawKey }`。raw keyはこのresponseだけに含める。
- `PUT /api/admin/reservation-api-keys/:id/usage-limit`: `reservations:UPDATE`。strict bodyは有限の `{ mode: "LIMITED", monthlyLimit, expectedRevision }` または無制限の `{ mode: "UNLIMITED", expectedRevision }`。有効keyかつrevision一致を条件に `monthlyLimit` と `revision + 1` だけを更新し、`200 { apiKey }` を返す。未知IDは `404 RESERVATION_API_KEY_NOT_FOUND`、無効keyまたはstale revisionは `409 RESERVATION_API_KEY_CONFLICT`、不正bodyは `400 RESERVATION_API_INVALID_REQUEST`。
- 既存 `DELETE /api/admin/reservation-api-keys/:id` と全体usage GET/PUTはpath、body、statusを維持する。全管理GET responseは `Cache-Control: no-store` とする。

## 認証・quota response

- 認証・quota guardの内部結果を `UNAUTHORIZED`、`GLOBAL_LIMIT_EXCEEDED`、`KEY_LIMIT_EXCEEDED`、`AUTHENTICATED` に分ける。両上限到達時は `GLOBAL_LIMIT_EXCEEDED`。
- `GLOBAL_LIMIT_EXCEEDED` は `429 { error: "RESERVATION_API_MONTHLY_LIMIT_EXCEEDED" }`、`KEY_LIMIT_EXCEEDED` は `429 { error: "RESERVATION_API_KEY_MONTHLY_LIMIT_EXCEEDED" }`。どちらも `Cache-Control: no-store` とAsia/Tokyo翌月までの正のdelta-seconds `Retry-After` を付ける。
- header欠落、不正format、未知・無効keyは既存どおり `401` と `WWW-Authenticate: Bearer`。quota通過後のscope不足は既存どおり `403` とする。

## request data flow

1. 管理pageはServer Componentでkey metadataと全体usage snapshotを取得し、client viewへ渡す。
2. 発行・key別上限変更はstrict parser、reservations UPDATE authorization、revision CASを通り、返却された1行のmetadataだけclient stateへ反映する。
3. 公開requestは認証transactionでkey、全体setting、全体counter、key counterをlockし、両quotaを判定・集計する。
4. 許可requestだけが既存scope、strict input、実予約serviceへ進み、既存response contractを返す。

# テスト計画

- `node --import tsx --test test/reservation-api.test.ts test/reservation-api-keys.test.ts`
  - 発行・key別上限parserのexact shape、有限値境界、上限なし、未知field、error code catalog、5 locale辞書、UI selectorを確認する。
  - `ReservationApiKeyUsageDto` とmetadataのruntime fixtureを確認し、`npm run typecheck` で完全なcompile-time signatureを確認する。
- `node --import tsx --test test/reservation-api-migration.test.ts`
  - 新migrationがnullable `monthlyLimit`、key別counter table、CHECK、複合primary key、foreign key、indexだけを追加し、drop・rename・truncate・既存row updateを含まないことを確認する。
  - manifestと固定chainのname、実SHA-256、`expand-compatible` が一致することを確認する。
- `node --import tsx --test test/integration/reservation-api-route-runtime.test.ts`
  - isolated PostgreSQLへ全migrationを適用し、既存keyの個別上限なし移行、発行時有限・無制限、一覧snapshot、個別PUTの401・403・400・404・409・200、CAS、無効key拒否を確認する。
  - 同一keyの全5endpoint集計、異なるkeyの分離、全体とkey別の二段階quota、全体優先error、Retry-After、上限変更時counter維持、上限なしの継続集計を確認する。
  - 全体・key別の各残数1で並行requestを実行し、両counterが上限を超えず、拒否requestが両方を増やさないことを確認する。
  - Tokyo月境界を固定し、全体とkey別が新しい月の0件から始まることを確認する。
  - 既存Bearer失敗、5 scope、public CRUD、demo不可視、capacity、raw key非露出、無効化を回帰確認する。
- `node --import tsx --test scripts/deploy/test/direct-production.test.ts scripts/deploy/test/reviewed-migrations.test.ts`
- `npm run db:generate`
- `npm run lint -- app/admin/reservations/api-keys 'app/api/[[...route]]/route.ts' app/i18n/dictionaries.ts lib/reservation-api.ts lib/server/reservation-api-keys.ts lib/server/reservation-api-usage.ts prisma/schema.prisma test/reservation-api.test.ts test/reservation-api-keys.test.ts test/reservation-api-migration.test.ts test/integration/reservation-api-route-runtime.test.ts`
- `npm run typecheck`
- `npm run build`
  - ユーザー所有dev serverと同じcheckout/outputを共有する場合は停止せず、安全な隔離buildがなければblockedとして報告する。
- `node .agents/skills/plan/scripts/parity-runner.mjs validate plans/reservation-api-keys/prototype`
- Browser finalは `matrixScope: targeted` で `reservation-api-keys` の `representative`、`issue-dialog`、`key-usage-limit-dialog`、`view-only` を1280×900と390×844のlightで選ぶ。native radio/inputを持つ2 dialogはdarkも追加し、checkbox・radioのcomputed `accent-color`、keyboard/focus、actual viewport/DPR/scroll、table内overflow、console/networkを1回のfinal selectionで記録する。

# 前提・対象外・リスク

## 前提

- APIは単一自治体instanceのserver-to-server連携用であり、画面上の「今月」はAsia/Tokyo暦月とする。
- 全体上限は全key合算、key別上限は認証keyだけを対象とし、requestは両方に残数がある場合だけ許可する。
- scope不足や不正payloadも有効keyで認証してquotaを通過した時点で1件に数える既存契約を維持する。
- 既存keyは個別上限なしで移行する。新規keyは管理者が発行dialogで有限または上限なしを明示し、server側の暗黙defaultは設けない。

## 対象外

- 秒・分単位のrate limit、burst制御、edge/WAF throttling、利用量課金、key別利用履歴graph、endpoint別内訳、export。
- API keyの有効期限、自動rotation、IP allowlist、mTLS、OAuth client credentials、管理audit log閲覧画面。
- 公開5endpoint、予約schema、CORS、Zoom Virtual Agent SDK、webhook、chat lifecycle、OpenAPI/Swagger、外部SDK生成の変更。
- 発行済みkeyのraw値再表示、物理削除、key別counterの手動reset。

## リスク

- 全体counter rowは全key requestのserialization pointであり、key別counterを追加しても全体上限が有限・無制限のどちらでも既存のglobal lock負荷は残る。デモ用途の厳密な上限を優先し、scale要件が出た場合はbucket化または外部counter storeを別設計する。
- key別上限を当月利用数以下へ下げると、そのkeyは翌月まで直ちに `429` になる。UIは利用数と残数0を表示し、上限変更でcounterがresetされないことを明記する。
- key limit更新と無効化が同じrevisionを使うため、同時操作の片方は409になる。UIは最新一覧を再取得せずgenericに上書きせず、conflictを表示して再読込を促す。
- lock順序がrouteごとにずれるとdeadlockが起こり得る。認証quotaはkey row、global setting、global counter、key counterの固定順序とし、並行integration testで保証する。
- 既存migrationや既存全体counterを変更するとdeploy chainと利用実績を破壊する。新migrationだけを追加し、manifest/固定chainと既存row readbackを完了条件にする。
- plan smokeは現行productionに未実装の個別上限UIとの差分を確認するもので、production parityのpassは後続の明示的な `$implement` と最終evidenceまで主張しない。
