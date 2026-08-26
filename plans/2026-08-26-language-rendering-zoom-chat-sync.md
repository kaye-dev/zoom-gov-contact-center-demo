# 言語初期描画と Zoom チャット言語同期 実装計画

- 作成日: `2026-08-26`
- 調査対象コミット: `add6b7f3b5b6`
- 状態: 実装・自動検証完了（実ブラウザー／実Zoom環境の確認待ち）

## 1. 目的

サイトで保存済みの言語がある場合に、日本語の初期表示を経由せず、対象言語の辞書が反映されてから画面を表示する。

併せて、公開サイトで選択した言語を Zoom Virtual Agent の新しいチャットエンゲージメントの言語へ反映する。Zoom が公式に提供する多言語 Campaign の `HTML lang` 検出を使用し、Web SDK に未記載の独自属性や未保証の動的再初期化には依存しない。

## 2. 完了時の期待挙動

1. 保存済み言語が `en` の状態でページを直接表示・再読み込みしても、日本語文言を一瞬表示しない。
2. 言語が確定するまで本文を非表示にし、辞書と `html lang` の両方が一致してから表示する。
3. `html lang` は Zoom Campaign が解釈する次の明示的な言語コードにする。

   | サイトロケール | `html lang` / Zoom Campaign |
   | --- | --- |
   | `ja` | `ja-JP` |
   | `en` | `en-US` |
   | `zh-Hans` | `zh-CN` |
   | `zh-Hant` | `zh-TW` |
   | `ko` | `ko-KR` |

4. Zoom Web SDK はサイト言語の確定後に一度だけ読み込む。
5. 言語メニューで別言語を選択した場合は、選択値を保存してページを再読み込みし、Zoom SDK に新しい `html lang` を再検出させる。
6. 無効化された言語や不正な保存値は既存仕様どおり日本語へフォールバックし、`html lang="ja-JP"` で起動する。
7. 開始済みのチャットは Zoom の仕様どおり、そのエンゲージメント開始時の言語を維持する。言語変更は新しいエンゲージメントから反映する。

## 3. 現在期待どおりにならない原因

### 3.1 初期描画

- `app/layout.tsx` が常に `lang="ja"` をSSRする。
- `LanguageProvider` のサーバースナップショットは常に `ja` であり、保存言語はハイドレーション後に `localStorage` から取得する。
- `html lang` の更新は `useEffect` で行われるため、ブラウザーが日本語の初期HTMLを表示できる時間がある。
- `theme-loading` は `ThemeSync` の同期完了だけで解除され、言語同期の完了を待っていない。

### 3.2 Zoom チャット

- `ZoomWebChatScript` は `apiKey`、`env`、必要に応じて `chatEntryId` だけを渡し、サイト言語の確定状態を参照しない。
- SDK は `afterInteractive` で一度だけ読み込まれ、サイト内のクライアント状態変更では再初期化されない。
- 現在の言語切り替えは `html lang` を変更するだけでページを再読み込みしないため、すでに初期化済みの Campaign に再検出の機会がない。

## 4. Zoom 公式仕様と前提条件

Zoom Virtual Agent の多言語 Campaign は、利用者の言語を次のいずれかで検出できる。

- ブラウザー言語
- ページの `HTML lang` 属性

本対応では、サイトの言語メニューを正本にするため `HTML lang` 属性を選択する。Campaign が言語を検出すると、その言語がエンゲージメント全体へ設定される。未対応言語は Campaign のデフォルト言語へフォールバックする。

Zoom 管理画面では、コード変更とは別に次の設定が必要になる。

1. AI Studio の対象 Virtual Agent が `ja-JP`、`en-US`、`zh-CN`、`zh-TW`、`ko-KR` 相当の言語をサポートしていることを確認する。
2. 対象 Campaign の Language を `Multiple languages` にする。
3. Language Detection に `HTML Lang attribute` を指定する。
4. Campaign Default は日本語にする。
5. サイトで有効化する全言語を Campaign に追加し、Virtual Agent 側の言語バリアントと一致させる。
6. ヘッダー、メッセージ、CTAなどの Campaign 文言にも各言語のAssetを設定する。
7. Campaignを保存・公開する。

