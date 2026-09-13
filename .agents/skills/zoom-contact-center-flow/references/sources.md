# 仕様の出典と対応範囲

確認日: 2026-09-13。以下は入口となる参照先。実行時は対象機能の変更可能性と確認コストに応じて必要部分を再確認する。

## Zoomの参照優先順位

1. **正式仕様の根拠**: support.zoom.com / developers.zoom.us / library.zoom.com / www.zoom.com
2. **用途限定の公式情報**: marketplace.zoom.us / zoom.us / www.zoom.us / status.zoom.us / zoomstatus.com
3. **参考情報**: community.zoom.com

Marketplaceは連携機能、statusは障害、communityは事例の参考として使い、正式なJSON仕様や全アカウントでの提供条件の根拠に置き換えない。

| 出典 | 確認した内容 | 適用範囲 |
| --- | --- | --- |
| [Exporting or importing a flow](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058787) | JSONによるエクスポート／取り込み、JSON手編集はサポート対象外 | フローの入出力。JSON全スキーマや取り込み成功を保証しない |
| [Adding or duplicating a flow](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059511) | Voice / Video / Messaging / Email / Work Item、複製時のエントリポイント除外 | チャネルと作成操作。数値の内部識別値の根拠ではない |
| [Amazon Connect flow best practices](https://docs.aws.amazon.com/connect/latest/adminguide/bp-contact-flows.html) | 小さな業務単位のモジュール化とエラー出口の処理 | 一般設計の参考。Zoom固有仕様には用いない |
| [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills#how-chatgpt-and-codex-use-skills) | 明示呼び出しとdescriptionによる自動選択 | スキルの発見・起動 |

## 同梱アダプターの実際の検証範囲

`voice-export-profile.json` はユーザー提供の音声エクスポートを観測して作った**限定的なローカル形式プロファイル**で、Zoom公式スキーマではない。ソースの業務文面・フロー名・実リソースIDを含めない。元の構造を匿名化したテストは `scripts/tests/fixtures/branching.json` に置く。このファイルはインポート用ひな形ではない。

| チャネル | 同梱の実データ由来形式確認 | 利用する際の扱い |
| --- | --- | --- |
| 音声 | studioType=0, studioScope=0。Start、SendMedia、CollectInputのivrMenu、RouteToのEnQueue/Disconnect | この部分集合のエクスポートを検査・生成できる。その他のウィジェットは資料／エクスポートを追加 |
| ビデオ | 未取得 | 対象チャネルのエクスポートと出典付きプロファイルを取得 |
| メッセージング | 未取得 | サブチャネルも特定し、同じMessagingという理由だけで形式を流用しない |
| メール | 未取得 | メール固有の案内・入力・接続仕様を確認 |
| Work Item | 未取得 | 開始・終了、キュー、外部APIとの関係を確認 |

Web／アプリ内チャット、SMS、Facebook Messenger、WhatsApp、Instagram、Zoom Chatなども設計対象。その他の連携チャネルを指定された場合も、現行公式情報と当該環境の提供条件を調査してから扱う。ここに列挙がないことを非対応の根拠にしない。

内部IDの所有範囲はウィジェット、出口、観測されたメディア項目のIDだけを明示する。メディア項目IDの所有範囲と表示寸法はローカルアダプターの観測に基づく仮定であり、Zoomでの取り込み・表示は未確認。外部IDは別のパス一覧で保持する。新しいIDフィールドを見つけたら分類を確認する。

名前20文字は同梱プロファイルの保守的な命名方針、1000ノードはCLIのローカル処理予算である。Zoom全体のサービス上限として説明しない。確認済みの上限がある場合のみ出典付きでprofileのverified_max_nodesへ設定する。
