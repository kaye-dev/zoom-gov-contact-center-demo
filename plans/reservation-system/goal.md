# 目的と完了条件

## 目的

自治体向けデモの管理画面へ予約状況を管理する `/admin/reservations` を追加し、日単位の予約と日時・施設枠単位の予約を同じ月間カレンダーから確認できるようにする。固定された4業務の受付規則から空の予約枠を算出し、匿名の予約占有件数をPostgreSQLへ保存する。表示月の全業務へデモ予約をランダム生成する操作を提供し、Zoom Virtual Agent連携前でも空きあり、残りわずか、満員が混在するデモを準備できるようにする。

## 完了条件

- VIEW権限を持つ利用者のAdminShellに「予約システム」が主要業務の直接linkとして表示され、`/admin/reservations` へ遷移する。
- マイナンバーカード交付・更新、無料法律相談、粗大ごみ収集、公民館・市民会館・会議室利用の4業務を切り替えられる。
- 粗大ごみ収集は日付予約、残る3業務は時間または施設利用枠を持つ日時予約として表示される。
- 月間カレンダーで日を選ぶと、日付予約は1日分、日時予約は選択日の時間・施設枠ごとの定員、予約数、残数、状態を表示する。
- UPDATE権限を持つ利用者が「表示月のデモ予約を生成」を実行すると、表示月の4業務のデモ予約だけが再生成され、空き、部分占有、残りわずか、満員が混在する。
- 予約占有件数はPostgreSQLに永続化され、ページ再読込と別の管理セッションでも同じ件数を表示する。
- ja、en、zh-Hans、zh-Hant、ko、light/dark、390px、sm境界、lg境界、desktop、VIEW-onlyを含むUI契約を満たす。
- Zoom Virtual Agent、住民向け予約画面、予約者情報、予約確定、受付番号、通知送信は実装しない。

## 要件クロージャ

