# Zoom Contact Center ビデオ相談の設定手順

対象: 大学サイトの `/consultation?state=now-open`。管理者が上から順に実施する。Zoomの画面名は2026-09-13確認時点。新しい管理画面では「Admin Center → Product configuration → Contact Center」から同じ設定を開く。

## 1. 作業対象を決める

| 項目 | 今回の設定 |
| --- | --- |
| フロー | デモ-日本郵政G-窓口応対 |
| Flow ID | `p0rbD_YkR4i-w_05VGcK3Q` |
| チャネル | ビデオ |
| 公開バージョン | 2（旧バージョン1はアーカイブ） |
| キュー | `Q_Video_Consultation_DEMO` |
| Queue ID | `UvERMXRITjOlzu4wr9c99Q` |
| エージェント | 西川 継延 |
| エントリーポイント名 | `JP-POST-CX` |
| Entry ID | `8oAUdZfTT0-4vGx-uqdF0g` |
| サイト設定対象 | 大学（`univ`） |

今回の3相談項目は同じデモ窓口へ接続する。項目別の担当者へ分ける場合は、項目ごとにキュー・フロー・Entry IDを用意し、手順4でそれぞれのタグを登録する。Flow ID、Entry ID、Queue IDは別物。

## 2. ビデオキューを作る

1. Zoom管理ポータルの「コンタクトセンター管理 → キュー → キューを追加」を開く。
2. 名前に `Q_Video_Consultation_DEMO`、チャネルに「ビデオ」を指定して保存する。既に存在すればそのキューを開く。
3. 「一般 → 割り当てられたユーザー → ユーザーを追加する → エージェントを追加」で担当者を選択して追加する。
4. 割り当て一覧に対象エージェントが表示されることを確認する。Zoom Contact Centerライセンスを持つ既存ユーザーを使う。
5. 「着信設定」で次を確認する。
   - エンゲージメント振り分け: 最長アイドル（オファーベース）
   - 各ユーザーの通知期間: 30秒
   - エンゲージメントの受け入れ: 手動
   - 最大待機期間: 30分
   - オーバーフロー: 終了メッセージを再生して切断
6. 「対応時間」を確認する。今回のデモキューはアカウント既定の全曜日終日を使用。実運用では必要なタイムゾーン・営業時間・休業日を設定する。

根拠: [キュー作成](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0061959)、[ビデオキュー設定](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0077581)。

## 3. フローを接続して公開する

