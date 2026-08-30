# 目的と完了条件

## 目的

管理画面の設定メニューから `/admin/developer-api` を開き、Server-To-Server OAuth と Webhook only app の認証情報をセクション単位で安全に設定できるようにする。Client Secret と Secret Token は初期表示をマスクし、UPDATE権限を持つ管理者がeye toggleを操作した場合だけ、対象1項目の保存済み値を専用APIから取得して一時表示できるようにする。再非表示・保存成功時には平文をブラウザstateから破棄する。あわせて管理APIのroute境界、保存後のvisibility reset、Production暗号鍵欠落時のfail-closed、migration文書の件数を整合させる。

## 完了条件

- 既存AdminShellの設定dropdownに `Developer API` を追加し、productionは `/admin/developer-api`、prototypeは実在HTML間を `Not Found` なしで遷移する。
- Account ID、Client ID、Client Secretをこの順で縦積みし、Webhook Secret Tokenとは別form・別submit・別feedbackで検証・保存する。
- Client SecretとSecret Tokenの入力欄下には、設定済み状態や操作方法を説明する備考・補足文を表示しない。
- 設定済みClient SecretとSecret Tokenは初期状態で空のpassword inputと固定maskを表示する。eye操作時だけUPDATE権限付きPOSTで対象1項目を復号し、表示中だけclient stateへ保持する。
- 設定済み値の再非表示では平文を即時破棄し、新規・置換入力のtoggleは通信せずローカルで表示切替する。保存成功後は対象inputを空値、`type=password`、`aria-pressed=false`、設定済みmaskへ戻す。
- 通常のpage loader、RSC HTML、設定snapshot、保存response、URL、log、error、cacheへSecret平文、ciphertext、暗号鍵を含めない。reveal responseだけは要求された1項目の平文を `Cache-Control: no-store` で返す。
- 実Hono routeとisolated PostgreSQLを使うintegration testで認証、権限、validation、暗号化不能、復号失敗、成功responseの境界を保証する。
- Production暗号鍵が欠落した場合、direct DBで既存ciphertextがないことを証明できたときだけ新鍵を生成し、既存値、不完全schema、検査不能ではVercel環境変数更新前に停止する。
- VIEW/UPDATE権限、5ロケール、light/dark、390/1280px、639/640px、767/768px、暗号化、migration、recovery契約を満たす。

## 要件クロージャ