| 要件 | goal内の設計 | prototype | テスト | 完了条件 |
| --- | --- | --- | --- | --- |
| 管理画面に「予約システム」ページを追加する | 「管理ナビゲーションと権限」「ページ構成」 | `plans/reservation-system/prototype/index.html#reservation-system-page` 全state | `test/reservations.test.ts` の navigation-and-page case | VIEW権限時に `/admin/reservations` linkと同routeのH1「予約システム」が表示される |
| 予約対象として4業務を採用する | 「業務カタログ」 | `#service-select` datetime-selectedとdate-selected | `test/reservations.test.ts` の service-catalog case | 指定した4業務だけが固定順で選択肢になる |
| 日付予約と日時予約の異なる方式を表示する | 「業務カタログ」「ページ構成」 | date-selectedとdatetime-selected | `test/reservations.test.ts` の booking-method-rendering case | 粗大ごみは日付予約、他3業務は日時または施設利用枠になる |
| 予約システムに月間カレンダーを表示する | 「カレンダー」 | `#calendar-card` 全state | `test/reservations.test.ts` の calendar-grid case | 日曜始まり7列で対象月の全日と受付状態が表示される |
| 日時予約で選択日の予約可能な時間を表示する | 「選択日詳細」 | datetime-selectedの `#slot-list` | `test/reservations.test.ts` の datetime-selected-slots case | 選択日の各時間枠に開始・終了、定員、予約数、残数、状態が表示される |
| 日付予約で選択日の1日枠を表示する | 「選択日詳細」 | date-selectedの `#slot-list` | `test/reservations.test.ts` の date-selected-slot case | 選択日に「収集日」の定員20件、予約数、残数、状態が1件表示される |
| 過去日と受付曜日外を予約不可にする | 「カレンダー」「日時と範囲」 | 全stateのdisabled day | `test/reservations.test.ts` の disabled-date-boundaries case | 過去日と受付曜日外はdisabledかつ「受付なし」になり詳細枠を表示しない |
| 空き状況を文字と色で区別する | 「空き状態」 | calendarとslot badge | `test/reservations.test.ts` の availability-status case | `AVAILABLE`、`LIMITED`、`FULL`、`UNAVAILABLE` がそれぞれ空きあり、残りわずか、満員、受付なしになる |
| ランダムに予約枠を埋めるbuttonを配置する | 「デモ予約生成」「ページ構成」 | `#random-fill-button` generated-success | `test/reservations.test.ts` の demo-fill-button case | 見出し右側またはmobileで見出し下に「表示月のデモ予約を生成」が表示される |
| ランダム生成は表示月の全4業務を対象にする | 「デモ予約生成」 | generated-success | `test/integration/reservations-route-runtime.test.ts` の fills-all-services case | POST成功後に4業務すべての対象月snapshotが更新される |
| 再生成は既存デモ予約だけを置き換える | 「デモ予約生成」「永続化」 | generated-success | `test/integration/reservations-route-runtime.test.ts` の preserves-non-demo case | `isDemo=true` は置換され、`isDemo=false` の行は同じIDと値で残る |
| 生成結果に空き、部分占有、残りわずか、満員を混在させる | 「デモ予約生成」 | generated-successのcalendarとslot list | `test/reservations.test.ts` の generated-distribution case | 2件以上の枠を持つ業務で空、半数、残り1、満員が各1枠以上になる |
| デモ予約をPostgreSQLへ永続化する | 「永続化」 | prototypeはlocal mockのためDBは対象外 | `test/integration/reservations-route-runtime.test.ts` の persistence-roundtrip case | 再生成後の別queryと別Prisma clientが同じ件数を返す |
| 空のDBでも受付可能枠を表示する | 「業務カタログ」「空き照会」 | datetime-selectedとdate-selected | `test/reservations.test.ts` の empty-database-availability case | 予約行0件でも固定カタログから対象月の受付枠が表示され、予約数0になる |
| GET管理APIで1業務1か月の空き状況を返す | 「管理API」 | 業務・月切替interaction | `test/integration/reservations-route-runtime.test.ts` の get-calendar-contract case | `GET /api/admin/reservations?service=<key>&month=YYYY-MM` が200と `{ calendar: ReservationCalendarSnapshot }` を返す |
| POST管理APIで表示月のデモ予約を再生成する | 「管理API」 | generated-success | `test/integration/reservations-route-runtime.test.ts` の post-demo-fill-contract case | `POST /api/admin/reservations/demo-fill` が `{ month: "YYYY-MM" }` を受け、200と4業務のcalendarと生成件数を返す |
| 管理APIの入力と認証を検証する | 「管理API」「管理ナビゲーションと権限」 | view-only state | `test/integration/reservations-route-runtime.test.ts` の auth-and-validation case | 匿名は401、権限不足は403、不正serviceまたはmonthは400でDBを変更しない |
| VIEW-onlyでは閲覧を維持して生成を禁止する | 「管理ナビゲーションと権限」「ページ構成」 | view-onlyのdisabled buttonとnotice | `test/reservations.test.ts` の view-only-controls case | カレンダーは表示され、生成buttonはdisabled、権限理由がstatusとして表示される |
| 全表示文言を5ロケールへ追加する | 「多言語」 | prototypeはja fixture | `test/reservations.test.ts` の all-locales-copy caseと `npm run typecheck` | 5辞書が同じshapeで全予約文言を非空で持ち、TypeScript errorが0件になる |
| 既存AdminShell、theme、semantic tokenを維持する | 「UI契約」 | `#reservation-system-page` light/dark | parity matrixのpage-screenshot、admin-shell-dom、computed UI | 市名、管理label、dropdown、ログアウト、幅、余白、token、focusがproductionと一致する |
| 390px、sm、lg、desktopでresponsive契約を満たす | 「UI契約」「ページ構成」 | 48行matrixの全viewport | parity matrixのcalendar-geometryとpage-screenshot | 390、639、640、1023、1024、1280pxで横overflow、clipping、重なりがない |
| keyboardとfocusで全操作を利用できる | 「アクセシビリティ」 | 全state、generated-successのfocus | `test/reservations.test.ts` の semantic-controls caseとparity focus probe | native selectとbuttonをTab、Enter、Spaceで操作でき、生成後focusが生成buttonに残る |
| DBへ予約者の個人情報を保存しない | 「永続化」「プライバシー」 | prototypeの合成件数のみ | `test/reservations.test.ts` の no-pii-schema case | reservation booking列とAPI responseに氏名、住所、電話、email、相談内容が存在しない |
| migrationを現行deploy allowlistへ追加する | 「Migrationとrollback」 | 対象外 | `scripts/deploy/integration-test/admin-access-database.test.ts` の fresh database caseと `npm run test:deploy` | fresh DBで11件が適用され、最新migrationとmanifestのhash・classificationが一致する |
| Zoom Virtual Agentとの組込みを今回行わない | 「対象外」 | chatbotやlauncherを追加しない全画面 | `test/reservations.test.ts` の no-virtual-agent-integration case | Zoom SDK、Virtual Agent API、住民向け予約確定routeへの新規参照がない |