この公式な自動検出は多言語 Campaign 向けであり、単一言語 Campaign では利用できない。また、今回確認した公式資料は `CONTACT_CENTER_ENTRY_ID` 方式で同じ検出動作を保証していない。受け入れ確認は `CAMPAIGN` モードを正規経路として行う。Entry ID方式も維持する場合は、別途実環境で言語動作を確認し、確認できなければ言語同期要件の対象外とする。

根拠:

- [Setting up multi-language campaign for Zoom Virtual Agent](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0076994)
- [Setting up Zoom Virtual Agent multi-language and single-language bots](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0076995)
- [Zoom Virtual Agent Web Chat SDK](https://developers.zoom.us/docs/virtual-agent/web/chat/)
- [Zoom Contact Center Web Chat SDK](https://developers.zoom.us/docs/contact-center/web/chat/)

## 5. 設計方針

### 5.1 サイトロケールとHTML言語コードを分離する

辞書キーと `localStorage` には既存の `ja / en / zh-Hans / zh-Hant / ko` を維持する。`html lang` へ設定するときだけ、Zoom Campaign が利用する4桁系コードへ変換する。

変換表と変換関数は `lib/site-settings.ts` または言語専用の小さな共通モジュールに置き、`layout.tsx`、`LanguageProvider`、テストから同じ定義を参照する。コンポーネント内に変換を重複記述しない。

### 5.2 言語同期完了まで本文を表示しない

`html` の初期クラスへ `language-loading` を追加する。CSSで `language-loading` 中の `body` を `visibility: hidden` にし、初期トランジションも無効化する。

`LanguageProvider` は `useEffect` ではなく `useLayoutEffect` で次を同期する。

1. 保存言語を有効言語一覧で検証する。
2. 不正・無効な値を日本語へ正規化して保存する。
3. React Context の `locale` と保存言語が一致するまで `language-loading` を維持する。
4. 一致後に変換済みの値を `document.documentElement.lang` へ設定する。
5. Contextへ `isLocaleReady: true` を公開してから `language-loading` を解除する。

テーマ側は引き続き `theme-loading` だけを解除する。本文は `theme-loading` と `language-loading` の両方が外れた時点で表示されるため、テーマと言語のどちらが先に同期しても途中状態を描画しない。

例外処理では必ず日本語へ収束させ、`language-loading` が永久に残らないようにする。

### 5.3 言語変更時はページを再読み込みする

異なる言語を選択した場合は、保存値を書き換えた後に現在のURLを再読み込みする。同じ言語を選択した場合は再読み込みしない。

この再読み込みには次の目的がある。

- 保存言語から一貫した初期描画をやり直す。
- Zoom SDKを新しいドキュメント上で一度だけ初期化する。
- Campaignに新しい `html lang` を確実に再検出させる。
- 公式に削除・再初期化手順が記載されていない `window.zoomCampaignSdk` やiframeをSPA上で操作しない。

別タブの `storage` イベントで実効言語が変わった場合も、同じ理由から現在のページを再読み込みする。`localStorage` を利用できない環境では日本語へフォールバックし、再読み込みループを起こさない。

### 5.4 Zoom SDKを言語Ready状態でゲートする

サーバー側の `ZoomWebChatLauncher` は、現在どおりDBから安全な一つの設定だけを取得する。

その下にクライアント側のゲートコンポーネントを追加し、`useI18n()` の `isLocaleReady` が `true` になり、`html lang` が現在のロケールに対応する値と一致した場合だけ `ZoomWebChatScript` を描画する。

既存の以下の契約は維持する。

- `DISABLED` ではSDKを読み込まない。
- CampaignとEntry IDのうち選択中の一方式だけを読み込む。
- script IDは `zoom-web-chat-script` の一つだけにする。
- 検証済みの `src`、`apiKey`、`env`、`chatEntryId` だけをReact propsとして出力する。
- 読み込み戦略は `afterInteractive` を維持する。
- Web SDK公式資料にない `data-language` 等の属性は追加しない。

### 5.5 進行中エンゲージメントの扱い

Zoomは検出した言語をエンゲージメント全体へ設定するため、開始済みチャットの途中で言語を変更することは本対応の対象外とする。

受け入れ条件は「サイト言語を選択・再読み込みした後に開始する新しいチャットが、その言語で開始する」とする。既存エンゲージメントを自動終了する処理は会話消失につながるため追加しない。必要になった場合は、確認ダイアログと `endChat()` を伴う別要件として扱う。

## 6. 変更対象

### 6.1 `lib/site-settings.ts` または新規言語共通モジュール

- サイトロケールから `html lang` への完全な変換表を追加する。
- 全 `SITE_LOCALES` に対応値があることを型で保証する。
- 日本語フォールバックを共通関数にする。

### 6.2 `app/layout.tsx`

- SSR時の既定値を `lang="ja-JP"` にする。
- `html` の初期クラスへ `language-loading` を追加する。
- `availableLocales` は現在どおり管理画面設定から解決して `LanguageProvider` へ渡す。

### 6.3 `app/globals.css`

- `language-loading body` の非表示規則を追加する。
- 言語同期中もトランジションを無効化する。
- テーマ背景色は既存の `theme-loading` 契約を維持する。

### 6.4 `app/i18n/LanguageProvider.tsx`

- 初期同期を `useLayoutEffect` へ変更する。
- `html lang` には変換済みコードを設定する。
- Contextに `isLocaleReady` を追加する。
- 保存値・Context・DOMの一致後だけReadyにする。
- 異なる言語への変更と別タブ変更では安全に再読み込みする。
- 不正値、無効言語、`localStorage` 例外時の日本語フォールバックを維持する。

必要であれば、ストレージ購読とDOM同期を `app/i18n/language-store.ts` へ分離し、テーマ実装と同じく純粋関数を単体テスト可能にする。

### 6.5 `app/components/LanguageMenu.tsx`

- 同一言語ではメニューを閉じるだけにする。
- 言語変更時はProviderの保存・再読み込み契約を利用する。
- デスクトップとモバイルで同じ挙動を維持する。

### 6.6 `app/components/ZoomWebChatScript.tsx`

- 安全なscript要素の組み立て責務は維持する。
- Hookを直接混在させず、必要なら新規のクライアントゲートコンポーネントから呼び出す。

### 6.7 `app/components/ZoomWebChatLauncher.tsx`

- サーバーで取得した `ZoomWebChatTagConfig` をクライアントゲートへ渡す。
- DBアクセスとSDK描画タイミングの責務を分離する。

### 6.8 テスト

- `test/language-rendering.test.ts` を追加する。
- `test/site-settings.test.ts` に全5言語の変換とフォールバックを追加する。
- `test/zoom-web-chat-script.test.ts` は既存の安全な属性検証を維持し、言語Ready前にSDKを描画しない契約を追加する。
- `test/theme-rendering.test.ts` は `theme-loading` と `language-loading` の共存を検証する。

DBスキーマ、管理API、チャットタグvalidatorの変更は不要とする。

## 7. 実装順序

1. サイトロケールから `html lang` への変換と単体テストを追加する。
2. `language-loading` と `LanguageProvider` のReady判定を実装する。
3. 言語選択時・別タブ変更時の再読み込み契約を実装する。
4. Zoom SDKの言語Readyゲートを追加する。
5. 既存のCampaign／Entry ID／DISABLEDのscript属性テストを維持・拡張する。
6. Zoom管理画面で多言語CampaignとHTML lang検出を設定する。
7. 自動テスト、型検査、Lint、Production buildを実行する。
8. 実ブラウザーと実Zoom環境で5言語を確認する。

## 8. 自動検証

最低限、次を実行する。

```text
npm test
npm run typecheck
npm run lint
npm run build
```

追加テストでは次を確認する。

- 全サイトロケールに一意なZoom対応言語コードがある。
- 保存済み言語とContextが一致するまで `language-loading` を解除しない。
- 無効化済み・未知・取得失敗時は日本語に収束して非表示状態を解除する。
- テーマ同期だけでは本文を表示しない。
- 言語Ready前はZoom scriptが存在しない。
- 言語Ready後もZoom scriptは一つだけで、既存の検証済み属性を保持する。
- `DISABLED` ではReady後もZoom scriptが存在しない。
- 同一言語選択では再読み込みしない。
- 異なる言語選択と別タブ変更では一度だけ再読み込みする。

## 9. 実ブラウザー・実Zoom受け入れ確認

表示確認時はプロジェクト規約に従い、先に3000番台の起動中ポートを調べ、CodexのComputer Useで実施する。

各言語について次を確認する。

1. `localStorage.locale` を対象言語にして直接アクセスする。
2. CPUまたはネットワークを遅延させて再読み込みし、別言語の文言が一瞬でも表示されないことを確認する。
3. 表示後の辞書、言語メニューの選択状態、`html lang` が一致することを確認する。
4. Zoom SDKのリクエストが言語Ready後に一度だけ発生することを確認する。
5. 新しいチャットを開始し、Campaign UI、挨拶、ボット応答が選択言語になることを確認する。
6. チャットを終了して別言語へ切り替え、再読み込み後の新しいチャットが変更後の言語になることを確認する。

追加ケース:

- 保存値なし → 日本語
- 無効化された保存言語 → 日本語
- Campaignで未設定の言語 → Campaign Defaultの日本語になることを確認し、設定不備として検知する
- `DISABLED` → Zoom SDKリクエストなし
- `CONTACT_CENTER_ENTRY_ID` → `html lang` は正しいが、チャット言語は公式保証対象外として実測結果を記録する
- デスクトップ／モバイル双方の言語メニュー
- ハードリロード／同一オリジン内のページ遷移

## 10. 受け入れ基準

- 保存済み言語以外の文言が初期表示されない。
- 本文表示時点で辞書、メニュー選択状態、`html lang` が一致している。
- 5言語の `html lang` が変換表どおりである。
- 言語変更後は新しいドキュメントでZoom SDKが一度だけ初期化される。
- 多言語Campaign＋HTML lang検出の実Zoom環境で、新しいチャットが5言語すべて選択どおりに開始する。
- 進行中エンゲージメントの言語をサイト側から変更しない。
- 既存のテーマ切り替え、言語有効／無効設定、Campaign／Entry ID切り替え、`DISABLED` が回帰しない。
- `npm test`、`npm run typecheck`、`npm run lint`、`npm run build` が成功する。

## 11. リスクと対策

### JavaScript実行前は本文が非表示になる

既存のテーマ同期も同じ方式を採用している。例外時は日本語へフォールバックして必ずReadyにし、永久非表示を防ぐ。JavaScript無効環境への対応が必要になった場合は、`noscript` 用の表示規則を別途追加する。

### 言語変更時にページ再読み込みが発生する

Zoom SDKの実行中インスタンスを未保証の方法で差し替えないための意図した挙動とする。選択言語は同じURLへ復帰し、テーマ・言語は保存値から復元する。

### Zoom管理設定とサイト設定がずれる

サイトで有効にする言語、Campaignの言語、Virtual Agentの言語バリアントを同じ集合にする。受け入れ確認で5言語を個別に開始し、フォールバックを正常系として見逃さない。

### Entry ID方式では自動検出が保証されない

期待動作の正規受け入れ経路をCampaign方式に限定する。Entry IDでも同じ要件が必要な場合は、実環境検証で可否を確定してから別方式を設計する。

## 12. 対象外

- 開始済みチャットの途中での言語変更
- 言語変更時の既存エンゲージメント自動終了
- Zoom管理画面のCampaign／Virtual Agent設定をAPIで自動変更する処理
- 言語別Web Tagや言語別Entry IDをDBへ保持するスキーマ変更
- URLパスを `/ja`、`/en` などへ分割するルーティング変更