| 要件 | goal内の設計 | prototype | テスト | 完了条件 |
| --- | --- | --- | --- | --- |
| 設定menuへDeveloper APIを追加する | 「ヘッダーとルーティング」 | `index.html#admin-settings-menu` | `test/developer-api.test.ts` navigation | 既存項目を維持して1件追加される |
| productionをDeveloper API routeへ遷移させる | 「ヘッダーとルーティング」 | `users-header` target | href test | hrefが `/admin/developer-api` になる |
| prototypeの前進と戻りでNot Foundを防ぐ | 「ヘッダーとルーティング」 | `developer-api.html` と `index.html` | Browser navigation | 両pathnameとH1が一致する |
| 2つの指定sectionを表示する | 「ページ構成」 | 両fieldset | section test | 両sectionが表示される |
| OAuth 3 fieldを指定順で縦積みする | 「ページ構成」「UI契約」 | `#oauth-fields` | responsive Browser check | 全幅でleft一致、top昇順、横overflowなし |
| 2 sectionを別form、別submit、別feedbackにする | 「ページ構成」 | 2 formと2 feedback | form ownership test | 一方のvalidationと状態が他方へ波及しない |
| IDをtrimしSecretをtrimせず保存する | 「保存API」 | 各input | serviceとroute test | DBとsnapshotが契約どおりになる |
| 空Secretは既存ciphertextを維持する | 「保存API」 | representative | preserve test | omit時にciphertextが変わらない |
| Client Secretを初期maskする | 「Secret表示境界」 | `#client-secret` | componentとroute redaction test | value空、password、maskになる |
| Secret Tokenを初期maskする | 「Secret表示境界」 | `#secret-token` | componentとroute redaction test | value空、password、maskになる |
| Secret入力欄下の備考・補足文を表示しない | 「ページ構成」 | 両Secret fieldのrepresentative state | `test/developer-api.test.ts` no-secret-help-copy caseとBrowser | 設定済み状態や操作方法を説明するparagraphと`aria-describedby`が両fieldに存在しない |
| 設定済みClient Secretを任意表示する | 「設定済みSecret reveal API」 | stored-secret-visible state | reveal success route testとBrowser | eye操作後に対象値だけtext表示される |
| 設定済みSecret Tokenを任意表示する | 「設定済みSecret reveal API」 | stored-secret-visible state | reveal success route testとBrowser | eye操作後に対象値だけtext表示される |
| 設定済み値の再非表示で平文を破棄する | 「Secret表示境界」 | stored reveal toggle | component testとBrowser | value空、password、pressed false、masked stateになる |
| 新規・置換値のtoggleは通信しない | 「Secret表示境界」 | secret-visible state | fetch spy component test | 値を保持してtypeとpressedだけ切り替わる |
| reveal中の編集を置換値へ移行する | 「Secret表示境界」 | stored-secret-visible state | component edit test | originがreplacementになり再非表示でも値を保持する |
| 保存payloadへ未編集のreveal値を含めない | 「保存API」 | stored-secret-visible state | request body test | IDのみ保存時にSecret keyがomitされる |
| 保存成功後にClient Secretを安全状態へ戻す | 「保存後mask復帰」 | post-save-masked state | component reset testとBrowser | value空、password、pressed false、maskになる |
| 保存成功後にSecret Tokenを安全状態へ戻す | 「保存後mask復帰」 | post-save-masked state | component reset testとBrowser | value空、password、pressed false、maskになる |
| 保存失敗時は入力値とvisibilityを保持する | 「保存後mask復帰」 | secret-visible state | component failure test | error feedbackだけが変わる |
| reveal中は対象toggleを二重実行不能にする | 「Secret表示境界」 | interaction contract | component loading test | aria-busy trueとdisabledを経て完了する |
| reveal失敗時はmaskを維持する | 「設定済みSecret reveal API」 | reveal-error contract | 404、503、500 routeとcomponent test | 平文なし、password、pressed false、error feedbackになる |
| revealはUPDATE権限を要求する | 「権限」「設定済みSecret reveal API」 | readonly contract | anonymous、VIEW-only、password-change route test | 401または403で平文を返さない |
| revealはPOST bodyで対象fieldだけを受け付ける | 「設定済みSecret reveal API」 | 対象外 | parserとcross-field test | 未知key、未知field、malformed JSONが400になる |
| reveal responseをcacheさせない | 「設定済みSecret reveal API」 | 対象外 | header route test | no-storeとno-cache headerが付く |
| 通常snapshotと保存responseへ平文を含めない | 「Secret表示境界」「保存API」 | representative | response redaction test | IDとconfigured booleanだけになる |
| reveal responseは要求された1項目だけ返す | 「設定済みSecret reveal API」 | stored-secret-visible state | exact JSON route test | 他Secret、ciphertext、鍵を含まない |
| 保存APIの認証と権限をrouteで保証する | 「管理API route test」 | readonly contract | anonymous、VIEW-only、password-change test | 401または403でDB非変更になる |
| 保存APIのvalidationと暗号鍵不備をrouteで保証する | 「管理API route test」 | 対象外 | malformed、cross-section、503 test | 400または503でDB非変更になる |
| SecretをAES-256-GCM認証付き暗号で保存する | 「暗号化」 | 対象外 | crypto roundtripとtamper test | DB平文なし、tag不一致は復号失敗になる |
| field固有AADで復号する | 「暗号化」 | 対象外 | wrong-field test | 別field ciphertextを復号できない |
| DB ciphertext状態inspection APIを提供する | 「暗号鍵provisioning guard」 | 対象外 | typecheckとdeploy test | 指定signatureで3状態だけを返す |
| 既存ciphertextなしの場合だけ新鍵を生成する | 「暗号鍵provisioning guard」 | 対象外 | safe provisioning test | table不存在または全NULL時だけ生成する |
| 既存ciphertextまたは検査不能では停止する | 「暗号鍵provisioning guard」 | 対象外 | fail-closed deploy test | Vercel mutation 0回で停止する |
| migration総数と次番号を文書化する | 「Migration・recovery」 | 対象外 | docs assertion | 現行10件、次は11件目になる |
| fresh databaseへ完全migration chainを適用する | 「Migration・recovery」 | 対象外 | `test:admin-access:db` | row数10、最新名がDeveloper API migrationになる |
| VIEWとUPDATE prerequisiteを適用する | 「権限」 | full-accessとreadonly contract | authorization test | VIEWなし非表示、VIEW-only編集とreveal不可になる |
| 5ロケールを同shapeで提供する | 「多言語」 | ja fixture | locale testとtypecheck | 全辞書が非空で同shapeになる |
| 共通shell、icon、token、themeを維持する | 「UI契約」 | 両target、両theme | screenshot parity | productionと一致する |
| 6 viewportのresponsive契約を満たす | 「UI契約」 | 96-row contract | parity matrix | clippingと横scrollがない |
| 最新goalとprototypeの最終parityを作る | 「UI契約」 | 全96 row | `$implement` final parity | 96行が各1回passし実測scroll provenanceを持つ |