# 現状と根拠

- HEADは `3142a2a7fb3c402fa321e5bda5591b8f35e47f93`。working treeにはユーザー所有の未追跡 `prompt.txt` があり、本計画では閲覧、変更、削除、stageを行わない。
- `app/admin/AdminShell.tsx` はユーザー管理と設定の2dropdown、ログアウトを持ち、`app/admin/layout.tsx` がresourceごとのVIEW権限から可視項目を決める。予約resource、route、文言は存在しない。
- `lib/admin-access/types.ts` と `lib/admin-access/catalog.ts` が管理resourceの型、対応action、対象pathを正本にし、FULL_ACCESSはcatalog追加分も動的に許可する。custom roleの未設定cellは暗黙拒否になる。
- 設定画面はServer ComponentでVIEWを要求し、Client Componentへ初期snapshotと更新可否を渡し、Hono catch-all `app/api/[[...route]]/route.ts` の管理APIでUPDATEを再認可する。
- `prisma/schema.prisma` はPostgreSQLを使用し、現行migrationは10件。`scripts/deploy/migrations.manifest.json` とreview済みmigration chainが名前、SHA-256、classificationを固定するため、新migrationと同時更新が必要である。
- `app/i18n/dictionaries.ts` はja、en、zh-Hans、zh-Hant、koを単一 `Dictionary` 型で管理し、`.claude/rules/i18n.md` はすべての新規表示文言を同時追加するよう要求する。
- UIはTailwind CSS v4と `app/globals.css` のsurface、line、fg、accent tokenを使用し、light/darkはroot document classで切り替える。既存管理画面にはproduct-facing theme toggleを置かない。
- Next.js 16.3.0のApp Routerではleaf `page.tsx` をServer Component、対話部分を明示的なClient Componentに分離できる。既存Hono catch-all routeはGET、POSTを同じNode.js runtimeで追加できる。
- plan開始時のport 3000はユーザー所有の既存SSH loopback listener PID 41060であり、local processのcwd、command、対象checkout mount、認証fixtureはsandboxから確認できない。production `/admin/reservations` は未実装のため、plan smokeではprototype loadとclosest live shellだけを確認し、新route parityは `$implement` の完了直前まで未検証とする。

# 実装方針

## UI契約