1. [フロー一覧](https://zoom.us/cci/index/admin#/admin-studios)から対象フローを開く。新規なら「フローを追加 → ビデオ」を選ぶ。
2. 公開済みフローを編集するときは「その他のフローオプション → ドラフト バージョンを作成」。説明を入力して追加する。
3. 左の「ルーティング先」をキャンバスへドラッグする。
4. 追加した `Route_to` を選び「設定 → ルーティング先: キュー → キュー」で手順2のキュー名を検索して選択する。
5. `Start` を選び「終了 → ビデオ」で `Route_to` を選ぶ。キャンバス上で線が接続されることを確認する。
6. 「保存」を押し、保存ボタンが無効になるまで待つ。
7. 「公開」を押す。検証エラーがあれば該当ウィジェットを修正する。公開確認で対象の新旧バージョンを確認して「公開」を押す。
8. バージョン表示が「公開済み」になったことを確認する。ドラフトの保存だけでは着信経路は切り替わらない。

```text
Start（ビデオ） → Route_to（ビデオキュー） → 準備完了の担当者へ着信
```

根拠: [Route Toウィジェット](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063774)。

## 4. Entry IDとサイトを接続する

1. 公開版の `Start → 設定 → エントリ ポイント → 管理` を開く。
2. 未割り当てなら「エントリ ポイントを追加」でEntry IDを選び保存する。候補がなければ「コンタクトセンター管理 → 設定（Preferences）→ エントリ ID → エントリ IDを作成」で表示名を入力して作成し、フローへ戻って割り当てる。今回の `JP-POST-CX` は既存の割り当てを使用する。
3. 対象行の「SDK をインポートする」（英語画面ではInstall SDK）を押し、表示されたタグをコピーする。

   ```html
   <script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/video-client.js" data-entry-id="ENTRY_ID" data-env="us01" data-apikey="ZOOM_ISSUED_WEB_KEY"></script>
   ```

4. 本アプリの `/admin/online-consultation-settings?tenant=univ` を開く。対象業種が「大学」であることを確認する。
5. 「入学・入試」「学生生活・奨学金」「キャリア」の各タブの「接続用Webタグ」へ貼り付ける。各項目で接続先を分ける場合は対応するタグを使う。
6. 「設定を保存」を押す。全タブが一括保存される。「大学の設定を保存しました」の表示を確認する。
7. 相談画面を再読み込みし、受付時間内に相談開始ボタンが有効になることを確認する。

このタグはWebクライアント用であり、MarketplaceのOAuth Client Secretではない。秘密鍵を貼り付けない。本アプリはタグをそのままHTMLとして実行せず、公式SDK URL・Entry ID等を検証して利用する。

根拠: [Entry ID作成](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060884)、[エントリーポイント](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059448)、[ビデオSDK・カスタムボタン](https://developers.zoom.us/docs/contact-center/web/video/)。

## 5. エージェント接続を確認する

1. 担当者がZoom Workplaceの「コンタクトセンター」にログインする。
2. 対象キューの着信受け入れを有効にし、ステータスを「準備完了」にする。
3. 利用者側で `/consultation?state=now-open` を開き、相談項目の「ビデオ相談を開始」を押す。
4. Zoomの画面で必要な入力を行い、利用者自身がカメラ・マイクの許可を確認して参加する。
5. 担当者側でビデオ着信を受け入れる。双方の音声・映像を確認する。
6. 終了後に相談ページへ戻り、別の相談項目で再度起動できることを確認する。待機中の退出後にボタンが無効のままなら「相談を終了して戻る」を押す。担当者は「ラップアップを保存してクローズ」で後処理を完了する。

「受付中」はサイトの時間・接続設定の判定であり、担当者の空き状況をリアルタイム取得した表示ではない。待ち行列・実際の配信はZoom側で処理される。SDKの起動と担当者による受け入れは別々に確認する。

## 6. 接続できないとき

| 症状 | 確認する場所 |
| --- | --- |
| 状況確認中のまま | 相談受付APIのHTTP結果、DB接続、サイト公開アクセス設定 |
| 開始ボタンが無効 | 大学の全項目に有効なSDKタグがあるか、平日9〜17時（日本時間）か |
| SDK起動失敗 | 公式タグのURL・Entry ID、ネットワーク、ブラウザーのコンソール |
| Zoom画面は開くが着信しない | 公開版Startの接続、対象キューのメンバー、担当者の準備完了・キュー受信、営業時間 |
| 待機後に切断 | キューの最大待機期間・オーバーフロー、担当者の応答状況 |
| キュー候補がない | キューがビデオチャネルか。新規作成後は名前を入力して再検索する |

ローカルで時間外に実通話を試す場合だけ `.env.local` に `CONSULTATION_DEMO_ALWAYS_OPEN=1` を設定して開発サーバーを再起動する。この設定は `NODE_ENV=development` のときだけ有効。URLの `state=now-open` は画面選択であり、Productionの受付制限を解除しない。

## 実装を変更する場合

- タグ検証: `lib/zoom-video-tag.ts`。公式SDKのURL・Entry IDを検証する。
- 起動: `lib/zoom-video-client.ts`。カスタムボタン方式ではスクリプトを`src`のみでロードし、`new VideoClient({ env }) → init({ entryId }) → startVideo()`を呼ぶ。`data-apikey`・`data-entry-id`をスクリプトへ付けると自動埋め込み方式になるため混在させない。
- 公開API: `app/api/public/consultation-availability/route.ts`。公開アクセス・大学テナント・受付時間を検証し、開始クリック時にも再取得する。
- 終了: `ConsultationAvailability.tsx`。SDKの終了イベントでページを再読み込みし、終了済みオーバーレイを除去する。

## 今回の確認結果（2026-09-13）

- 公開版2、キュー割り当て、大学3項目のタグ保存を管理画面で確認。
- `univ.localhost:3000`から担当者へ着信し、応答後の参加者2名・担当者側`Active Inbound video`を確認。
- 入学相談の接続記録: `G0LZY2lZQae1FH8xgHYoNQ`。学生生活相談でも接続と利用者退出後の相談ページ復帰を確認。
- 復帰後、キャリア相談のSDK再起動と待機画面を確認。
- 待機退出後の「相談を終了して戻る」で3項目が再び操作可能になることを確認。
- マイク・カメラの許可操作および双方の実音声・映像品質は未確認。
- 関連テスト13件、TypeScript、変更対象ESLintが成功。

## Codexへ依頼する場合

```text
docs/zoom/video-consultation-setup.mdを上から実施してください。
Zoom設定はCodex内ブラウザで行い、既存フロー・Entry ID・キューを確認して再利用してください。
対象業種、相談項目と接続先の対応、受信担当者、作業対象URLを確認してください。
公式ドキュメントを参照し、公開版・キュー割り当て・サイト保存を読み戻してください。
通話開始、担当者着信、受け入れ、音声映像の確認を分けて報告してください。
未確認項目を成功扱いせず、実装変更は関連テスト・型・lintと同期してください。
```