# 現状と根拠

- HEADは `145a9fb5f3db3cf2b5a1c987bf4ae8dd98b1d33d`。working treeにはDeveloper API page、2つの独立form、section discriminated payload、AES-GCM暗号化、singleton migration、deploy鍵allowlistが未コミットで存在する。
- `PasswordInput` のvisibilityは内部stateであり、表示中の保存成功後に親が値を空へ戻しても `type=text` と `aria-pressed=true` が残る。設定済み値を取得するinterfaceもない。
- 現在のpage loaderとsnapshotはIDとconfigured booleanだけを返し、暗号helperはfield固有AADによるencrypt/decryptを既に持つ。したがって初期表示の非漏えいを維持したまま、認可済みの対象1項目revealを追加できる。
- `test/integration/developer-api-runtime.test.ts` は保存serviceをmock Prismaへ直接呼ぶだけで、Hono実handler、Better Auth session、権限、malformed JSON、暗号鍵不備、response redactionを通さない。closest patternは `test/integration/admin-access-runtime.test.ts` のisolated PostgreSQLとsigned session cookieである。
- `scripts/deploy/main.ts` はProduction鍵がない場合に既存ciphertextを確認せず新鍵を生成する。`scripts/deploy/lib/database.ts` にはpg Clientによるdirect DB inspection patternがある。
- migration directoryと `REVIEWED_MIGRATION_COUNT` は10件だが、初回・再デプロイ文書とDB integration testの一部は5件または9件のままである。
- Next.js 16.3.0のleaf pageとHono catch-all構造を維持し、revealも既存catch-allへ追加する。

# 実装方針

## UI契約

