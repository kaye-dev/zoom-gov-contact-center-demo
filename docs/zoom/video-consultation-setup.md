# Zoom Contact Center ビデオ相談の設定手順

対象: 大学サイトの `/consultation?state=now-open`。管理者が上から順に実施する。Zoomの画面名は2026-09-13確認時点。新しい管理画面では「Admin Center → Product configuration → Contact Center」から同じ設定を開く。

## 1. 作業対象を決める

| 項目 | 今回の設定 |
| --- | --- |
| フロー | デモ-日本郵政G-窓口応対 |
| Flow ID | `p0rbD_YkR4i-w_05VGcK3Q` |
| チャネル | ビデオ |
| 公開バージョン | 3（旧バージョンはアーカイブ） |
| キュー | 下表の3キュー |
| エージェント | 西川 継延 |
| エントリーポイント名 | `JP-POST-CX` |
| Entry ID | `8oAUdZfTT0-4vGx-uqdF0g` |
| サイト設定対象 | 大学（`univ`） |

3相談項目で同じフロー・Entry IDを使用し、サイトから渡すカテゴリーでキューを切り替える。Flow ID、Entry ID、Queue IDは別物。

| 相談項目 / category | キュー | Queue ID |
| --- | --- | --- |
| 入学・入試 / `admissions` | `Q_Univ_Admissions` | `XV6k3mqWTYKVGU9h-Yybcw` |
| 学生生活・奨学金 / `student-support` | `Q_Univ_StudentSupport` | `KxtVE5yEQMaCB0A65Kl-ug` |
| キャリア / `careers` | `Q_Univ_Careers` | `fLwNiDdrSfSjaUezRUqraw` |

デモでは全キューに西川 継延を割り当てる。担当者を分けるときは各キューの割り当てだけを変更する。旧 `Q_Video_Consultation_DEMO` は残してあるが、新フローの接続先には使用しない。

## 2. ビデオキューを作る

1. Zoom管理ポータルの「コンタクトセンター管理 → キュー → キューを追加」を開く。
2. 上表の3キューをそれぞれ作成し、チャネルに「ビデオ」を指定して保存する。既に存在すればそのキューを開く。以下は3キューすべてで実施する。
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
3. Zoomの「設定（Preferences）→ 変数」でカスタムグループ `UniversityConsultation` を作り、`category` を追加する。種類: グローバル変数、データ型: 文字列、レポートで使用: オン。値の取得元を「ウェブサイトのデータから → グローバル Javascript 変数」、パスを `window.universityConsultation.category` にして保存する。
4. フローへ戻り「ルーティング先」を3個配置する。名前を `Route_Admissions` / `Route_StudentSupport` / `Route_Careers` にし、それぞれ「設定 → キュー」で上表の対応キューを選ぶ。
5. 「条件」を配置する。「設定 → タイプ: 変数」で `category` を選び、パスが `{{global_custom.UniversityConsultation.category}}` であることを確認する。「終了 → 終了を追加」で3出口を作り、条件を「次に等しい」、値を上表のcategory、終了名を相談項目名、次のウィジェットを対応する `Route_*` にする。
   - 予備経路として「入力を収集」を配置する。クイック応答・ボタン、プロンプト: 画像、テキスト: `相談カテゴリーを選んでください。`。画像アセット・音声は未指定、退出可、最大待機300秒。
   - 予備経路の「終了」で3出口を作り、終了名・ボタン名を相談項目名、次のウィジェットを対応する `Route_*` にする。タイムアウト・整合なしは未接続で終了する。
   - `Condition → 終了 → 整合なし` を `CollectInput` へ、`Start → 終了 → ビデオ` を `Condition` へ接続する。
6. 「保存」を押し、保存ボタンが無効になるまで待つ。
7. 「公開」を押す。検証エラーがあれば該当ウィジェットを修正する。公開確認で対象の新旧バージョンを確認して「公開」を押す。
8. バージョン表示が「公開済み」になったことを確認する。ドラフトの保存だけでは着信経路は切り替わらない。

```text
Start → Condition(category)
          ├ admissions      → Route_Admissions     → 入学・入試キュー
          ├ student-support → Route_StudentSupport → 学生生活・奨学金キュー
          ├ careers         → Route_Careers        → キャリアキュー
          └ 整合なし        → CollectInput（カテゴリー選択）→ 対応するRoute_*
```

根拠: [グローバル変数](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059058)、[Condition](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065873)、[Collect Input](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065278)、[Route To](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063774)。

## 4. Entry IDとサイトを接続する