- UI変更: あり
- prototype: `plans/reservation-system/prototype/`
- approval contract: plans/reservation-system/prototype/ui-contract.json — version 1
- validation profile: plans/reservation-system/prototype/parity-spec.json — version 1
- prototype revision: `sha256:b07fa0e2dedd997d8f0f200496db4595c73e4fad2f0c86c710ccdd8206e2a2c9`
- validation profile digest: `sha256:7bd7b42fab12404d6428103ec7c4b0739de7da966b68811d058dbb289714db87`
- UI承認方式: 次の明示的な `$implement` が現goal、prototype revision、validation profile digestを承認する
- production baseline: 完全なsource inventory、checkout、HEAD、planned route、runtime所有条件は `ui-contract.json` を正本とする
- comparison conditions: ja、DPR 1、scroll x 0・y 0、light/dark、2026年9月の合成予約fixture、FULL_ACCESSとVIEW-only、state別service・month・date query
- baseline state inventory: datetime-selected、date-selected、generated-success、view-only
- theme contract: productionのlight/dark document class、native selectのcolor-scheme、semantic tokenを使用し、product-facing toggleを追加しない
- responsive contract: 1280×900、390×844、639×844、640×844、1023×844、1024×844。smでheaderと見出しaction、lgでcalendarと詳細の1列・2列が変わる
- styling pipeline: 2行の `tailwind.css` が `app/globals.css` をimportし、prototype HTMLとJavaScriptの完全なutility classから `styles.css` を生成する
- 視覚的不変条件: 未来市、管理画面label、2dropdown、既存設定項目、ログアウト、sticky header、max-w-7xl、px-4・md:px-6、font、border、shadow、focus、disabled、semantic token
- 意図した差分: 予約システム直接navigation、予約業務select、月操作、7列calendar、選択日詳細、状態badge、デモ予約生成、VIEW-only notice。prototypeだけlinkを `./index.html` とし、生成はlocal合成件数だけを変更する
- stateとinteraction: 業務切替、月移動、日選択、日付枠、時間枠、施設枠、生成pending・success、VIEW-only、admin menu、keyboard、focus
- comparison targets: reservation-system 1 target。共通AdminShellを含む `index.html` と将来の `/admin/reservations` 全画面
- parity matrix: 1 target × 4 state × 6 viewport × 2 themeの48行。新規prototype・contract、AdminShell navigation構造、lg responsive、native selectを変更するため `$implement` はfull scopeとする

## 管理ナビゲーションと権限

`AdminResourceKey` とcatalogへ `reservations` を追加し、`displayPaths: ["/admin/reservations"]`、`supportedActions: ["VIEW", "UPDATE"]`、`requiresAdminUser: false` とする。allowed permission set、全ロケールのresource title・description、role matrixを同期する。既存custom roleは新cell未設定のため暗黙拒否、FULL_ACCESSは動的許可を維持する。

`AdminNavigationItemKey`、layoutのvisible items、admin landing候補へ `reservations` を追加する。AdminShellではdropdownを増やさず、settings dropdownとログアウトの間に主要業務の直接link「予約システム」を置く。VIEWがなければlinkをrenderしない。`/admin/reservations` だけをcurrent pageとし、`aria-current="page"` と `text-accent` を付ける。

pageは `requireAdminAccess("reservations", "VIEW", "/admin/reservations")` を実行し、初期calendarと `canAdminAccess(actor, "reservations", "UPDATE")` をClient Componentへ渡す。GETはVIEW、デモ生成POSTはUPDATEをHono routeで再認可する。

## 業務カタログ

`lib/reservations.ts` に次の固定順のカタログを置き、DBへ営業時間や定員を重複保存しない。日付・曜日判定はAsia/Tokyoのcalendar dateで行い、時間は同日の0から1439の分数で表す。

| service key | 表示名 | method | 受付日 | 枠 | 定員 |
| --- | --- | --- | --- | --- | --- |
| `my-number-card` | マイナンバーカード交付・更新 | `DATETIME` | 月曜から金曜 | 09:00から17:00、30分単位 | 各3件 |
| `legal-consultation` | 無料法律相談 | `DATETIME` | 水曜 | 13:00から16:00、60分単位 | 各1件 |
| `bulky-waste` | 粗大ごみ収集 | `DATE` | 月曜から土曜 | 1日枠、startMinute 0 | 20件 |
| `civic-facility` | 公民館・市民会館・会議室利用 | `DATETIME` | 毎日 | 午前09:00–12:00、午後13:00–17:00、夜間18:00–21:00 | 各2件 |