- UI変更: あり
- prototype: `plans/developer-api-settings/prototype/`
- approval contract: plans/developer-api-settings/prototype/ui-contract.json — version 1
- validation profile: plans/developer-api-settings/prototype/parity-spec.json — version 1
- prototype revision: `sha256:cc422ca0ae74aae354361f5d783a789bacbae90ae442e1ecfbcbf98630ee704e`
- validation profile digest: `sha256:1abaf69f9d9c9ea480f8b4829ab30116948f8da97bc9bb428200d601197d7a31`
- UI承認方式: 次の明示的な `$implement` が現goal、revision、profile digestを新規承認する
- production baseline: 完全なsource inventoryは `ui-contract.json` を正本とする
- comparison conditions: ja、FULL_ACCESS、query none、DPR 1、scroll x 0、scroll y 0、light/dark、6 viewport
- baseline state inventory: representative、secret-visible、stored-secret-visible、post-save-masked
- theme contract: production class、scheme、semantic tokenを再現し、prototypeはreviewer-only theme queryへ対応する
- responsive contract: 390×844、1280×900、639×844、640×844、767×844、768×844。OAuthは常時縦積みする
- styling pipeline: 2行の `tailwind.css` とproduction `app/globals.css` からCSSを生成する
- 視覚的不変条件: 市名、2 dropdown、既存全項目、共通SVG、幅、余白、font、border、focus、disabled、token、section card密度、mask、eye toggle、Secret入力欄下の補足文なし
- 意図した差分: Developer API menu/page、2 section、4 field、2 form、2 submit、section別feedback、設定済み値reveal、保存後mask復帰、Secret補足文の削除、prototype相対link
- stateとinteraction: menu、初期mask、reveal loading、stored-secret-visible、再非表示と破棄、replacement toggle、2 submit、section feedback、post-save reset、error、keyboard、focus
- comparison targets: users-headerとdeveloper-api
- parity matrix: 2 target、4 state、6 viewport、2 themeの96行。prototype、contract、navigation、Secret interactionを変えるため次の `$implement` はfull scopeとする
- prototypeの設定済みrevealは `script.js` 内の明示的な合成値だけを使用し、実認証情報やproduction APIを使用しない

## ヘッダーとルーティング

`AdminNavigationItemKey`、settings group、exact-path判定、`admin/layout.tsx` VIEW filter、`admin/page.tsx` landing候補へ `developer-api` を含める。productionは `/admin/developer-api`、prototypeは前進 `./developer-api.html`、戻り `./index.html` とし、静的serverのSPA fallbackへ依存しない。

## ページ構成

`DeveloperApiSettingsForm` はOAuthとWebhookを兄弟formとして描画する。OAuthはAccount ID、Client ID、Client Secretを `max-w-xl space-y-5` で縦積みし、WebhookはSecret Tokenだけを持つ。各formは独立したpending、feedback、Secret value、Secret origin、visibility stateを持つ。VIEW-onlyではinput、toggle、submitをdisabledにする。

Client SecretとSecret Tokenのlabel、input、eye toggleだけを表示し、各入力欄の下に設定済み状態や操作方法を説明するparagraphを置かない。対応するhelp elementがないため、両inputへそのhelpを参照する `aria-describedby` も付けない。保存・revealの成功または失敗feedbackは従来どおり各formのlive regionで必要時だけ表示する。

Secret client stateは `masked`、`revealing`、`stored-visible`、`replacement-masked`、`replacement-visible` を区別する。設定済み空inputのeye操作だけがreveal APIを呼び、入力済みreplacementのeye操作は通信しない。stored-visible中にinputを編集した時点でreplacementへ移行する。

## Secret表示境界

初期loaderと `DeveloperApiSettingsSnapshot` はAccount ID、Client ID、`clientSecretConfigured`、`secretTokenConfigured` だけを返す。Secret平文、ciphertext、鍵はRSC props、HTML、通常GET、保存responseへ載せない。

設定済み空inputの表示操作では対象toggleをdisabled、inputを `aria-busy=true` とし、reveal成功後に対象値だけをclient stateへ置き `type=text`、`aria-pressed=true`、`data-reveal-state=stored-visible` とする。再非表示ではAPIを呼ばず、stored originの値を空へしてmaskへ戻す。replacement originは値を保持したままtypeだけを切り替える。

reveal failureでは平文stateを設定せず、password、pressed false、maskを維持し、対象sectionのerror feedbackを表示する。component unmountとpage navigationでもReact state以外へ永続化しない。localStorage、sessionStorage、URL、DOM attribute、analytics、console、server logへ平文を複製しない。

## 保存後mask復帰

保存成功時は対象Secret stateを空へし、visibilityをfalse、originをmaskedへ明示的にresetする。必要なら親制御のvisibility APIまたは安全なkey remountを用いるが、Account ID、Client IDと非対象sectionはremountしない。configured snapshotと対象feedbackを同じ成功更新で反映する。

HTTP error、JSON不正、network errorでは入力値、origin、visibilityを維持し、対象feedbackだけをerrorへ更新する。stored-visibleの未編集値は保存payloadからomitし、編集後のreplacementだけを暗号化対象として送る。