1. 公開版の `Start → 設定 → エントリ ポイント → 管理` を開く。
2. 未割り当てなら「エントリ ポイントを追加」でEntry IDを選び保存する。候補がなければ「コンタクトセンター管理 → 設定（Preferences）→ エントリ ID → エントリ IDを作成」で表示名を入力して作成し、フローへ戻って割り当てる。今回の `JP-POST-CX` は既存の割り当てを使用する。
3. 対象行の「SDK をインポートする」（英語画面ではInstall SDK）を押し、表示されたタグをコピーする。

   ```html
   <script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/video-client.js" data-entry-id="ENTRY_ID" data-env="us01" data-apikey="ZOOM_ISSUED_WEB_KEY"></script>
   ```

4. 本アプリの `/admin/online-consultation-settings?tenant=univ` を開く。対象業種が「大学」であることを確認する。
5. 「入学・入試」「学生生活・奨学金」「キャリア」の各タブの「接続用Webタグ」へ同じタグを貼り付ける。キューの切り替えはカテゴリー変数で行う。
6. 「設定を保存」を押す。全タブが一括保存される。「大学の設定を保存しました」の表示を確認する。
7. 相談画面を再読み込みし、受付時間内に相談開始ボタンが有効になることを確認する。

このタグはWebクライアント用であり、MarketplaceのOAuth Client Secretではない。秘密鍵を貼り付けない。本アプリはタグをそのままHTMLとして実行せず、公式SDK URL・Entry ID等を検証して利用する。