祝日、臨時休業、施設別部屋選択は扱わない。カタログから受付枠を算出するため、booking rowが0件でも空き枠を表示できる。

## 日時と範囲

page、API、DB serviceへ渡す `now` はAsia/Tokyoへ変換して今日を決める。閲覧可能月は今日を含む月から11か月先までの12か月とし、前月・次月buttonを境界でdisabledにする。対象月内の過去日と受付曜日外は `UNAVAILABLE` とし、選択不能にする。初期serviceは `my-number-card`、初期月は今月、初期日は今日が受付日なら今日、それ以外は同月の最初の受付可能日とする。queryの有効な `service`、`month=YYYY-MM`、`date=YYYY-MM-DD` は再現し、無効値は初期値へ正規化する。

## 空き照会と空き状態

固定カタログから対象月の枠を作り、`reservation_bookings` をservice、date、startMinuteで集計して予約数へ加える。予約数が定員を超える不整合ではremainingを0へclampし、server logへservice、date、startMinuteだけを記録して `FULL` として返す。booking IDやpayloadはlogへ出さない。

slotと日の状態は次で固定する。remainingが0なら `FULL`、remainingが1以上かつ `max(1, ceil(capacity × 0.25))` 以下なら `LIMITED`、それ以外は `AVAILABLE`、受付枠なしまたは過去日は `UNAVAILABLE`。日時予約の日summaryは全slotのcapacity、booked、remainingを合算して同じ閾値を適用する。

## ページ構成

`app/admin/reservations/page.tsx` をServer Component、`ReservationSystemView.tsx` をClient Componentとする。全体は既存mainの `max-w-7xl px-4 py-8 md:px-6` 内に置く。

- 見出し行: H1、説明、UPDATE時に有効な「表示月のデモ予約を生成」。VIEW-onlyではbuttonをdisabledにし、直下へ権限理由のstatusを表示する。
- control card: native service select、前月、今月、次月、method badge、業務説明。業務または月変更時はURLを `router.replace` で正規化し、GET APIの最新snapshotが返るまで現snapshotを保持してcontrolをbusyにする。失敗時は現snapshotを保持してerror statusを表示する。
- calendar: 日曜始まりの7列grid。各日buttonへ完全な日付と状態のaccessible name、選択日に `aria-pressed=true`、受付外にnative disabledを付ける。表示は日番号、状態文字、日付予約では件数、日時予約では空き枠数とする。
- selected date panel: 業務名、完全な選択日、日付予約の1日枠または日時予約の全slotを表示する。各rowは枠label、開始・終了、予約数、定員、残数、状態badgeを持つ。
- responsive: 1024px以上はcalendarと18から24remの詳細を2列、1023px以下は縦積み。calendarは全幅で7列を維持し、cell内copyをwrapする。390pxでもdocument横scrollを発生させない。
- pendingとfeedback: random生成中はbuttonを `disabled`、`aria-busy=true` とし、完了後にaria-live statusを表示してfocusをbuttonへ維持する。errorでは現dataを保持し再試行可能に戻す。

## デモ予約生成

POSTは対象月をvalidation後、PostgreSQL transaction内で `pg_advisory_xact_lock(hashtext('reservation-demo-fill:' || month))` を取得し、同じ月への並行生成を直列化する。対象月の `isDemo=true` を4業務分削除し、`isDemo=false` は保持する。各slotの非デモ件数を定員から差し引き、負の空きを作らない。

各業務の対象slotへ、定員1なら `[0, 1]`、定員2以上なら `[0, ceil(capacity / 2), capacity - 1, capacity]` のcategoryを循環させたpoolを作る。Node.js `crypto.randomInt` を使うFisher–Yates shuffleでslotへ割り当て、非デモ予約で残るcapacity以内にclampする。対象slotが十分ある場合、空、部分占有、残り1、満員を各1枠以上保証する。testでは `RandomIndex` をinjectして順序と件数を固定する。