## 権限

resourceはVIEWとUPDATE、`requiresAdminUser:false`。types、catalog、allowed set、layout、landing、permission辞書を同期する。pageはVIEW、PUT保存とPOST revealは `authorizeAdminApi` UPDATEを要求し、UPDATEにはVIEW prerequisiteを要求する。VIEW-only UIではSecret revealを含む変更controlを無効化する。

## 保存API

`DeveloperApiSettingsUpdate` は次のdiscriminated unionを正本とする。

```ts
type DeveloperApiSettingsUpdate =
  | {
      section: "server-to-server-oauth";
      accountId: string;
      clientId: string;
      clientSecret?: string;
    }
  | {
      section: "webhook-only-app";
      secretToken?: string;
    };
```

OAuth payloadはAccount ID、Client ID、任意Client Secret以外を拒否し、Webhook payloadは任意Secret Token以外を拒否する。IDはtrim後1から255文字、Secretはtrimせず1から4096文字。空Secretはpayloadからomitし、null、空文字、cross-section key、未知section、未知keyを400で拒否する。

Hono catch-allのPUT `/api/admin/developer-api` はauthorization、JSON parse、section parser、鍵検証、transactionの順で処理する。初回不足はOAuthで400 `DEVELOPER_API_OAUTH_SECRET_REQUIRED`、Webhookで400 `DEVELOPER_API_WEBHOOK_SECRET_REQUIRED`。成功は200でredacted snapshot、暗号利用不能は503 `DEVELOPER_API_ENCRYPTION_UNAVAILABLE`、予期しない保存失敗は500 `DEVELOPER_API_SAVE_FAILED` とする。一方の更新で他方のID、ciphertextを変更しない。

## 設定済みSecret reveal API

同じHono catch-allへPOST `/api/admin/developer-api/reveal` を追加する。request型は次を正本とし、bodyに他keyを許可しない。

```ts
type DeveloperApiSecretField = "clientSecret" | "secretToken";
type DeveloperApiSecretRevealRequest = {
  field: DeveloperApiSecretField;
};
type DeveloperApiSecretRevealResponse = {
  field: DeveloperApiSecretField;
  value: string;
};
```

処理順はUPDATE authorization、JSON parse、exact parser、要求fieldのciphertextだけをselect、鍵検証、field固有AADで復号、response生成とする。成功は要求fieldと平文valueだけを200で返す。`Cache-Control: private, no-store, max-age=0`、`Pragma: no-cache`、`Expires: 0` を付ける。未設定は404 `DEVELOPER_API_SECRET_NOT_CONFIGURED`、鍵欠落・不正は503 `DEVELOPER_API_ENCRYPTION_UNAVAILABLE`、ciphertext破損・AAD不一致を含む復号失敗は500 `DEVELOPER_API_SECRET_REVEAL_FAILED` とする。error responseとlogへ原error、値、長さ、ciphertext、鍵を含めない。

`revealDeveloperApiSecret(prisma, field): Promise<string | null>` は要求されたencrypted columnだけをselectし、既存decrypt helperを使う。別fieldの値や通常snapshotを同時取得しない。

## 管理API route test

`test/integration/developer-api-route-runtime.test.ts` を追加し、`withIsolatedPostgresDatabase`、Prisma migration deploy、Better Auth signed session cookie、実Hono route exportを使う。保存PUTとreveal POSTの双方でFULL_ACCESS、VIEW-only、password-change必須、未認証actorを作る。

保存は401、403、malformed JSON、cross-section、初回Secret不足、鍵不備503、OAuth-onlyとWebhook-only 200、他section維持、response redaction、DB非変更を検査する。revealは401、403、malformed、未知key、未知field、未設定404、鍵不備503、tampered ciphertext 500、両field成功200を検査する。成功bodyは要求fieldとvalueだけ、headerはno-store系、JSON文字列は他Secret、ciphertext、鍵を含まないことを検査する。

既存service-level integration testはtransaction、暗号化、他section維持、Webhook-first createを担当し、route testで置き換えない。

## 暗号化

