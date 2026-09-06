# 目的と完了条件

## 目的

既存の自治体テナント `lg` を非回帰で維持したまま、Hostで分離された未来大学テナント `univ` を追加する。未来大学は `http://univ.localhost:3000` と `https://demo.univ.keien.dev` で、5言語の学生支援ポータル、FAQ・ニュース・大学固有情報、Zoom Virtual Agentによる予約相談、Zoom Contact Center Video Clientによる即時相談を提供する。

「今すぐ相談」は、写真素材を必要としない3種類の専用React SVGコンポーネントを主役にしたカテゴリカードとする。各カテゴリのZoom Contact Centerキューを15秒間隔で確認し、`受付中`、`現在対応中`、`受付できません`、`状況確認中` をカード単位で更新する。ブラウザは認証情報を保持せず、このアプリの公開集約APIだけをポーリングする。

`/consultation` の入口は、相談方法の比較に加えて「オンライン相談の流れ」「相談前の確認」「オンライン相談のFAQ」を同一ページで案内する。事前確認は項目ごとに境界を持つセルとして区切り、FAQはmain contentの全幅を使う。`予約して相談` と `今すぐ相談` のCTAは2列時に同じ上端・下端へそろえ、全画面shellは短い状態でもフッター下に空白を作らない。

公開画面と管理画面の利用者向け文言はサービス提供者に依存しない表現に統一する。製品・機能名は内部実装と運用手順にだけ保持し、画面では「自動受付」「オンライン相談」「担当窓口」「接続用Webタグ」のように利用者が行うことと状態を直接示す。

## 完了条件

- `lg.localhost` と `demo.lg.keien.dev` は従来どおり未来市を解決し、`univ.localhost` と `demo.univ.keien.dev` は未来大学を解決する。未知Hostの既存fallback契約を壊さない。
- `univ` には日本語、英語、簡体字中国語、繁体字中国語、韓国語の完全な大学コンテンツパックがあり、自治体用 `/life` モデルや文言を偽装して再利用しない。
- 大学専用の `/admissions`、`/academics`、`/campus-life`、`/scholarships`、`/careers`、`/faq`、`/news`、`/consultation` が `univ` Hostだけで表示され、自治体Hostからは大学コンテンツが漏れない。
- 「今すぐ相談」は3カテゴリに独立した大判SVGイラストを表示し、外部画像、写真CDN、カテゴリ画像ファイルを必要としない。カードは添付参考の「ビジュアル、カテゴリ名、受付状態、下部CTA」という情報構成だけを採用し、大学ポータルのフラットな境界線主体のデザインにする。
- 営業時間内かつVideo Client Web TagとキューIDが設定済みの場合だけ状態照会を開始する。キューにReadyな対象エージェントが1人以上いれば相談開始を有効化し、Readyなし・Occupiedありなら `現在対応中` にして当該カードだけを無効化する。OfflineまたはNot Readyしかいない場合は `受付できません`、取得失敗または期限切れは `状況確認中` としてfail closedする。
- クライアントは15秒ごとに公開集約APIを逐次ポーリングし、画面非表示中は停止、復帰時は即時更新する。重複リクエストを作らず、失敗時は最大60秒までbackoffし、45秒を超えた値を受付中として表示しない。
- Zoomへの問い合わせは未来大学専用Server-to-Server OAuth資格情報をサーバーだけで利用し、自治体のOAuth設定を複製または共有しない。返却値はカテゴリ別集約状態だけで、エージェントID、氏名、メール、Zoomトークンを公開・永続化しない。
- 「予約して相談」はZVAのWeb Chatと設定済み音声番号から、相談種別、希望日時、8文字英数字の学籍番号だけを取得し、Zoom Contact Center内の有人キューと標準スケジュール済みコールバックへ引き継ぐ。姓、メール、SMS、独自予約、Meeting自動作成は追加しない。
- `/consultation` のdefault画面は、相談方法の2カード、3段階の利用手順、端末・通信環境・予約準備の事前確認、3件の相談FAQ、個人情報案内を表示する。LIXILページの情報密度と見出し構成だけを参考にし、同社の画像、ロゴ、文言、レイアウト寸法は複製しない。
- 「相談前にご確認ください」は3項目を独立した罫線セルとして表示し、desktopは3列、mobileは1列に積む。項目間の余白だけで区切らず、light/darkの両方で各項目の境界を判別できる。
- 「オンライン相談のよくある質問」は狭い補助カラムに制限せず、見出し行とaccordionの左右端を `/consultation` のmain content左右端にそろえる。
- 公開画面、管理画面、status、error、FAQ回答、`aria-label`、視覚非表示の説明を含む利用者向けUIには `ZVA`、`Zoom Virtual Agent`、`Zoom Contact Center`、`Zoom`、`Video Client`、`Video Flow`、`Web Chat` を表示しない。予約受付は「自動受付」、即時相談は「オンライン相談」「担当窓口」、管理設定は「接続用Webタグ」と表現する。
- desktopの2カードは本文量に関係なくCTAをcard下端へ固定し、`予約相談を始める` と `今すぐ相談へ進む` の上端・下端を一致させる。`今すぐ相談` には `相談内容に合わせて3つの窓口から選択` を表示する。
- `#app`、公開main、footerを `min-height: 100vh` の縦flex shellにし、内容がviewportより短い画面でもfooter bottomがviewport bottomより上へ来ないようにする。内容が長い場合は通常のdocument scrollとする。
- 起動成功時に `STARTUP_URL=http://lg.localhost:${HOST_PORT}` と `TENANT_URL_UNIV=http://univ.localhost:${HOST_PORT}` を出し、指定4行とStudio URLをTTY条件下だけ配色する。`CI`、`NO_COLOR`、リダイレクトではANSIを出さない。
- `univ` の5言語・電話・チャット・メンテナンス・オンライン相談設定を一度だけ安全に作るidempotent migrationがあり、自治体の電話番号、Web Tag、OAuth秘密情報、予約データを複製しない。
- 自動テスト、lint、typecheck、必要なmigration review chain、対象diff確認が成功し、下記のユーザー動作確認を完了できる。