根拠: [Entry ID作成](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060884)、[エントリーポイント](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059448)、[ビデオSDK・カスタムボタン](https://developers.zoom.us/docs/contact-center/web/video/)。

## 5. 事前入力3項目を接続する

1. 「設定 → 変数 → UniversityConsultation」で次のグローバル変数を追加する。データ型はすべて文字列、レポートで使用はオン。

   | 変数名 | 入力項目 | グローバル Javascript 変数のパス |
   | --- | --- | --- |
   | `displayName` | 呼び名（40文字まで） | `window.universityConsultation.displayName` |
   | `affiliation` | 立場（受験生・在学生・保護者・その他） | `window.universityConsultation.affiliation` |
   | `topic` | 相談概要（300文字まで） | `window.universityConsultation.topic` |

2. 各変数の取得元を「ウェブサイトのデータから → グローバル Javascript 変数」にして、上表のパスを保存する。
3. 相談ページを再読み込みし、カテゴリーの開始ボタンで事前入力画面が開くことを確認する。
4. 架空のデモ情報を入力して「入力して相談を開始」を押す。Zoomの着信名に呼び名が表示されることを確認する。

全3項目は必須。ブラウザのメモリだけで保持し、アプリDB・URL・Web Storageへ保存しない。送信後はZoom側のエンゲージメント変数として扱われる。立場は選択時の表示言語で送られる。接続失敗時は入力を保持して再試行できる。

根拠: [Web Videoのname指定](https://developers.zoom.us/docs/contact-center/web/video/)、[Webサイトデータからの変数取得](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059058)。

## 6. 大学ロゴ付き待機室を設定する

1. Zoomの「待機室 → 待機室を追加」で `WR_Univ_Consultation` を作成する。今回のIDは `Pw3B-bM9QdS7RCFwNMn-zg`。
2. 「カスタマイズ」を開き、「ウェブとモバイルの両方にすべてのコンテンツを適用する」をオンにする。
3. タイトルを `未来大学 オンライン相談`、表示を「ロゴと説明」にする。
4. 「追加 ロゴ → アップロード ロゴ」でアセット名 `Mirai_University_Logo` を入力して「次へ」。ファイル名を入力し、アセット言語「日本語（日本）」、[大学ロゴPNG](assets/mirai-university-logo.png)を選び「追加 → 完了」を押す。
5. 説明を `担当窓口へおつなぎしています。カメラ・マイクの設定をご確認のうえ、そのままお待ちください。` にして保存する。オーディオと待機室通知はオフ。
6. 各 `Q_Univ_*` キューの「一般 → 待機室 → 編集 → 待機室を選択する」で `WR_Univ_Consultation` を選び「追加」。3キューすべてに待機室名が表示されることを確認する。
7. 相談を開始し、担当者が応答する前に大学ロゴ・タイトル・案内文が表示されることを確認する。

ロゴは既存の `public/favicons/univ.svg` を400×400pxのPNGに変換したもの。再生成は `node -e "require('sharp')('public/favicons/univ.svg').resize(400,400).png().toFile('docs/zoom/assets/mirai-university-logo.png')"`。Zoom画面の制約は1MB以下、縦横60〜400px。

根拠: [待機室のカスタマイズ](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064592)。

## 7. 担当者へ入力内容を表示する

1. 「設定 → 変数 → UniversityConsultation」で4変数を選択し、「クライアントに表示する」を開く。
2. 各変数の「エンゲージメント詳細」「着信通話通知に表示する」を両方オンにして保存する。
3. 各変数の「その他のメニュー → 編集」で表示名を設定する。

   | 変数 | 表示名 |
   | --- | --- |
   | `category` | 相談カテゴリー |
   | `displayName` | 呼び名 |
   | `affiliation` | 相談者の立場 |
   | `topic` | 相談したいこと |

4. 新しい相談を架空の情報で開始する。担当者の着信通知と、応答後の「エンゲージメント」詳細で入力値を確認する。既存のエンゲージメントを使い回さない。
5. 担当者の変更は手順2のキューメンバーから行う。変数・Entry ID・サイトのコードは変更不要。

根拠: [変数のクライアント表示](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059058)。

## 8. 終了後アンケートを追加する

1. Zoomポータルの「アカウント管理 → アンケート管理 → 作成」で「コンシューマー エンゲージメント アンケート」を選ぶ。既存の `未来大学 オンライン相談アンケート` がある場合は再利用する。
2. タイトルを `未来大学 オンライン相談アンケート` にする。次の2問を設定する。

   | 質問 | タイプ | 設定 |
   | --- | --- | --- |
   | 今回のオンライン相談にどのくらい満足しましたか？ | レーティングスケール | 1〜5、低いスコア「とても不満」、高いスコア「とても満足」 |
   | ご意見・ご感想をお聞かせください（任意・個人情報は入力しないでください）。 | 長い回答 | 最小1・最大200文字。空欄で送信可能 |

3. 設定の言語が「日本語」であることを確認し、「保存」する。下書き保存は選ばない。
4. 「コンタクトセンター管理 → キュー」で `Q_Univ_Admissions`、`Q_Univ_StudentSupport`、`Q_Univ_Careers` を順に開く。
5. 各キューの「アンケート → エンゲージメント アンケートを追加」で同じアンケートを選び、「保存」する。候補は読み込み完了を待つ。
6. アンケート名と「エージェントとスーパーバイザーにこのアンケートについて示す」がオンになったことを確認する。配信は終了時のウェブ／アプリ内リンク、有効期限は既定の1か月。フローの再公開は不要。
7. Webアプリの終了イベントで自動再読み込みしない実装を反映する。終了状態では別の相談開始を無効にし、明示的な戻るボタンを残す。
8. 架空の情報で相談を開始し、担当者が応答後「終了 → 全員のビデオ通話を終了」を押す。利用者側に終了案内と「このアンケートに回答してください」が残ることを確認する。
9. リンクから別タブのアンケートを開き、回答して「送信」する。「回答が記録されました」を確認する。回答しない場合はリンクを開かず退出してよい。
10. 元の相談タブでZoomの「退出」を押し、サイトの「画面を閉じて相談一覧に戻る」を押す。3つの開始ボタンが再び操作可能になることを確認する。担当者はラップアップを保存してクローズする。
11. 「アカウント管理 → アンケート管理」で対象アンケートの回答件数を開く。「回答者別の結果」の状態 `Finished`、対象キュー、評価・コメントを照合する。

設定済みアンケートID: `CCbDkroRSgWLWEqTb0FemA`。個別回答リンクには通話用トークンが含まれるため、ソース・文書へコピーしない。

根拠: [エンゲージメントアンケート管理](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0057836)、[ビデオキューのSurvey設定](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0077581)、[WebビデオSDKの終了イベント](https://developers.zoom.us/docs/contact-center/web/video/)。公開SDK仕様にアンケート送信完了イベントは記載されていないため、通話終了を回答完了とみなさない。

## 9. エージェント接続を確認する

1. 担当者がZoom Workplaceの「コンタクトセンター」にログインする。
2. 対象キューの着信受け入れを有効にし、ステータスを「準備完了」にする。
3. 利用者側で `/consultation?state=now-open` を開き、相談項目の「ビデオ相談を開始」を押す。
4. Zoomの画面で必要な入力を行い、利用者自身がカメラ・マイクの許可を確認して参加する。
5. 担当者側でビデオ着信を受け入れる。双方の音声・映像を確認する。
6. 終了後は手順8に従いアンケートを確認してから相談一覧へ戻る。待機中の退出後にボタンが無効のままなら「画面を閉じて相談一覧に戻る」を押す。担当者は「ラップアップを保存してクローズ」で後処理を完了する。

「受付中」はサイトの時間・接続設定の判定であり、担当者の空き状況をリアルタイム取得した表示ではない。待ち行列・実際の配信はZoom側で処理される。SDKの起動と担当者による受け入れは別々に確認する。

## 10. 接続できないとき

| 症状 | 確認する場所 |
| --- | --- |
| 状況確認中のまま | 相談受付APIのHTTP結果、DB接続、サイト公開アクセス設定 |
| 開始ボタンが無効 | 大学の全項目に有効なSDKタグがあるか、平日9〜17時（日本時間）か |
| SDK起動失敗 | 公式タグのURL・Entry ID、ネットワーク、ブラウザーのコンソール |
| Zoom画面は開くが着信しない | 公開版Startの接続、対象キューのメンバー、担当者の準備完了・キュー受信、営業時間 |
| 待機後に切断 | キューの最大待機期間・オーバーフロー、担当者の応答状況 |
| アンケートが出ない | 対象キューのアンケート紐付け、担当者応答後の終了操作、Web側が自動再読み込みしていないか |
| キュー候補がない | キューがビデオチャネルか。新規作成後は名前を入力して再検索する |

ローカルで時間外に実通話を試す場合だけ `.env.local` に `CONSULTATION_DEMO_ALWAYS_OPEN=1` を設定して開発サーバーを再起動する。この設定は `NODE_ENV=development` のときだけ有効。URLの `state=now-open` は画面選択であり、Productionの受付制限を解除しない。

## 実装を変更する場合

- タグ検証: `lib/zoom-video-tag.ts`。公式SDKのURL・Entry IDを検証する。
- 起動: `lib/zoom-video-client.ts`。カスタムボタン方式ではスクリプトを`src`のみでロードし、`new VideoClient({ env }) → init({ entryId }) → startVideo()`を呼ぶ。`data-apikey`・`data-entry-id`をスクリプトへ付けると自動埋め込み方式になるため混在させない。
- 公開API: `app/api/public/consultation-availability/route.ts`。公開アクセス・大学テナント・受付時間を検証し、開始クリック時にも再取得する。
- 終了: `ConsultationAvailability.tsx`。SDKの終了イベントでは `ended` にし、Zoomのアンケート導線と開始ロックを保持する。再読み込みは利用者の戻る操作だけで行う。アンケートの内容・回答はZoomが管理するため、Web側に保存APIやDB項目は追加しない。
- カテゴリー引き継ぎ: SDKロード前に `window.universityConsultation.category` を設定し、終了・初期化失敗時に削除する。URL・Web Storageには保存しない。

## 今回の確認結果（2026-09-13）

- 終了後アンケートを3キューに紐付け。入試相談を担当者側で終了後、リンク表示・別タブ回答・記録完了を確認。管理画面で `Finished`、`Q_Univ_Admissions`、評価5、テストコメントを照合。コメント空欄時も送信可能。
- 学生生活相談でも終了後のアンケート案内を確認。回答せずZoomを退出し、サイトの戻るボタンで3つの相談開始ボタンが有効に戻ることを確認。今回の終了案内はデスクトップで確認。390pxのviewport指定は反映されず、モバイルでの実表示は未確認。
- 公開版3と3キューそれぞれの西川 継延の割り当てを管理画面で確認。
- 3カテゴリーすべてで、再選択なしに対応する `Q_Univ_*` 宛てに着信し、応答後の参加者2名を確認。
- カテゴリーのSDKロード前設定・終了時削除・再起動をテストし、TypeScript・変更対象ESLintが成功。
- 事前入力フォームを1280pxと390pxで確認。必須入力、Escapeでの復帰、Tab循環、入力した「デモ学生」での着信・接続を確認。入力検証とSDK引き渡しのテスト2件、TypeScript、対象ESLintが成功。
- 3キューの待機室割り当てと、利用者側での大学ロゴ・タイトル・案内文の実表示を確認。
- 着信通知と応答後のエンゲージメント詳細の両方で、呼び名 `受付確認デモ`、立場 `受験生`、相談概要 `出願手続きの流れを確認したいです（デモ）`、カテゴリー `admissions` が一致することを確認。応答後の参加者2名も確認。
- カテゴリー未取得時の予備選択経路は公開検証を通過。利用者側での予備画面操作は未確認。
- 以下は初期接続（公開版2）での確認記録。
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
通話開始、担当者着信、受け入れ、音声映像、終了後アンケートの送信・回答記録の確認を分けて報告してください。
未確認項目を成功扱いせず、実装変更は関連テスト・型・lintと同期してください。
```