transaction成功後だけ4業務のcalendar snapshotと生成件数を返す。validation failureは400 `RESERVATION_INVALID_REQUEST`、DB failureは500 `RESERVATION_SAVE_FAILED` とし、UIは現snapshotを維持する。error responseとlogへ予約行、DB接続情報、stack、個人情報を含めない。

## 永続化

Prismaへ次のmodelを追加し、expand-compatible migrationで空tableを作る。個々のrowは1件分の占有を表し、定員と営業時間はカタログを正本とする。

```prisma
model ReservationBooking {
  id             String   @id @default(cuid())
  serviceKey     String
  reservationDate DateTime @db.Date
  startMinute    Int
  isDemo         Boolean  @default(false)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)

  @@index([serviceKey, reservationDate, startMinute])
  @@index([reservationDate, isDemo])
  @@map("reservation_bookings")
}
```

migration SQLで `serviceKey` を4 keyへ限定し、`startMinute BETWEEN 0 AND 1439` のCHECKを付ける。名前、住所、email、電話番号、相談内容、受付番号の列を作らない。prototypeは同じ件数契約をlocal JavaScriptでmockし、production APIやDBへ通信しない。

## Migrationとrollback

新migrationを現行10件の後ろへexpand-compatibleとして追加し、`scripts/deploy/migrations.manifest.json`、review済みpost-batch chain、direct production test、fresh database integration testの件数、最新名、hashを11件へ同期する。migrationは既存tableを変更せず新tableとindexとCHECKだけを追加する。

rollbackはapplication rollbackを先に行い、新routeとAPIを非公開にする。table dropは保存されたデモ以外の予約を含み得るため自動rollbackしない。削除が必要な場合は件数と `isDemo=false` の有無を直接確認し、別の明示承認付きmigrationで行う。

## 多言語

`Dictionary.admin` へnav labelと `reservationManagement` の見出し、説明、4業務名・説明、method、月操作、曜日、status、件数、権限、pending、success、errorを追加する。ja、en、zh-Hans、zh-Hant、koを同じshapeで提供し、Client Componentは `useI18n()` の `locale` と `t` だけを使用する。日付はlocale対応 `Intl.DateTimeFormat`、時間は24時間の `HH:mm` で表示する。

## アクセシビリティ

業務選択はlabel付きnative select、月操作と日付はbuttonを使用する。全clickable elementへpointer、disabledへnot-allowedを付ける。calendarの日付buttonは完全な日付と状態をaccessible nameに含め、選択状態を `aria-pressed` で表す。空きstatusは色だけでなく文字を併記する。pending、success、error、権限理由はstatusまたはalertで通知し、生成後にfocusを移動しない。AdminShell menuの外側click、blur、Escapeとtriggerへのfocus returnを維持する。

# インターフェースとデータフロー

`lib/reservations.ts` のpublic型を次で固定する。

```ts
type ReservationServiceKey =
  | "my-number-card"
  | "legal-consultation"
  | "bulky-waste"
  | "civic-facility";

type ReservationMethod = "DATE" | "DATETIME";
type ReservationAvailabilityStatus =
  | "AVAILABLE"
  | "LIMITED"
  | "FULL"
  | "UNAVAILABLE";

type ReservationSlotSummary = {
  startMinute: number;
  endMinute: number;
  capacity: number;
  booked: number;
  remaining: number;
  status: ReservationAvailabilityStatus;
};

type ReservationDaySummary = {
  date: string;
  bookable: boolean;
  capacity: number;
  booked: number;
  remaining: number;
  status: ReservationAvailabilityStatus;
  slots: ReservationSlotSummary[];
};

type ReservationCalendarSnapshot = {
  service: { key: ReservationServiceKey; method: ReservationMethod };
  month: string;
  days: ReservationDaySummary[];
};
```