## 要件クロージャ

| 要件 | goal内の設計 | prototype | テスト | 完了条件 |
| --- | --- | --- | --- | --- |
| `univ` HostとURL | テナントレジストリ、信頼origin、Host境界、Vercel外部設定を定義 | 全公開画面を未来大学ブランドで提示 | Host解決、origin、ルート境界、未知Host fallback | 開発・本番Hostで未来大学、`lg`で未来市が表示される |
| 5言語の大学固有コンテンツ | 大学辞書型とsite contentを自治体型から分離 | 日本語代表画面と長文・狭幅リスク行 | 全localeのID整合、欠落、自治体語彙混入を検査 | ja、en、zh-Hans、zh-Hant、koですべての大学導線が利用できる |
| 大学情報・FAQ・ニュース | 8ルートと大学専用knowledge baseを定義 | home、information、FAQ、news | route、tenant boundary、FAQ corpus、metadata | 大学Hostだけで大学ページが正しい内容を返す |
| 学生支援UI | navyとcyanの既存semantic token、情報中心hero、支援ジャーニー | homeと情報ページのlight/dark・6境界幅 | component、accessibility、responsive | 承認済みprototypeの構造と操作を実装する |
| SVG相談カード | 3カテゴリ専用React SVG、統一viewBox・stroke・`currentColor` | `now-open` と `now-mixed` の大判SVGカード | SVG component、名称・状態・CTA、外部assetなし | 写真不要で3カテゴリが視覚的に区別できる |
| キュー別リアルタイム状態 | 公開集約API、15秒poll、10秒server cache、45秒stale、status集約 | `now-open`、`now-mixed`、`now-stale` | fake clock、poll lifecycle、集約、429・timeout・stale | Ready、Occupied、unavailable、unknownがカード単位で正しく変わる |
| Zoom認証と最小公開 | `univ` 専用S2S OAuth、最小scope、server-only、集約response | 秘密情報や個人名を表示しない状態UI | token redaction、schema、tenant、rate limit、error mapping | ブラウザ・log・DBに資格情報やエージェント個人情報が出ない |
| 営業時間と未設定時fail closed | JST平日09:00–17:00、設定有無と状態取得を順にgate | `now-closed`、`now-unconfigured` | JST境界、祝日非対応の明示、button非表示・無効 | 時間外・未設定・staleで開始操作が出ない |
| 予約相談 | ZVA chatと音声、3項目、Zoom標準callback | reserveとchat-triggered | tag、電話、言語公開条件、アプリ非保存 | 外部予約機能なしでZoom内へ引き継がれる |
| `/consultation` に利用手順・事前確認・FAQを追加し、LIXILの情報密度だけを参考に大学固有文言で表示する | `# 実装方針` の「大学UIとSVGカテゴリカード」で相談入口の4セクションと転載禁止境界を定義 | `plans/univ-tenant-portal/prototype/consultation.html?state=default` に相談方法、3段階フロー、3項目の事前確認、3件FAQを表示 | `test/university-consultation.test.tsx` の `renders university guidance without LIXIL assets or copy` が各見出し・大学文言の存在と `lixil.co.jp`・LIXIL画像参照0件を検証 | 本番 `/consultation` に4セクションが表示され、LIXILの画像・ロゴ・文言・外部参照が0件になる |
| 「相談前にご確認ください」を項目ごとに区切る | `# 実装方針` の「大学UIとSVGカテゴリカード」で3項目をgapなしの罫線セルとして定義 | `plans/univ-tenant-portal/prototype/consultation.html?state=default` の1440x900で3列、390x844で1列の独立セルを提示 | `test/university-consultation.test.tsx` の `separates pre-consultation guidance items` が3項目、共有grid、各cellの境界classを検証し、UI-CHECK-13が両breakpointを目視確認 | 3項目すべての四辺が判別でき、desktopは3列、mobileは順序を保った1列になる |
| 「オンライン相談のよくある質問」を横幅いっぱいに表示する | `# 実装方針` の「大学UIとSVGカテゴリカード」でFAQから補助カラム幅制約を除きmain content幅へそろえる | `plans/univ-tenant-portal/prototype/consultation.html?state=default` の見出し行とaccordionを全幅で提示 | `test/university-consultation.test.tsx` の `renders consultation FAQ at full content width` がFAQ sectionの `w-full` と狭幅max-width class不在を検証し、UI-CHECK-14が左右端差1px以内を実測 | FAQの左右端が同じmain content内の相談方法sectionと1px以内で一致する |
| prototypeおよび本番UIから `ZVA` や `Zoom Contact Center` などの製品固有名詞を除き汎用表現にする | `# 実装方針` の「大学UIとSVGカテゴリカード」で表示文言と内部技術識別子の境界、禁止語、採用語を定義 | `plans/univ-tenant-portal/prototype/index.html`、`consultation.html` のdefault・reserve・chat-triggered・now-open・now-mixed・now-stale・now-closed・now-unconfigured、`admin-consultation.html` のadmin-default・admin-error・admin-savedで汎用文言を提示 | `test/university-provider-neutral-copy.test.tsx` の `renders provider-neutral copy across every university consultation state` が5言語の本文・status・error・accessible nameを全状態でrenderし、`ZVA`、`Zoom Virtual Agent`、`Zoom Contact Center`、`Zoom`、`Video Client`、`Video Flow`、`Web Chat` の一致0件と採用語の存在を検証 | すべての大学UI状態で禁止語が画面・支援技術向け文言に0件となり、「自動受付」「オンライン相談」「担当窓口」「接続用Webタグ」で操作目的が理解できる |
| desktopで `予約相談を始める` と `今すぐ相談へ進む` のCTA位置をそろえ、今すぐ相談に `相談内容に合わせて3つの窓口から選択` を表示する | `# 実装方針` の「大学UIとSVGカテゴリカード」で両cardを `flex-col` としCTA wrapperを `mt-auto` に固定 | `plans/univ-tenant-portal/prototype/consultation.html?state=default` の1440x900で両CTAと追加文を提示 | `test/university-consultation.test.tsx` の `aligns consultation choice actions` が追加文を確認し、UI-CHECK-11が1440x900で両CTAのtop・bottom差1px以内を確認 | 2列表示時に両CTAの上端・下端差が1px以内で、今すぐ相談に指定文が表示される |
| 短い画面状態でもフッター下部に余白を作らない | `# 実装方針` の「大学UIとSVGカテゴリカード」でrootを `min-h-screen flex flex-col`、mainを `flex-1`、footerを末尾に配置 | `plans/univ-tenant-portal/prototype/consultation.html` とshort-state各画面で全高shellを提示 | `test/university-shell.test.tsx` の `keeps footer at or below viewport bottom` がroot classとshell構造を検証し、UI-CHECK-12が1440x1200で `footerRect.bottom >= innerHeight` を確認 | `/consultation` の全状態でfooter下のviewport空白が0pxになり、長い内容は通常scrollできる |
| Video Client設定 | 3カテゴリの公式Web Tagとqueue IDをtenant単位に管理 | admin default、error、saved | strict parser、authz、tenant isolation、secret redaction | 設定済みカテゴリだけを安全に公開する |
| 起動ログ配色 | key/value色、TTY・CI・NO_COLOR規則、両tenant URL | 対象外 | shell integration、ANSI有無、値保持 | 指定した行が条件どおり読みやすく出力される |
| 安全な初期migration | `univ` だけの空またはdisabled既定値、review hash更新 | 対象外 | fresh DB、既存DB、再実行、`lg`非変更 | 秘密・実データをコピーせず一度だけseedされる |
| Zoom運用前提 | 5言語ZVA、3 Video Flow、3 queue、30日完全削除を手動確認 | 利用不可・受付状態を明示 | Zoom実環境チェックリスト | 未対応言語や未検証音声のみ導線を公開しない |

