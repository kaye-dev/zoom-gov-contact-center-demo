# 管理画面の電話・チャット分離と Zoom Web Chat 方式選択 実装計画

- 作成日: 2026-08-05
- 調査対象コミット: `35246cfecb73`
- 状態: 実装・検証完了

## 1. 目的

現在の `/admin/phone-numbers` は、代表電話、言語別 AI 電話、Zoom の埋め込みタグ、言語別 Campaign URL を一つのフォームと API で管理している。これを電話とチャットの二つの責務へ分離し、チャットでは次の二方式を事前登録したうえで、公開サイトへ読み込む一方式を管理者が選べるようにする。

1. Campaign の `Embed Web Tag`
2. Zoom Contact Center の Flow Entry ID 用 `Import SDK` タグ

ZVA の多言語対応は Zoom 側の単一チャットへ任せる。アプリ側では言語別 Full-page / Offsite Campaign URL を管理しない。

## 2. 確定した設計判断

- 管理画面を `/admin/phone-settings` と `/admin/chat-settings` に分ける。
- 旧 `/admin/phone-numbers` と `PUT /api/admin/contact-settings` は削除し、redirect や互換 API は設けない。
- チャット画面には Campaign 用と Contact Center Entry ID 用のタグ textarea と、各方式専用のメモ textarea を常時表示する。
- 二つのタグは同時に保存できるが、公開ページへは選択中の一つだけを読み込む。
- 利用方式は `DISABLED` / `CAMPAIGN` / `CONTACT_CENTER_ENTRY_ID` の三択にする。
- 非選択側のタグとメモも保持し、方式を切り替えるたびに貼り直さなくてよいようにする。
- 言語別 `virtualAgentCampaignUrl` は UI、型、API、DB、公開側から削除する。
- 公開側の既存「AIチャット相談」外部リンクカードも削除し、Zoom 標準ランチャーを唯一のチャット開始導線にする。
- 電話側の言語別 AI 電話番号は従来どおり維持する。

標準ランチャーへ一本化する理由は、Campaign と Entry ID で独自ボタンの公式な接続方法が異なるためである。Campaign は `zoomCampaignSdk.open()` または Zoom 管理画面の Invitation 設定、Entry ID は `data-el` が公式手段であり、両方式を一つの独自ボタンへ結び付ける共通 API は公式保証されていない。デモでの動作安定性と設定の分かりやすさを優先し、モード別 adapter と外部の Zoom 設定依存を持ち込まない。

## 3. Zoom 公式仕様の調査結果

### 3.1 Campaign と Entry ID

- Zoom は Campaign と Entry ID を代替の埋め込み方式として説明している。
- Campaign タグは `data-apikey` を持ち、`data-chat-entry-id` を持たない。
- Entry ID タグは `data-apikey` と `data-chat-entry-id` の両方を持つ。
- Contact Center の Entry ID タグは、`Contact Center Management > Flows > 対象 Flow > Start > Manage Entry Point > Import SDK` から取得する。
- Campaign タグは、`Contact Center Management > Campaigns > Embed Web Tag` または Virtual Agent の Campaign 画面から取得する。
- 同一ページへ Campaign と Entry ID の二つの SDK タグを同時に置くことをサポートする公式記載はない。単一の `window.zoomCampaignSdk` を使うため、同時読み込みは避ける。

根拠:

- [Contact Center Web Chat SDK](https://developers.zoom.us/docs/contact-center/web/chat/)
- [Virtual Agent Web Chat SDK](https://developers.zoom.us/docs/virtual-agent/web/chat/)
- [Adding entry points to a flow](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059448)
- [Managing Zoom Contact Center campaigns](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059094)

### 3.2 script タグの受け入れ条件

- `type="module"` は Zoom ポータルの発行例に含まれるが、公式コード例では省略されているため任意とする。指定時は `module` のみ許可する。
- `data-env` は任意とし、省略時は URL から環境を判定する。公式掲載環境は `us01` と `eu01` で、指定時は CDN の host/path と一致させる。
- `chat-client.js` と `zcc-sdk.js` は公式資料内で用途が混在しているため、ファイル名だけで方式を判定しない。方式は `data-chat-entry-id` の有無で判定する。
- `src` は Zoom の HTTPS CDN、対応環境の path、クエリ・フラグメントなしに限定する。
- 属性順は不問にする。
- inline script、重複属性、未知属性、複数 script タグは拒否する。
- API key と Entry ID は Zoom が発行する opaque 値として扱い、空文字、制御文字、過大長を拒否する一方、公式にない厳しすぎる固定長は仮定しない。

### 3.3 公開側の起動方法

- Entry ID のタグを読み込むと標準アイコンが表示され、追加コードなしでチャットを開始できる。
- Campaign は Zoom 管理画面で Invitation、表示条件、対象 URL を管理する。
- Campaign のプログラム起動は `zoomCampaignSdk:ready` 後の `open()`、Entry ID の独自ボタンは `data-el` が公式手段であり、実装契約が異なる。

根拠:

- [Contact Center Campaign SDK](https://developers.zoom.us/docs/contact-center/web/campaigns/)
- [Contact Center SDK reference](https://developers.zoom.us/docs/contact-center/web/sdk-reference/)
- [Virtual Agent Campaign SDK](https://developers.zoom.us/docs/virtual-agent/web/campaigns/)

## 4. 現状と修正対象

### 4.1 現在の責務混在

- `app/admin/phone-numbers/PhoneNumbersForm.tsx` が電話とチャットの全項目を一括管理している。
- `ContactSettings` は代表電話、Web Tag、言語別 AI 電話、言語別 Campaign URL を一つの payload にまとめている。
- `PUT /api/admin/contact-settings` は全項目を一括更新するため、電話とチャットを別タブで編集すると古い画面状態で他方を上書きし得る。
- `site_contact_settings` と `localized_ai_contact_settings` も電話とチャットの列が混在している。
- `FindInfo` の AI チャットカードは言語別 `virtualAgentCampaignUrl` を外部リンクとして開く。

### 4.2 今回のエラー原因

現行 validator の許可属性は `type` / `src` / `data-apikey` / `data-env` の四つだけであり、Zoom が正規に発行した Entry ID タグの `data-chat-entry-id` を未知属性として拒否する。API は `INVALID_VIRTUAL_AGENT_WEB_TAG` の HTTP 400 を返し、DB 保存処理には到達しない。

単に `data-chat-entry-id` を削除すると Flow の選択情報が失われるため、回避策にはしない。

## 5. 目標 UI

### 5.1 設定メニュー

`AdminShell` の「設定」を次の順序にする。

1. 電話管理 → `/admin/phone-settings`
2. AI チャット管理 → `/admin/chat-settings`
3. 言語管理 → `/admin/languages`

### 5.2 電話管理ページ

`PhoneSettingsForm` は次だけを管理する。

- 代表電話の表示値
- 代表電話の E.164 値
- `ja / en / zh-Hans / zh-Hant / ko` の AI 電話 E.164 値
- 電話設定専用の保存状態とエラー表示

言語の有効・非表示バッジは現在と同様に言語管理設定へ追従する。

### 5.3 AI チャット管理ページ

ページ上部に「公開サイトで利用する方式」の radio card を置く。

- 利用しない
- Campaign
- Contact Center Entry ID

その下に二つの fieldset を常時表示する。

#### Campaign

- ラベル: `Campaign Web Tag（Embed Web Tag）`
- Zoom 管理画面での取得経路を説明する。
- `data-chat-entry-id` を含むタグは、この欄では明確なエラーにする。
- タグ欄の直下に `Campaign メモ（任意）` の `rows={4}` textarea を置く。

#### Contact Center Entry ID

- ラベル: `Contact Center Web Tag（Import SDK）`
- Flow の `Start > Manage Entry Point > Import SDK` からコピーすることを説明する。
- `data-chat-entry-id` がないタグは、この欄では明確なエラーにする。
- タグ欄の直下に `Contact Center メモ（任意）` の `rows={4}` textarea を置く。

両 fieldset に「使用中」「未使用」の状態を表示する。未使用側もタグとメモを編集可能とし、保存時に消去しない。メモは差し替え前のタグ、差し替え理由、戻す予定などをプレーンテキストで記録する。

保存ルール:

- `DISABLED`: 両フィールドは空でもよく、既存値を保持したまま無効化できる。
- `CAMPAIGN`: `campaignWebTag` が必須。
- `CONTACT_CENTER_ENTRY_ID`: `contactCenterEntryIdWebTag` が必須。
- 非選択側も非空なら方式に合った有効なタグでなければ保存しない。
- メモは方式やタグの有無から独立して保持し、空白のみは `null`、最大 4,000 文字とする。

## 6. ドメイン型と validator

### 6.1 電話

```ts
type PhoneSettings = {
  representativePhone: {
    display: string;
    e164: string;
  };
  aiPhoneNumbers: Record<SiteLocale, string | null>;
};
```

`lib/phone-settings.ts` に E.164、代表電話表示値、全 locale の完全性を検証する処理を置く。

### 6.2 チャット

```ts
type ZoomChatMode =
  | "DISABLED"
  | "CAMPAIGN"
  | "CONTACT_CENTER_ENTRY_ID";

type ChatSettings = {
  activeMode: ZoomChatMode;
  campaignWebTag: string | null;
  campaignMemo: string | null;
  contactCenterEntryIdWebTag: string | null;
  contactCenterEntryIdMemo: string | null;
};

type ZoomWebChatTagConfig =
  | {
      mode: "CAMPAIGN";
      scriptSrc: string;
      apiKey: string;
      environment: string;
      scriptType: "module" | null;
    }
  | {
      mode: "CONTACT_CENTER_ENTRY_ID";
      scriptSrc: string;
      apiKey: string;
      environment: string;
      scriptType: "module" | null;
      chatEntryId: string;
    };
```

`lib/zoom-web-chat-tag.ts` に共通の厳格な script parser と二つの方式別 entry point を置く。

- `parseCampaignWebTag()`
- `parseContactCenterEntryIdWebTag()`
- `formatZoomWebChatTag()`

`lib/chat-settings.ts` は両タグを canonical 化し、`activeMode` と選択タグの整合性を検証する。公開側は `resolveActiveZoomChatTag()` で一つの config または `null` だけを受け取る。

エラーコードも方式別に分ける。

- `INVALID_ZOOM_CAMPAIGN_WEB_TAG`
- `INVALID_ZOOM_CONTACT_CENTER_WEB_TAG`
- `ACTIVE_ZOOM_CHAT_TAG_REQUIRED`

## 7. DB 最終形

```prisma
enum ZoomChatMode {
  DISABLED
  CAMPAIGN
  CONTACT_CENTER_ENTRY_ID
}

model SitePhoneSetting {
  id                         Int      @id @default(1)
  representativePhoneDisplay String
  representativePhoneE164    String
  updatedAt                  DateTime @default(now()) @updatedAt

  @@map("site_phone_settings")
}

model LocalizedAiPhoneSetting {
  locale      SiteLocale @id
  aiPhoneE164 String?
  updatedAt   DateTime   @default(now()) @updatedAt

  @@map("localized_ai_phone_settings")
}

model SiteChatSetting {
  id                         Int          @id @default(1)
  activeMode                 ZoomChatMode @default(DISABLED)
  campaignWebTag             String?
  campaignMemo               String?
  contactCenterEntryIdWebTag String?
  contactCenterEntryIdMemo   String?
  updatedAt                  DateTime     @default(now()) @updatedAt

  @@map("site_chat_settings")
}
```

SQL migration には Prisma schema で表現できない次の CHECK 制約も入れる。

- 各 singleton の `id = 1`
- `CAMPAIGN` 選択時は `campaignWebTag IS NOT NULL`
- `CONTACT_CENTER_ENTRY_ID` 選択時は `contactCenterEntryIdWebTag IS NOT NULL`
- `DISABLED` でも二つの保存済みタグは保持可能

一回限りのデータ移行:

- `representativePhone*` → `site_phone_settings`
- `aiPhoneE164` → `localized_ai_phone_settings`
- 既存 `zoomVirtualAgentWebTag` → `site_chat_settings.campaignWebTag`
- 既存 Web Tag があれば `CAMPAIGN`、なければ `DISABLED`
- `contactCenterEntryIdWebTag` は `NULL` で開始
- `campaignMemo` と `contactCenterEntryIdMemo` は `NULL` で開始
- `virtualAgentCampaignUrl` は移行せず削除

旧 URL/API の互換層は作らない。ただし稼働環境へ適用する場合、migration が新アプリ起動前に実行される構成では、新テーブル作成・コピーと旧テーブル削除を二回の deploy に分ける。ローカルの停止可能なデモ DB では一回の migration で完結してよい。

## 8. server/API の分離

### 8.1 server 関数

- `lib/server/phone-settings.ts`
  - `getPhoneSettings()`
  - `savePhoneSettings()`
- `lib/server/chat-settings.ts`
  - `getChatSettings()`
  - `saveChatSettings()`

`lib/site-settings.ts` と `lib/server/site-settings.ts` には locale / 言語管理だけを残す。

### 8.2 API

- `PUT /api/admin/phone-settings`
- `PUT /api/admin/chat-settings`

両 API は現在と同じ admin session 検証を行う。更新対象を別テーブルへ分け、電話保存がチャットを、チャット保存が電話を上書きしない構造にする。成功時は必要な公開ページを revalidate する。

旧 `PUT /api/admin/contact-settings` は削除する。

## 9. 公開側

### 9.1 電話

- `Footer` は `getPhoneSettings()` から代表電話を取得する。
- `FindInfo` の AI 電話カードは locale ごとの AI 電話番号から従来どおり `tel:` を生成する。

### 9.2 チャット

- `ZoomVirtualAgentWebTag` を製品横断の `ZoomWebChatScript` へ置き換える。
- `activeMode` から解決した config が `null` なら script を出力しない。
- Campaign または Entry ID の選択中 config だけを `next/script` で一つ出力する。
- Entry ID 選択時は `data-chat-entry-id` を落とさず出力する。
- `type` は元タグに存在するときだけ出力する。
- raw HTML を `dangerouslySetInnerHTML` で挿入せず、検証済み属性を React props として再構築する。
- script ID は一つに固定し、同一ページで二重初期化しない。
- 読み込み戦略は、デモの主要機能であるランチャーを確実に表示するため現行どおり `afterInteractive` とする。

言語別 Campaign URL を廃止するため、`FindInfo` から AI チャット外部リンクカードを削除する。チャットは Zoom 標準ランチャーから開始し、Web サイトの言語切替後も同一の Zoom チャットを使用する。

## 10. i18n とアクセシビリティ

`app/i18n/dictionaries.ts` は次の単位へ分け、`ja / en / zh-Hans / zh-Hant / ko` の全五言語を同時に更新する。

- 管理メニューの「電話管理」「AI チャット管理」
- `admin.phoneSettings`
- `admin.chatSettings`
- 三つの利用方式
- 二種類の取得手順と help text
- Campaign / Contact Center のメモラベルと help text
- 方式別 validation error
- 保存中、保存成功、保存失敗

UI 要件:

- radio group は `fieldset` / `legend` を使う。
- 選択状態を色だけで表さず、radio と「使用中」テキストを併用する。
- textarea と help/error を `aria-describedby` で関連付ける。
- すべての textarea に安定した `id` と `name` を付ける。
- error は `role="alert"`、成功は `role="status"` を維持する。
- クリック可能な button/radio card は project 規約どおり pointer cursor を持つ。
- keyboard、focus ring、desktop、390px mobile を確認する。

## 11. 想定ファイル

### 新規

- `app/admin/phone-settings/page.tsx`
- `app/admin/phone-settings/PhoneSettingsForm.tsx`
- `app/admin/chat-settings/page.tsx`
- `app/admin/chat-settings/ChatSettingsForm.tsx`
- `app/components/ZoomWebChatLauncher.tsx`
- `app/components/ZoomWebChatScript.tsx`
- `lib/phone-settings.ts`
- `lib/chat-settings.ts`
- `lib/server/phone-settings.ts`
- `lib/server/chat-settings.ts`
- `lib/zoom-web-chat-tag.ts`
- `prisma/migrations/*_split_phone_and_chat_settings/migration.sql`
- `test/phone-settings.test.ts`
- `test/chat-settings.test.ts`
- `test/zoom-web-chat-script.test.ts`
- `test/zoom-web-chat-tag.test.ts`

### 変更

- `app/admin/AdminShell.tsx`
- `app/api/[[...route]]/route.ts`
- `app/i18n/dictionaries.ts`
- `app/page.tsx`
- `app/components/Footer.tsx`
- `app/components/FindInfo.tsx`
- `app/components/Header.tsx`
- `app/components/PublicInformationLayout.tsx`
- `app/docs/[...slug]/page.tsx`
- `prisma/schema.prisma`
- `lib/site-settings.ts`
- `lib/server/site-settings.ts`
- `test/site-settings.test.ts`

### 削除

- `app/admin/phone-numbers/page.tsx`
- `app/admin/phone-numbers/PhoneNumbersForm.tsx`
- `app/components/ZoomVirtualAgentWebTag.tsx`
- `app/components/svg/VoiceChatIcon.tsx`
- `lib/zoom-virtual-agent-web-tag.ts`
- `test/zoom-virtual-agent-web-tag.test.ts`

## 12. 実装順序

### Phase 1: ドメインと DB

- [x] `PhoneSettings` と `ChatSettings` の型・validator を分離する。
- [x] Campaign / Entry ID の方式別 Web Tag parser と formatter を実装する。
- [x] Prisma schema を電話、チャット、言語へ分離する。
- [x] migration を作成し、既存代表電話、AI 電話、Campaign タグを移行する。
- [x] `virtualAgentCampaignUrl` を DB と生成 Prisma Client から除去する。

### Phase 2: server/API

- [x] 電話とチャットの read/save 関数を分離する。
- [x] 二つの admin PUT API を追加する。
- [x] 旧 contact settings API を削除する。
- [x] 電話・チャット相互の非干渉をテストする。

### Phase 3: 管理 UI

- [x] 電話管理ページへ代表電話と AI 電話を移す。
- [x] AI チャット管理ページへ mode selector、二つのタグ欄、二つの専用メモ欄を追加する。
- [x] AdminShell の設定メニューを三項目へ更新する。
- [x] 旧 phone-numbers ページを削除する。
- [x] 全五言語の辞書と error message を更新する。

### Phase 4: 公開 UI

- [x] Footer と AI 電話カードを新しい電話設定へ接続する。
- [x] 選択中の一タグだけを安全に出力する `ZoomWebChatScript` を実装する。
- [x] 言語別 AI チャット URL と AI チャット外部リンクカードを削除する。
- [x] `DISABLED` 時に Zoom SDK を一切読み込まない。

### Phase 5: 検証

- [x] unit / integration / migration test を完了する。
- [x] lint、型検査、production build を完了する。
- [x] 実ブラウザで管理画面と公開サイトを desktop/mobile それぞれ確認する。
- [x] Campaign と Entry ID を実際の Zoom 発行タグで一方式ずつ end-to-end 確認する。
- [x] すべての内部リンクから旧 route 参照が消えていることを確認する。

### 検証実績

- `npm test`: 35件成功。
- `npm run lint`、`npx tsc --noEmit`、`npm exec prisma validate`、`npm run build`: 成功。
- 旧スキーマからのmigrationを一時DBと開発DBで適用し、代表電話・言語別AI電話・Campaignタグの保持を確認。
- Computer Useでdesktopと390×844を確認し、メモ保存・再読込・方式切替・`DISABLED`を検証。
- 実タグでCampaignはEntry IDなし、Contact CenterはEntry ID付きのscriptが各1件だけ出力されることを確認。
- `/`、`/life`、`/news`、`/docs/*`で標準ランチャーを確認し、旧ページ/APIは404を確認。

## 13. 自動テスト項目

- Campaign タグを Campaign parser だけが受理する。
- Entry ID タグを Entry ID parser だけが受理する。
- 属性順、`type` の有無、`data-env` の有無、両 SDK filename を受理する。
- HTTP、偽 Zoom host、host/env 不一致、query/hash、inline script、未知/重複属性を拒否する。
- 二つのタグを保存しても active config は一つだけになる。
- mode 切替後も非選択タグを保持する。
- mode 切替や `DISABLED` 選択後も両メモを保持する。
- メモの複数行と日本語を保持し、空白を `null` に正規化して 4,000 文字超過を拒否する。
- 公開 HTML、公開ページ props、Zoom SDK 属性、ログへメモを出力しない。
- `DISABLED` は active config を `null` にする。
- 選択タグ未設定を拒否する。
- 不正な非選択タグも拒否する。
- 電話保存で chat row が変化しない。
- チャット保存で phone row が変化しない。
- migration 前後で代表電話、AI 電話、既存 Campaign タグが一致する。
- `virtualAgentCampaignUrl`、旧 route、旧 API のコード参照が 0 件になる。

実行コマンド:

```bash
npm run db:generate
npm exec prisma validate
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## 14. ブラウザ受け入れ条件

- `/admin/phone-settings` と `/admin/chat-settings` が admin だけに表示される。
- 設定メニューの current state、Escape、外側クリック、focus return が維持される。
- 電話ページとチャットページを別タブで保存しても相手側の値が失われない。
- チャット画面に二つのタグ欄と各専用メモ欄が同時表示され、選択方式が明確に分かる。
- mode 切替・保存・reload 後も両タグと両メモが保持される。
- Campaign 選択時、公開 DOM の Zoom SDK script は一つで `data-chat-entry-id` がない。
- Entry ID 選択時、公開 DOM の Zoom SDK script は一つで正しい `data-chat-entry-id` がある。
- `DISABLED` 選択時、Zoom SDK script と Zoom CDN request がない。
- Zoom 標準ランチャーから選択した Campaign または Flow が起動する。
- Web サイトの言語を切り替えても同じ Zoom チャット設定が使われる。
- 公開ページに言語別 Campaign URL と AI チャット外部リンクカードが残っていない。
- desktop と 390px mobile で横スクロール、文字切れ、重なりがない。
- 旧 `/admin/phone-numbers` と旧 API は互換対象外として利用されていない。

## 15. 対象外

- Zoom API を使った Campaign / Flow / Entry ID の自動作成や一覧取得
- Campaign と Entry ID の同時読み込み
- 複数 Campaign の切替
- Full-page / Offsite Campaign URL の管理
- 独自チャット起動ボタンと mode 別 adapter
- 旧 route、旧 API、旧 DB model の恒久的な互換層
- Zoom mobile SDK