暗号鍵はbase64 decode後32 byte。AES-256-GCM、random 12-byte IV、16-byte tag、AAD `site-developer-api-settings:<field>:v1` を使い、`v1.<iv-base64url>.<ciphertext-base64url>.<tag-base64url>` を保存する。鍵欠落・不正は503とし、鍵、平文、ciphertext、復号error詳細をlogやerror responseへ出さない。

## 暗号鍵provisioning guard

`scripts/deploy/lib/database.ts` に次の契約を追加する。

```ts
type DeveloperApiCiphertextState =
  | "table-absent"
  | "unconfigured"
  | "configured";

inspectDeveloperApiCiphertextState(
  directUrl: string,
): Promise<DeveloperApiCiphertextState>;
```

pg Clientでdirect URLへ接続し、transaction内で `to_regclass` によりtable有無を確認する。tableがなければ `table-absent`。tableがある場合は `information_schema.columns` で2つのencrypted columnが揃うことを確認し、欠落、重複、想定外schemaはthrowする。いずれかがNULLでないrowの `EXISTS` だけを取得し、値、長さ、ciphertextを取得・返却・logしない。接続、query、rollback失敗は安全側へthrowする。

deployment workflowはProduction environment audit後、最初のVercel environment mutationより前に、鍵欠落時だけinspectionする。`table-absent` と `unconfigured` の場合だけ32 byte random base64鍵を生成する。`configured`、schema不完全、inspection failureでは新鍵生成と全Vercel environment mutationを0回のまま停止する。鍵が既にProductionに存在する場合はinspectionを行わず維持する。

## Migration・recovery

nullable encrypted columnsを持つsingleton tableのadditive migrationを維持する。`REVIEWED_MIGRATION_COUNT`、fresh database integration、初回・再デプロイ文書を現在の10件へ揃え、次の追加migrationを11件目と記載する。メンテナンス設定が5番目である歴史的記述は変更しない。

自動rotationは対象外。rollbackはtableを保持し、dropはciphertext退避と再入力確認なしに行わない。鍵喪失時は同一鍵復旧か両Secret再入力のみをrecoveryとし、既存ciphertextがある状態で新鍵を生成しない。inspectionからcandidate promotion完了までDeveloper API設定を変更しないことを運用手順へ明記する。

## 多言語

menu、page、section、field、revealing、reveal error、saving、saved、validation、resource titleとdescriptionをja、en、zh-Hans、zh-Hant、koへ同shapeで追加する。Secret入力欄下のhelpとconfigured説明文は追加しない。eye labelは既存show passwordとhide password文言を再利用し、新しい表示文言をcomponentへハードコードしない。

# インターフェースとデータフロー

1. layoutとpageがVIEWを検査し、loaderはIDとencrypted columnのnull可否だけをredacted snapshotへ変換する。
2. 設定済み空inputのeye操作は対象fieldだけをPOST revealへ送る。APIはUPDATEを認可し、対象columnだけを復号してno-store responseで返す。clientは表示中だけ平文をReact stateへ保持する。
3. stored-visibleを再非表示にするとclientは平文を破棄してmaskへ戻る。編集した場合はreplacement originへ移行し、その後のtoggleは通信しない。
4. OAuth formはsection、ID、replacement Client SecretだけをPUTし、Webhook formはsectionとreplacement Secret TokenだけをPUTする。maskと未編集のreveal値は送らない。
5. 保存APIはauthorization、parser、鍵検証、暗号化、transactionの順で対象sectionだけを更新し、redacted snapshotを返す。
6. 保存成功時は対象Secretのvalue、origin、visibilityを安全状態へresetする。失敗時は入力とvisibilityを維持する。
7. deploy時にProduction鍵が存在すれば維持する。欠落時はDB inspectionでtable不存在または未設定を証明した場合だけ新鍵を生成し、既存ciphertextまたは不明ならVercel mutation前に停止する。
8. migration後もciphertext tableを保持し、同一鍵復旧または管理画面からの両Secret再入力をrecovery境界とする。

# テスト計画