# 現状と根拠

- `lib/tenants.ts` は `TENANT_KEYS = ["lg"]` とHost resolver、production origin、feature群を一元管理している。`lib/auth.ts` はこのproduction origin一覧を信頼originへ反映するため、レジストリ追加を起点にする。
- `app/i18n/tenant-content.ts` の `TenantContentDictionary` は `lifeInfo`、`lifeIndexTitle`、`disasterRadio` など自治体固有形状である。`app/i18n/build-dictionary.ts` も `lgContent` だけを静的に合成しており、大学を同じキーへ押し込むと型とURLの意味が崩れる。
- `app/tenants/lg/content.ts` と `app/tenants/lg/site-content.ts` が自治体データ、`test/tenant-content.test.ts` が全localeとsite content IDを検査する。大学には同じ粒度の独立packが必要である。
- `lib/server/tenant.ts` と `app/layout.tsx` はrequest Hostをtenantへ解決し、tenant別言語行を読む。FAQは `lib/faq-content.ts` が `knowledgeBaseDir` と `faqOrganizationName` から読み込む。
- Prismaにはtenant-scopedな `SitePhoneSetting`、`SiteChatSetting`、`LocaleDisplaySetting`、`SiteMaintenanceSetting` があり、strictなZoom Web Chat tag parserと管理画面/APIの既存パターンがある。一方、3種類のVideo Client設定と公開キュー状態のモデルはない。
- `dev-compose.sh` の成功表示は現在 `STARTUP_URL=http://localhost:${HOST_PORT}` で無色、`test/dev-compose-runtime.test.ts` もその文字列を前提にしている。
- 現在のverified baselineはcheckout `/Users/keien/work/zoom-gov-contact-center-demo`、commit `b03836c6f7eb7ee1e97575745e9c42970328c4c2`、Compose project `zoom-gov-contact-center-demo`、web container `24622b14643a`、`http://localhost:3000/` である。
- Zoomの公式Contact Center APIにはキューのエージェント一覧 `GET /v2/contact_center/queues/{queueId}/agents` とgranular scope `contact_center:read:list_queue_agents:admin` がある。ユーザー状態は `Ready`、`Occupied`、`Not Ready`、`Offline` として扱われ、`contact_center.user_status_changed` webhookも存在する。ただし公開Web Video Client向けにキュー状態を直接購読するsocket契約は確認できないため、本計画はserver-side REST集約とbrowser pollingを採用する。Smart Embedのagent status通知は認証済みagent向けであり、公開相談カードには流用しない。
- 添付画像は実装命令や転載素材ではなく、カテゴリを視覚、名称、受付状態、CTAで選ぶ構成参考としてのみ扱う。ロゴ、写真、配色、masonry、文言は複製しない。
- Codex内ブラウザで確認したLIXILオンラインショールームは、相談方法ごとの説明と導線に続けて相談フローとFAQを同一ページに配置している。この構成を情報量の参考にし、未来大学では利用手順、事前確認、大学相談FAQへ置き換える。
- `/consultation` のmain contentは `max-w-7xl` である。相談方法sectionとFAQ sectionは同じ親の全幅を使い、事前確認だけを一枚の無境界色面にせず、3項目それぞれへ一貫したborderを持たせる。
- provider固有名は設定schema、server-only連携、運用手順、監査logなど技術上の識別が必要な場所に限る。大学UIの本文、見出し、label、status、error、FAQ、accessible nameには内部製品名を渡さず、locale dictionaryの汎用表示文言を使う。

# 実装方針

## 1. テナント・Host・feature境界