`lib/server/reservations.ts` は次のsignatureを持つ。

```ts
getReservationCalendarSnapshot(
  prisma: PrismaClient,
  input: { service: ReservationServiceKey; month: string; now: Date },
): Promise<ReservationCalendarSnapshot>

regenerateDemoReservations(
  prisma: PrismaClient,
  input: { month: string; now: Date },
  randomIndex?: RandomIndex,
): Promise<{
  month: string;
  generatedCount: number;
  calendars: Record<ReservationServiceKey, ReservationCalendarSnapshot>;
}>
```

管理APIは次で固定する。

- `GET /api/admin/reservations?service=<ReservationServiceKey>&month=YYYY-MM`: VIEW認可、strict query parse、snapshot取得、200 `{ calendar }`。未知key、重複query、余分query、範囲外monthは400 `RESERVATION_INVALID_REQUEST`。
- `POST /api/admin/reservations/demo-fill`: UPDATE認可、exact JSON `{ month: "YYYY-MM" }`、transaction生成、200 `{ month, generatedCount, calendars }`。未知key、null、malformed JSON、範囲外monthは400。

初期page loaderは同じparserと `getReservationCalendarSnapshot` を直接呼び、serializable snapshotをClient Componentへ渡す。clientの業務・月変更はGETを呼び、response成功時だけcalendar state、selected date、URL queryを一括更新する。デモ生成はPOST成功時に `calendars[currentService]` を採用し、追加GETを行わない。

# テスト計画

- `test/reservations.test.ts`
  - navigation-and-page: AdminShellの直接link、layout VIEW filter、admin landing、page VIEW guard、H1をsource assertionする。
  - service-catalog: 4 key、順序、method、曜日、全slot、定員をdeepEqualする。
  - booking-method-rendering、calendar-grid、datetime-selected-slots、date-selected-slot: Client Componentとprototypeのselector、日時・日付表示、7列構造を確認する。
  - disabled-date-boundaries: Asia/Tokyoの今日、月初、月末、受付曜日外、12か月境界を固定時刻で検証する。
  - availability-status: capacity 20と3と1についてAVAILABLE、LIMITED、FULL、UNAVAILABLEの閾値を全境界で検証する。
  - empty-database-availability: booking 0件でカタログ由来の全slotとbooked 0を検証する。
  - generated-distribution: injectしたrandom indexで4業務のcategory、定員clamp、生成件数を検証する。
  - demo-fill-button、view-only-controls、semantic-controls: pointer、disabled、aria-busy、status、aria-pressed、focus契約をsource assertionする。
  - all-locales-copy: 5 localeの予約辞書shape、4業務、status、errorを非空で検証する。
  - no-pii-schema: Prisma modelとmigrationに許可列だけがあり、PII列がないことを検証する。
  - no-virtual-agent-integration: 予約実装差分にZoom SDK、Virtual Agent API、住民向け予約確定routeがないことを検証する。
- `test/integration/reservations-route-runtime.test.ts`
  - isolated PostgreSQL、実migration、Better Auth signed session、実Hono handlerでGETとPOSTを呼ぶ。
  - get-calendar-contract、post-demo-fill-contract、fills-all-services、preserves-non-demo、persistence-roundtrip、auth-and-validationを実行する。
  - 並行した同月POSTが直列化され、最終DB件数が1回分のcapacity内に収まることを検証する。
- 既存回帰
  - `test/admin-access-authorization.test.ts`、`test/admin-access-ui.test.ts`、`test/admin-access-user-authority.test.ts` でreservationsのVIEW prerequisite、FULL_ACCESS、implicit deny、permission matrixを確認する。
  - `test/admin-shell.test.ts` でsticky shell、direct reservations link、390px wrappingを確認する。
  - `scripts/deploy/integration-test/admin-access-database.test.ts` とdeploy unit testで11 migration、最新名、manifest hash、expand-compatibleを確認する。