- `node --import tsx --test test/developer-api.test.ts test/password-input.test.ts test/developer-api-crypto.test.ts test/integration/developer-api-runtime.test.ts`: navigation、2 form、Secret help paragraphと`aria-describedby`の不在、parser、初期mask、ローカルtoggle、stored reveal state遷移、再非表示破棄、edit-to-replacement、保存成功reset、失敗時維持、暗号roundtrip、field AAD、service preserveを検査する。
- `node --import tsx --test test/integration/developer-api-route-runtime.test.ts`: isolated PostgreSQLと実Hono routeでPUTとPOST revealの401、403、400、404、503、500、200、DB非変更、exact response、no-store、非漏えいを検査する。
- `node --import tsx --test test/admin-access-authorization.test.ts test/admin-access-ui.test.ts`: VIEW prerequisite、VIEW-only disabled、menu、page guardを検査する。
- `npm run test:deploy`: inspectionのtable不存在、未設定、設定済み、不完全schema、接続失敗、鍵既存skip、Vercel mutation 0回、文書の10件と11件目記述を検査する。
- `npm run test:admin-access:db`: fresh databaseへ10 migrationを適用し、最新migration名、singleton table、encrypted columnsを検査する。
- `npm run lint`、`npm run typecheck`、`npm run build`、`git diff --check` を実行する。route、server、deploy境界を変えるためproduction buildを必須とする。
- `node .agents/skills/plan/scripts/build-prototype-css.mjs plans/developer-api-settings/prototype`、`prototype-revision.mjs`、`parity-runner.mjs validate plans/developer-api-settings/prototype` を実行する。
- `$plan` の最終Browser smokeはdeveloper-apiのstored-secret-visibleを1280×900と390×844 lightで選び、合成値の表示、type、pressed、reveal-state、再非表示破棄、console、実測scrollを確認する。productionは未実装差分または安全なfixture不足を未検証として明示する。
- 次の `$implement` はproduction編集と静的検証後にfull scopeの全96行を1回だけ実行し、schema-version-3 `implementation-parity.json` を作る。

# 前提・対象外・リスク

## 前提

- 設定済みSecretの表示はUPDATE権限を持つ管理者による明示操作であり、その端末画面とブラウザ開発者ツールから値を閲覧できることをユーザーが許容する。
- runtimeへ同一暗号鍵を安全に配布できる。比較fixtureはja、FULL_ACCESS、query空、scroll 0である。
- deploy inspection開始からcandidate promotion完了まで管理者はDeveloper API設定を変更しない。route runtime testはlocal PostgreSQLの一時databaseを使い既存databaseを変更しない。

## 対象外

- Zoom portalでのapp作成、token発行、Webhook/API疎通、copy、regenerate、Secret削除、自動鍵rotation。
- 永続的なSecret表示audit logの新設。repositoryに既存audit基盤がないため、必要なら別要件として設計する。
- DBの鍵versionとfingerprint管理、既存ciphertextの自動復号確認、鍵の自動backup。
- この `$plan` 中のproduction、test、docs、config、Git、evidence、review変更。変更対象は同一planのgoalとprototypeだけである。

## リスク

- reveal responseはno-storeでも、権限を持つ管理者の画面、メモリ、ブラウザNetwork panelから閲覧できる。端末共有、画面録画、拡張機能による取得はapplicationだけでは防げない。
- DB inspectionとpromotionの間に旧deploymentからSecretが保存される競合を完全には排除できない。運用停止前提を守れない環境では鍵version設計を追加するまで新鍵を自動生成しない。
- deploy allowlist、DB inspection、route test、文書更新を欠いた状態ではproductionへ出さない。鍵、平文、ciphertext、接続URLをlogへ出さない。
- credentialの公式上限はrepositoryに根拠がないため文字種を制限せず4096文字を防御的上限とする。疎通で別上限が判明した場合はplan更新が必要である。
- stored-secret-visibleとpost-save-masked parityは認証情報の取得・保存side effectを伴う。`$implement` はagent-owned合成fixtureを確認し、他者管理の値では実行せず未検証理由を記録する。