- `lib/tenants.ts` の `TENANT_KEYS` に `univ` を追加し、`未来大学`、`MIRAI UNIVERSITY`、`demo.univ.keien.dev`、dev label `univ`、大学FAQディレクトリ、大学用featureを定義する。
- featureを「自治体情報」「大学情報」「予約相談」「即時相談」「管理機能」の単位に整理する。`lg` の既存値は変えず、`univ` では予約・ZAAD・Developer APIなど大学要件外の既存管理導線を隠し、電話、chat、language、maintenance、新規online consultationだけを許可する。
- `resolveTenantFromHost`、`listTenantProductionOrigins`、auth trusted origins、middlewareまたは各routeのtenant guardを更新する。開発は `lg.localhost` と `univ.localhost`、本番は両canonical hostを厳格一致させる。
- Vercelへの `demo.univ.keien.dev` domain attachとDNSはrepository外のdeployment手順として明記し、コードだけで完了扱いにしない。

## 2. 大学コンテンツモデルとルート

- `app/i18n/tenant-content.ts` を共通chrome、自治体content、大学contentの判別可能な型へ分割する。`buildDictionary` はtenantごとのbuilderへ委譲し、大学で自治体必須キーを生成しない。
- `app/tenants/univ/content.ts` に5localeのnavigation、page title、lead、支援項目、FAQ label、news label、consultation文言を置く。`app/tenants/univ/site-content.ts` にroute単位の構造化内容とstable IDを置く。
- `docs/knowledge-base/大学-未来大学/` に未来大学名を持つFAQ corpusを作り、既存parserのorganization assertionを通す。自治体corpusは変更しない。
- `app/admissions/page.tsx`、`app/academics/page.tsx`、`app/campus-life/page.tsx`、`app/scholarships/page.tsx`、`app/careers/page.tsx`、`app/faq/page.tsx`、`app/news/page.tsx`、`app/consultation/page.tsx` はrequest tenantを確認する。共通URLであってもtenantごとの許可route以外を `notFound()` または既存の明示的な安全fallbackへ送り、cross-tenant contentを返さない。
- home、Header、MobileMenu、Footer、language/theme controlsは共通chromeを維持し、tenant固有の情報architectureをpropsまたはtenant view componentで差し替える。

## 3. 大学UIとSVGカテゴリカード

- `DESIGN.md` と `app/styles/ui-foundation.css` のsemantic tokenを使い、lightはnavyとprimary-50から500のlight blue、darkは既存surfaceとprimary contrastを使う。新しいglobal color tokenは原則追加しない。
- heroは過大なmarketing表示にせず、支援情報を早く探せる見出し、`探す → 相談する → 担当につながる` のjourney strip、目的別grid、大学ニュースを配置する。カードは境界線主体、角丸は控えめ、影は原則使わない。
- `app/components/university/consultation/illustrations/AdmissionsConsultationIllustration.tsx`、`StudentSupportConsultationIllustration.tsx`、`CareerConsultationIllustration.tsx` を作る。すべて同じ `viewBox`、stroke幅、round cap/join、`fill="none"`、`currentColor` を使い、装飾用途として `aria-hidden="true"` にする。校舎と願書、本と支援、briefcaseと進路を線画で区別する。
- `InstantConsultationCard` はSVG領域、text付きstatus、カテゴリ名、説明、全幅CTAを縦に並べる。色だけで状態を伝えず、Readyは `ただいま受付中` と有効な `ビデオ相談を開始`、Occupiedは `担当者は現在対応中` と無効な `現在対応中`、unavailableは `現在受付できません`、unknownは `接続状況を確認中` を表示する。
- 390pxでは1列、768pxから2列、1280pxから3列にし、カード内CTA位置をそろえる。focus ring、44px以上の操作領域、見出し階層、reduced motion、light/dark contrastを守る。
- `/consultation` のdefault画面では、2つの選択cardを `display:flex; flex-direction:column` 相当とし、supporting listの後に `margin-top:auto` のCTA wrapperを置く。`今すぐ相談` の2行目は `相談内容に合わせて3つの窓口から選択` とし、文言差があっても `予約相談を始める` と `今すぐ相談へ進む` のtop・bottom座標差を1px以内にする。
- 選択cardの後へ「オンライン相談の流れ」3step、「相談前にご確認ください」3項目、「オンライン相談のよくある質問」3件、個人情報案内を置く。事前確認の見出しはgrid外に置き、gridへ左・上border、各項目へ右・下borderと同一paddingを与える。desktopではgapなしの3列、mobileではDOM順を保つ1列とし、影や入れ子の浮遊card表現は使わない。
- FAQはnative `details`/`summary` を使い、大学の相談フローに必要な文言だけを新規作成する。FAQ sectionは `w-full` とし、`max-w-5xl` など親より狭くする幅制約を付けない。見出し行とaccordionの左右端をmain contentへそろえる。
- 表示文言は内部provider設定から分離する。予約相談では `ZVA` や製品名を表示せず「自動受付」「チャットで受付」「電話で受付」、今すぐ相談では「オンライン相談」「担当窓口」、管理画面では `Video Client Web Tag` を「接続用Webタグ」と表記する。status、error、FAQ回答、`aria-label`、`legend`、視覚非表示文言も同じ辞書を通し、英字略称やprovider名へfallbackしない。
- `app/layout.tsx` と公開shellでrootを `min-h-screen flex flex-col`、mainを `flex-1` にし、footerを末尾へ置く。short stateでは `footer.getBoundingClientRect().bottom >= window.innerHeight`、long stateではdocument scrollを許し、固定footerや人工的な余白は使わない。

## 4. Zoom Video Client設定

- Prismaにtenant keyを主キーまたはunique parentに持つ `SiteOnlineConsultationSetting` を追加する。3カテゴリそれぞれにVideo Client Web Tag、queue ID、管理メモ、有効フラグを持たせる。Web Tagは暗号化が既存規約にある場合は同じ保護を使い、公開APIはparser済みの起動情報以外を返さない。
- `lib/zoom-video-client-tag.ts` に公式Zoom Contact Center Video Client Web Tagだけを許可するstrict parserを実装する。許可script origin、要素・属性、識別子長、重複、余分なmarkupを検証し、正規化された安全な設定だけをrendererへ渡す。
- `/admin/online-consultation-settings` と対応route handler/server actionを追加し、管理者権限とrequest tenantを二重に検査する。3タブの保存はtransactionalに行い、validation errorはfieldに関連付け、保存後もtag値を画面やlogへ再表示しない。
- migration既定値では3カテゴリをdisabled、tagとqueue IDを空にする。未設定カテゴリのpublic CTAは表示しない。