- 実行command
  - `node --import tsx --test test/reservations.test.ts test/admin-shell.test.ts test/admin-access-authorization.test.ts test/admin-access-ui.test.ts test/admin-access-user-authority.test.ts`
  - `node --import tsx --test test/integration/reservations-route-runtime.test.ts`
  - `npm run test:deploy`
  - `npm run test:admin-access:db`
  - `npm run typecheck`
  - `npm run lint -- app/admin/reservations app/admin/AdminShell.tsx app/admin/layout.tsx app/admin/page.tsx app/api/[[...route]]/route.ts app/i18n/dictionaries.ts lib/reservations.ts lib/server/reservations.ts test/reservations.test.ts test/integration/reservations-route-runtime.test.ts`
  - `npm run build`。新規App Router page、Hono route、Prisma生成型、server/client境界を変更するため必要とする。dev-server baselineを再確認し、ユーザー所有runtimeとcheckout outputを共有する場合は安全な隔離buildができなければblockedとする。
  - `node .agents/skills/plan/scripts/build-prototype-css.mjs plans/reservation-system/prototype`
  - `node .agents/skills/plan/scripts/parity-runner.mjs validate plans/reservation-system/prototype`
  - `node .agents/skills/plan/scripts/prototype-revision.mjs plans/reservation-system/prototype`
- `$implement` のproduction編集前にui-contractの全baseline source、HEAD、checkout・mount、contract/profile digest、full matrixを静的照合する。完了候補の最後だけ、実装済み `/admin/reservations` とprototypeを同じfixture、authorization、query、theme、viewport、DPR、実測scrollでfull 48行確認し、schema version 3のfinal parityへ記録する。

# 前提・対象外・リスク

## 前提

- 「日時の場合、選択した日から予約できる日付を表示」は、確定済み判断に従い「選択日の予約可能な時間枠または施設枠を表示」と解釈する。
- 予約対象は確定済みの「シナリオ＋多様性」4業務、永続化はDB・管理APIまで、ランダム生成は表示月の全業務、生成対象は匿名デモ予約とする。
- 自治体は日本国内、業務calendarの正本timezoneはAsia/Tokyoとする。
- 予約営業時間と定員はデモ用固定値であり、管理画面から編集しない。
- productionの認証fixtureはFULL_ACCESSとreservations VIEW-onlyを安全に用意できるものとする。実データをrandom生成に使用しない。

## 対象外

- Zoom Virtual Agent、Zoom Web Chat、Zoom API、Webhookとの接続。
- 住民向け検索・予約・変更・取消、管理者による手動予約、予約者氏名・住所・連絡先、受付番号、料金、決済、email・SMS通知。
- 祝日、臨時休業、施設・部屋・担当者ごとの在庫、複数人予約、待ち行列、キャンセル枠、監査log、CSV import・export。
- 既存デモシナリオの「チャットでは予約確定しない」というknowledge base文言の変更。
- production deploy、共有DB migration適用、seed、commit、push、PR。

## リスク

- 固定カタログ変更後に既存の非デモ予約が新営業時間外へ残る可能性がある。将来カタログを変更する場合は該当row件数をinspectionし、互換方針を別goalで決める。
- capacityはapplication serviceで保証しDB単独制約ではない。将来Virtual Agentの予約作成APIを追加するときは同じslot単位のtransaction lockとcapacity再確認を必須にする。
- `startMinute` はAsia/Tokyoのlocal timeでありtimezone offsetを持たない。国内単一timezoneの前提を変える場合はschema migrationが必要になる。
- ユーザー所有SSH port-forwardの接続先、checkout、fixture、authorizationはplan時点で証明できない。production route未実装またはruntime driftのままではpage parityをpass扱いにしない。
- random生成は対象月のデモ予約を置換する。UI copyで範囲を明示し、非デモ行を保持するintegration testが失敗した場合はmutationを出荷しない。