## 5. エージェント状態の定期更新

- 未来大学専用Zoom Server-to-Server OAuth appを前提に、`UNIV_ZOOM_ACCOUNT_ID`、`UNIV_ZOOM_CLIENT_ID`、`UNIV_ZOOM_CLIENT_SECRET` をserver-only環境変数として読む。自治体用OAuth table・環境値は参照しない。必要scopeはqueue agent一覧とuser profile/status読取に限定し、実環境で最小granular scopeを確定する。
- `lib/server/zoom-contact-center-availability.ts` を追加し、設定済み3 queueについてqueue membershipと現在のContact Center user statusを取得・交差する。category statusは `ready`、`busy`、`unavailable`、`unknown` の4値へ集約する。Readyが1人以上ならready、ReadyなしでOccupiedが1人以上ならbusy、対象agentがいるが全員OfflineまたはNot Readyならunavailable、認証・schema・timeout・rate limit・設定不整合はunknownとする。
- 同じinstance内ではtenantとqueue集合をkeyに10秒TTLのsingle-flight cacheを使う。Zoomへのtimeoutを設定し、429は `Retry-After` を尊重する。cacheには集約値と観測時刻だけを保持し、user ID、氏名、email、token、raw responseを永続化しない。
- `GET /api/public/consultation-availability` を追加する。Hostから `univ` を解決し、営業時間と設定状態を先に評価する。responseは `{ observedAt, staleAfter, services: { admissions, studentSupport, careers } }` の公開schemaに限定し、各serviceは `{ status }` だけを返す。`Cache-Control: private, no-store`、same-origin、inputなしとし、Zoom error detailsは返さない。
- `ConsultationAvailabilityClient` はmount直後と各完了後15秒でAPIを呼ぶ。`setInterval` で重複させず、`AbortController` でunmountと次回開始を管理し、`document.visibilityState` がhiddenなら停止、visible復帰で即時取得する。連続失敗は15秒、30秒、60秒へbackoffする。最後の成功から45秒を超えたら全カテゴリをunknownへ落とす。
- responseはruntime schemaで検証し、各カードを独立更新する。状態領域はpoliteな `aria-live` にするが、15秒ごとに変化がない場合は再announceしない。Readyからbusyへ変わった時は該当CTAだけをdisabledにし、他カテゴリは維持する。
- 公開consumer向けの公式queue-status socket契約は前提にしない。将来Zoomが公式event subscriptionを提供し、server側で認証・再接続・集約を安全に実装できる場合だけ、公開APIのresponse schemaを保ったままSSE/WebSocketへ差し替える。Smart Embedの `zcc-agent-status-notification` はagent自身の状態用なので採用しない。

## 6. 予約相談とZoom運用

- `/consultation` はhubから `予約して相談` と `今すぐ相談` を分ける。予約相談は既存tenant chat settingとlocale別AI電話番号を使い、5言語で相談種別、希望日時、8文字英数字学籍番号を確認する。UIやDBには入力formを追加しない。
- 担当者はZoom Contact Center標準のscheduled callbackで予約を完結する。アプリ側予約table、SMS、確認メール、Zoom Meeting API、外部providerは追加しない。
- `今すぐ相談` はJST平日09:00–17:00だけ表示する。時間外は営業時間だけを表示し、予約への代替linkや相談開始buttonを置かない。祝日判定は本計画の対象外で、Zoom側operating hoursを最終運用基準として実証する。
- 音声のみbuttonは同一Video Clientでcamera disabled参加できることを実Zoom環境で実証した場合だけ追加する。現prototypeと初回実装には含めない。
- Zoom管理ポータルでZVA 5言語、3 Video Flow、3 queueとagent assignment、scheduled callback、会話・録音等の30日後完全削除を設定する。利用できない言語・channelは公開設定をdisabledにする。

## 7. migrationと起動ログ

- 新migrationは `univ` の5 locale rows、phone row、chat row、maintenance row、online consultation rowを `INSERT ... ON CONFLICT DO NOTHING` 相当で安全に追加する。空phone、disabled chat、disabled consultationを使い、既存 `lg` rowをupdateしない。
- `scripts/deploy/lib/reviewed-migrations.ts` と関連hash fixtureをrepository規約に従い更新する。fresh schema、既存tenant-scope migration適用済みDB、migration再実行で同じ結果になることを確認する。
- `dev-compose.sh` にTTY・`CI`・`NO_COLOR` 判定とkey/value printerを設ける。keyはneutralまたはbold、`SUCCESS` はgreen、URLはcyan、Studio commandはyellow。値そのものとmachine-readable改行は変えず、failure表示も既存契約を維持する。
- 成功表示は順に `STARTUP_RESULT=SUCCESS`、`STARTUP_URL=http://lg.localhost:${HOST_PORT}`、`TENANT_URL_UNIV=http://univ.localhost:${HOST_PORT}`、`STUDIO_START_COMMAND=./dev-compose.sh up -d studio`、`STUDIO_URL=http://localhost:${STUDIO_PORT}` とする。

## 8. 実装順序

1. 実装開始前に、このgoal、`ui-contract.json`、`parity-spec.json`、prototype revisionが一致することを静的preflightで確認する。
2. 実装環境の `node_modules/next/dist/docs/` からroute handler、server/client component、cache、headers/cookies、metadataの該当guideを読み、現在のNext.js仕様を確定する。
3. tenant registry、content type、5言語pack、route guardと大学FAQを実装する。
4. Prisma model、idempotent migration、server-only Zoom client、strict tag parser、admin API/UIを実装する。
5. public availability API、poll lifecycle、status集約、相談hub・予約・即時相談、SVG componentを実装する。
6. 起動ログを更新し、focused test、contract test、lint、typecheck、必要なfull test/build、diff checkを行う。通常の `$implement` ではBrowserやprototype serverを起動しない。
7. 実Zoom環境の設定・言語・queue・retentionは独立した手動実証で確認し、通らない機能を公開しない。

## UI契約

- UI変更: あり。未来大学の公開portal、8 route、相談hub、予約相談、キュー状態付き即時相談、管理画面を追加する
- prototype: `plans/univ-tenant-portal/prototype/`
- approval contract: plans/univ-tenant-portal/prototype/ui-contract.json — version 1
- validation profile: plans/univ-tenant-portal/prototype/parity-spec.json — version 3
- prototype revision: `sha256:b4856a5ce8de52ccf6ba3ebcd3638b25dd8ca8d1845b3e979fb36c8545c2819f`
- UI承認方式: 明示的な `$implement` 呼び出しを、このrevisionとgoalへの承認として扱う
- production baseline: `http://localhost:3000/`、checkout `/Users/keien/work/zoom-gov-contact-center-demo`、commit `b03836c6f7eb7ee1e97575745e9c42970328c4c2`、verified Compose owner
- comparison conditions: ja fixture、DPR 1、scroll 0,0、390x844・767x900・768x900・1279x900・1280x900・1440x900、light/dark、publicとsynthetic tenant admin authorization
- baseline state inventory: default、mobile-nav-open、faq-open、reserve、chat-triggered、now-open、now-mixed、now-stale、now-closed、now-unconfigured、admin-default、admin-error、admin-saved
- theme contract: lightとdarkを既存semantic tokenだけで表現する
- responsive contract: mobile、md直前・直後、xl直前・直後、desktopの6境界を固定する
- styling pipeline: `tailwind.css` は `app/styles/ui-foundation.css` をimportし、生成済み `styles.css` を承認artifactとしてそのまま使う
- 視覚的不変条件: `inv-theme`、`inv-no-overflow`、`inv-controls`
- 意図した差分: `delta-university-home`、`delta-university-information`、`delta-university-faq`、`delta-university-news`、`delta-university-consultation`、`delta-admin-consultation`
- stateとinteraction: mobile dialog、FAQ disclosure、chat launch、ReadyとOccupied混在、stale、closed、unconfigured、admin error、admin saved、provider-neutral copy、keyboard、focus
- comparison targets: 6 targets。`university-home`、`university-information`、`university-faq`、`university-news`、`university-consultation`、`admin-consultation`
- parity matrix: 936 rows。6 targets × 13 states × 6 viewports × 2 themesの完全Cartesian matrix
- coverage matrix: version 3のdeterministic pairwise rotationにrisk rowsと各targetのdesktop anchorを加える
- risk rows: consultation hubのCTA整列・事前確認セル境界・FAQ全幅・full-height shell、mobile drawer、5言語長文、FAQ、SVG card、mixed status、stale、closed、unconfigured、admin validation、admin savedを明示する
- anchor rows: 6 targetsそれぞれのdefault・desktop・lightを固定する
- full parity条件: release、CI、scheduled、または明示要求時だけ936 rowsを実行し、通常のimplement完了条件にはしない
- human UI review: 下記 `UI-CHECK-XX` をprototype保持URLで確認する

# インターフェースとデータフロー

## Tenantとcontent

- `TenantKey` は `"lg" | "univ"` となり、`getTenant`、`resolveTenantFromHost`、`findTenantByProductionHostname` の公開契約を維持する。
- 大学contentは5localeすべてで同じstable content ID集合を持つ。共通chromeの言語・theme・auth文言は共有し、自治体life/disaster modelは共有しない。
- route componentは `getRequestTenant()` 相当からtenantを受け取り、URL queryやclient inputでtenantを切り替えない。

## Online consultation settings

- `ConsultationServiceKey = "admissions" | "studentSupport" | "careers"` を共有domain typeとする。
- 保存inputは各serviceの `{ enabled, videoClientTag, queueId, memo }`。tagとqueue IDはtrim後にstrict parseし、全serviceをtransactionで保存する。公開側はenabledかつ両値validなserviceだけを返す。
- 管理GETはsecret-safeなconfigured状態とmemoを返し、生Web Tagは既存security規約で許される編集時だけ限定表示する。ログ、error、analyticsにはtagを含めない。

## Availability API

- `GET /api/public/consultation-availability` は認証不要だがsame-originかつHost-derived tenant限定である。入力parameterでsiteKeyやqueue IDを受け取らない。
- 成功responseは `observedAt` ISO timestamp、`staleAfter` ISO timestamp、`services` mapを返す。service valueは `status: "ready" | "busy" | "unavailable" | "unknown"` だけとする。
- 未設定または時間外はZoomへ問い合わせず、UI server renderのgateでcard actionsを描画しない。営業時間内のpartial upstream failureは影響serviceだけunknownにし、他serviceは更新する。
- serverはS2S OAuth tokenをmemory cacheし、有効期限より余裕を持って更新する。token fetchとZoom API fetchはtimeout・schema parse・redacted errorに包む。
- client data flowは `mountまたはvisibility復帰 → same-origin GET → schema validation → observedAt/staleAfter確認 → serviceごとにstate更新 → 15秒後に次回`。失敗は `unknown → 15/30/60秒backoff` とする。

## Zoom consultation launch

- Ready cardのCTAだけが保存済みVideo Client設定を通じて公式clientを起動する。busy、unavailable、unknownはdisabledであり、DOMに代替launch URLやraw tagを置かない。
- ZVA chatとvoiceは設定済みかつlocale対応済みの場合だけ表示する。学籍番号等はZoomへ直接入力し、アプリroute、DB、log、analyticsを通さない。

## Startup output

- color helperは `stdout` のTTYを見て、`CI` と `NO_COLOR` が未定義の場合だけANSIを付ける。比較・test用のplain textはescape除去後ではなく、color無効条件で直接同じ文字列を出す。
- keyと `=` はneutral、success valueはgreen、URL valueはcyan、command valueはyellowに分ける。

# テスト計画

## 自動テスト

- Tenant registry: `lg` と `univ` のdev・production Host、port付きHost、大文字・末尾dot正規化、canonical fallback、trusted origin、unknown Hostを検証する。
- Content: 5localeの大学dictionaryとsite content IDが完全一致し、空文字、自治体専用key、cross-tenant routeがないことを検査する。
- Routing/UI: 8大学route、metadata、navigation、footer、FAQ/news、mobile menu、light/dark、keyboard/focus、390・767・768・1279・1280・1440のoverflowをcomponent/DOM testで検証する。
- Consultation hub: `test/university-consultation.test.tsx` で相談方法、3step、事前確認3項目、FAQ 3件、`相談内容に合わせて3つの窓口から選択` を検証し、LIXILのURL・ロゴ・画像・転載文言が0件であることを検査する。`separates pre-consultation guidance items` は3項目が共通grid直下の独立cellであり各cellに境界classがあること、`renders consultation FAQ at full content width` はFAQに `w-full` があり親より狭いmax-width指定がないことを検証する。
- Provider-neutral copy: `test/university-provider-neutral-copy.test.tsx` の `renders provider-neutral copy across every university consultation state` でhome、相談default、reserve、chat-triggered、now-open、now-mixed、now-stale、now-closed、now-unconfigured、admin-default、admin-error、admin-savedを5言語でrenderする。本文、form label、status/error、accessible nameを連結してcase-insensitiveに検査し、`ZVA`、`Zoom Virtual Agent`、`Zoom Contact Center`、単独語の `Zoom`、`Video Client`、`Video Flow`、`Web Chat` が0件であることと、各状態に対応する汎用語が存在することをassertする。
- CTA/shell: `test/university-consultation.test.tsx` で両cardのflex/auto-margin構造、`test/university-shell.test.tsx` でroot/main/footerのfull-height構造を検証する。UI-CHECK-11でdesktop CTA座標差1px以内、UI-CHECK-12で1440x1200のfooter下余白0pxを実測する。
- SVG: 3 componentのviewBox・stroke contract、`currentColor`、decorative accessibility、外部URL・raster importなし、card titleとの対応を検証する。
- Tag/settings: valid/invalid official Video Client Web Tag、queue ID、transactional save、tenant authz、unconfigured hide、tag redactionを検証する。
- Availability aggregation: Ready優先、Occupiedだけならbusy、Offline/Not Readyだけならunavailable、empty/invalid/timeout/401/429ならunknown、service partial failureをtable testにする。
- Polling: fake timerとmock fetchでmount即時、15秒逐次、request overlapなし、hidden停止、visible即時、unmount abort、15/30/60 backoff、45秒stale、変化時だけaria-live更新を検証する。
- Hours: Asia/Tokyoの月曜08:59、09:00、金曜16:59、17:00、土日をfake clockで検査する。未設定・時間外ではZoom fetchを呼ばない。
- API security: Host-derived tenant、response schema、no-store、method rejection、raw Zoom response・ID・email・token・queue ID非公開、redacted logを検証する。
- Migration: clean DB、既存DB、再実行、`lg` row hash、`univ` disabled defaults、秘密値なし、reviewed migration chainを検証する。
- Startup log: pseudo-TTYでSUCCESS green、URL cyan、Studio command yellow、key neutralを確認し、`CI`、`NO_COLOR`、pipe、redirectでESC byteが0件、両tenant URLがplain textとして完全一致することを確認する。
- Regression: focused test後にcontract test、lint、typecheck、migration checkを実行し、影響が横断的な場合だけfull test/buildを実行する。

## Zoom実環境検証

- 専用S2S OAuth appが最小scopeで3 queueのmembershipとstatusを読めること、429・token refreshを確認する。
- 3 queueでReadyとOccupiedを切り替え、15秒以内に対応カードだけが更新されることを確認する。氏名やメールがnetwork responseに含まれないことも確認する。
- 5言語の各ZVAが相談種別、希望日時、8文字英数字学籍番号を適切な有人queueへ渡し、標準scheduled callbackを作れることを確認する。
- 3 Video Flow、平日09:00–17:00 JST、30日後完全削除、未対応言語非公開をZoom管理ポータルで確認する。

## ユーザー動作確認

- [ ] UI-CHECK-01 対象: `university-home` desktop light / 前提: prototype保持URLを1440x900で開く / 操作: homeから支援メニューとニュースを確認する / 期待: navy・light blueの大学ブランド、情報中心hero、journey、8導線が読みやすく並ぶ
- [ ] UI-CHECK-02 対象: `university-home` mobile-nav-open / 前提: 390x844 / 操作: menuを開き、Tab移動後Escapeで閉じる / 期待: dialog label、focus、scroll lock、復帰focusが成立し横overflowがない
- [ ] UI-CHECK-03 対象: `university-consultation` now-open / 前提: `consultation.html?state=now-open` / 操作: 1440x900と390x844で3カードを確認する / 期待: 写真なしの3種類の大判SVG、カテゴリ名、受付中、全幅Video CTAが一貫したcardとして表示される
- [ ] UI-CHECK-04 対象: `university-consultation` now-mixed / 前提: `consultation.html?state=now-mixed` / 操作: 3カードの状態とbuttonを比較する / 期待: 学生生活・奨学金だけが `担当者は現在対応中` とdisabledになり、他2カテゴリは受付中のまま
- [ ] UI-CHECK-05 対象: `university-consultation` now-stale / 前提: `consultation.html?state=now-stale` / 操作: 状態文言と操作可否を確認する / 期待: 全カードが `接続状況を確認中` となり、古いReady表示や有効buttonが残らない
- [ ] UI-CHECK-06 対象: `university-consultation` now-closed / 前提: 時間外state / 操作: ページ全体を確認する / 期待: 平日09:00–17:00と時間外説明だけが表示され、相談開始・代替相談linkがない
- [ ] UI-CHECK-07 対象: `university-consultation` now-unconfigured / 前提: tag未設定state / 操作: ページ全体を確認する / 期待: 利用不可説明だけがあり、raw tag、外部URL、開始buttonがない
- [ ] UI-CHECK-08 対象: reservation / 前提: reserveとchat-triggered state / 操作: chat開始と音声cardを確認する / 期待: 3取得項目と5言語を明示し、姓・email・架空の実電話番号を表示しない
- [ ] UI-CHECK-09 対象: `admin-consultation` / 前提: admin-errorとadmin-saved / 操作: invalid fieldと保存statusをlight/darkで確認する / 期待: error関連付け、tenant名付きsuccess、tag非再表示、狭幅overflowなし
- [ ] UI-CHECK-10 対象: information、FAQ、news / 前提: 5localeの実装fixture / 操作: locale切替、FAQ開閉、長い見出しを確認する / 期待: 全言語で欠落・自治体文言・clipがない
- [ ] UI-CHECK-11 — 対象: `university-consultation` default; 前提: `consultation.html?state=default&theme=light` を1440x900で表示; 操作: `予約相談を始める` と `今すぐ相談へ進む` の位置、追加された利用手順・事前確認・FAQを確認; 期待結果: 両CTAのtop・bottom座標差が1px以内で、`相談内容に合わせて3つの窓口から選択` と大学固有の3セクションが表示される
- [ ] UI-CHECK-12 — 対象: `university-consultation` defaultとshort state; 前提: 1440x1200と390x844で表示; 操作: ページ末尾までscrollしてfooter下端とviewport下端を確認; 期待結果: footer下の空白が0pxで、root/main/footerが画面全高を満たし、長いdefault内容は通常scrollできる
- [ ] UI-CHECK-13 — 対象: `university-consultation` default; 前提: `consultation.html?state=default&theme=light` を1440x900と390x844で表示; 操作: 「相談前にご確認ください」の3項目を確認; 期待結果: 各項目が罫線で明確に区切られ、desktopではgapなしの3列、mobileでは順序を保った1列になり、境界欠けと横overflowがない
- [ ] UI-CHECK-14 — 対象: `university-consultation` default; 前提: `consultation.html?state=default&theme=light` を1440x900と390x844で表示; 操作: 「オンライン相談のよくある質問」と相談方法sectionの左右端を比較; 期待結果: FAQ見出し行とaccordionがmain contentの全幅を使い、相談方法sectionとのleft・right座標差が各1px以内になる
- [ ] UI-CHECK-15 — 対象: `university-home`、`university-consultation`、`admin-consultation`; 前提: prototypeのhome、default、reserve、chat-triggered、now-open、now-mixed、now-stale、now-closed、now-unconfigured、admin-default、admin-error、admin-savedを表示; 操作: 画面本文、状態文、エラー、入力labelを読み上げ表示も含めて確認; 期待結果: `ZVA`、`Zoom Virtual Agent`、`Zoom Contact Center`、`Zoom`、`Video Client`、`Video Flow`、`Web Chat` が一度も表示されず、「自動受付」「オンライン相談」「担当窓口」「接続用Webタグ」で各操作を理解できる

# 前提・対象外・リスク

## 前提

- Zoom Contact Center契約でVideo Client、ZVA、scheduled callback、対象5言語、API scopesが利用でき、未来大学用の3 queue・3 Video Flow・agent assignmentを管理者が準備できる。
- `demo.univ.keien.dev` のDNSとVercel domain attach、S2S OAuth環境変数、Zoom retention設定はdeployment/Zoom管理者が行う。
- 公開availabilityは「その瞬間に接続を保証する」ものではなく、最大15秒程度遅延する案内である。CTA押下後の最終routingはZoom Contact Centerが決定する。
- 祝日カレンダーは持たず、アプリ上はJST平日だけを判定する。Zoom側operating hoursとの二重gateを実環境で合わせる。

## 対象外

- 外部メール、SMS、外部予約サービス、独自予約API/DB、Zoom Meeting自動作成、自治体OAuth設定の共有、相談者氏名・メール収集。
- 公開ブラウザからZoom APIへの直接通信、agent個人情報の保存・表示、raw queue statusの公開、独自WebSocket server。
- 添付参考画像の写真・ロゴ・模様・配色・card寸法の複製、カテゴリごとのraster画像制作、外部font/CDN。
- Zoomで未実証の音声のみVideo Client参加、未対応ZVA言語、祝日管理。
- `$implement` 中のBrowser、CDP、Playwright、production/prototype server、implementation parity artifact。これらはrelease、CI、定期、または独立した明示要求に限定する。

## リスク

- `List queue agents` だけで現在statusが十分に得られないZoom account/API versionでは、user profile/statusの追加取得が必要になりrate limitが増える。実装前の実account probeでresponse schemaと最小scopeを固定し、取得不能ならavailability表示を公開せずunknownへfail closedする。
- Vercel serverless instanceごとのmemory cacheは共有されないため、traffic増加時にZoom API requestが増える。デモ規模を超える場合は、個人情報を含まないaggregateだけを保存する共有cacheを別承認で導入する。
- 15秒pollでもReady表示直後にagentがOccupiedになる競合は残る。表示に「状況は更新時点」と示し、最終受付はZoom routingに委ねる。
- Zoom webhook `contact_center.user_status_changed` はevent driven化の候補だが、user単位eventから3 queueへの安全な対応付けとserverless再接続・状態復元が必要になるため初回対象外とする。
- 大学の5言語copy量が多く、翻訳品質と行長差がlayoutに影響する。stable ID test、native speaker review、390px risk rowで閉じる。
- tenant featureを誤ると大学Hostに自治体予約・ZAAD・Developer APIが露出する。navigationとserver authorizationの両方でfeature guardを行う。
- Web Tagは実行可能markupを含むため、文字列保存だけでは不十分である。公式shape・origin allowlist・attribute allowlistを厳格に検証し、未認識variantは拒否する。
- 30日完全削除、ZVA言語、agent queue assignmentはrepository testでは保証できない。Zoom実環境チェックが完了するまで該当公開設定をdisabledに保つ。
