# 予約API発信者番号所有者照合

## 目的と適用範囲

公開音声Agentの発信者番号（ANI）を、デモ予約を作成した通話と後続の取得、変更、取消を結び付けるために使用します。利用者は予約IDを提示し、APIは同じAPIキーと同じANIで作成された予約だけを操作可能にします。

ANIは発信者番号の継続性を区切るデモ用の境界です。発信者本人であることを強く証明する仕組みではありません。電話番号の表示、再割当て、共有電話などのリスクがあるため、本番の行政手続きではOTPなどの追加認証を設計します。

## 契約

### Zoom Tool Template

次の4件だけに、同じヘッダーを設定します。

| Tool Template | HTTP | 設定 |
| --- | --- | --- |
| `mirai_reservation_create` | `POST /api/public/v1/reservations` | `X-Reservation-Caller-Phone`を`From Variable`の`global_system.Engagement.ANI`から渡す |
| `mirai_reservation_get` | `GET /api/public/v1/reservations/{id}` | 同上 |
| `mirai_reservation_replace` | `PUT /api/public/v1/reservations/{id}` | 同上 |
| `mirai_reservation_delete` | `DELETE /api/public/v1/reservations/{id}` | 同上 |

サービス一覧と空き枠取得は発信者に依存しないため、ヘッダーを追加しません。予約一覧はAPIキー管理用で、発信者単位に分離されていないためSkillとAgentへ追加しません。

Zoom公式のTool作成記事は同じ発信者番号変数を`global.system.engagement.ani`と表記しますが、2026年9月1日の変数ピッカーと保存後の実画面では`global_system.Engagement.ANI`でした。設定時は変数名を手入力せず、ピッカーから実画面の値を選びます。

`mirai_reservation_update_partial`は、GET非200分岐とGET・PUT両方へのANI伝播を安全に実装し、保存後の読み戻しと再Debugが完了するまで使用しません。一部項目だけを変更する場合も、詳細取得、変更先の空き枠確認、完全更新の順で行います。

### 予約API

- `X-Reservation-Caller-Phone`は`+`、国番号、8〜15桁の数字からなるstrict E.164だけを受け付けます。
- 欠落は`400 RESERVATION_CALLER_PHONE_REQUIRED`、形式不正は`400 RESERVATION_CALLER_PHONE_INVALID`です。
- APIはAPIキーを鍵に、正規化済みANIをHMAC-SHA-256のdigestへ変換します。予約レコードへ保存するのはdigestだけです。
- raw番号をデータベース、予約APIリクエストログ、レスポンス、エラー詳細、`externalReferenceId`へ保存しません。
- 予約作成時はANI digestを所有者情報として保存し、冪等性のrequest digestにも含めます。別ANIが同じ`Idempotency-Key`を使用して、他の発信者の作成結果を再生できないようにします。
- 詳細取得、完全更新、部分更新、削除は、予約ID、APIキー、ANI digestがすべて一致した場合だけ処理します。
- 存在しない予約、別ANI、所有者digestがない移行前の予約は、いずれも`404 RESERVATION_API_NOT_FOUND`として扱います。どの条件が不一致かは利用者へ返しません。
- APIキーをローテーションすると、現行仕様では新しいキーから旧キー配下の予約へアクセスできません。ローテーション前に影響するデモ予約を削除し、新しいキーで再作成します。

ANIを氏名、住所、生年月日、行政IDと結合しません。Agentは発信者番号を尋ねず、復唱せず、会話要約へ出力しません。

## 公開までの設定順

1. データベース移行とANI所有者照合を含むバックエンドをProductionへ反映します。
2. ProductionのOpenAPIまたは契約テストで、ヘッダーの必須条件、strict E.164、same-owner、wrong-owner、legacy reservationの結果を確認します。
3. Zoom AI Studioで4件のTool Templateを開き、`X-Reservation-Caller-Phone`を`From Variable` → `global_system.Engagement.ANI`として設定します。変数ピッカーから選び、`Collect via LLM`、手入力、手動固定値は使用しません。
4. 4件を保存後に開き直し、Production URL、Authorization、ANI変数、入力、出力が保持されていることを確認します。
5. 管理者が管理する2つのE.164テストANIを使い、同一ANIの作成、取得、完全更新、削除と、別ANIの取得、完全更新、削除が状態を変えない404になることをDebugまたはAPI契約テストで確認します。Tool Debugのために保存済みの`From Variable` mappingを手動値へ変更しません。実利用者の番号をテストケース名、文書、スクリーンショット、チャットへ記録しません。
6. Previewでは`Start test with variables`から、画面に表示される`global_system.Engagement.ANI`へテスト値を明示設定します。Previewの値は管理者が注入した値であり、実通話の自動連携を証明しません。
7. Skill Library版とAgentローカル版へ6件のツールだけを追加し、公開禁止の旧指示を[音声ボット作成](./02_音声ボット作成.md)の範囲指定へ置き換えます。Tool Template更新後のAgentローカル版は、旧4件を外した中間状態を保存し、開き直して最新4件を再追加します。同名の旧コピーと新コピーを一度に保存しません。
8. 公開音声チャネルで実通話し、同一ANIの作成、取得、変更、取消と、別ANIの非開示拒否を確認します。
9. Analytics、会話記録、APIログを照合し、raw ANIがアプリ側ログとAPIレスポンスに残らず、ツール順と判定が一致することを確認します。Zoomの文字起こしやエクスポートにはraw ANIが含まれ得るため、共有前にマスクし、閲覧権限と保持期間を必要最小限にします。Skill Library版、Agentローカル版、Agent guidanceを開き直してからAgentを再Publishし、公開完了とします。

バックエンドより先にZoom側の公開禁止指示を外しません。4件のうち1件でもANIヘッダー設定が欠ける場合は公開せず、read-onlyのサービス一覧と空き枠取得だけに戻します。

## 障害対応runbook

### 症状

2026年9月1日の2件の実通話では、次の状態を確認しました。文字起こしは参考データとして扱います。Zoomが出力する文字起こしの発話者ラベルなどにはraw ANIが含まれ得るため、共有、Git保存、障害票への添付にはマスク済みの写しだけを使い、文書や調査メモへ転記しません。APIとデータベースでraw ANIを保存しない設計は、Zoom側の管理データに個人情報が存在しないことを意味しません。

- マイナンバーカード更新では、サービス一覧と空き枠取得まで成功した後、Agentが「このチャンネルでは予約の確定操作はできない」と案内し、作成ツールを呼びませんでした。
- 粗大ごみでは、FAQに沿って品目、大きさ、数量、排出場所を確認した後、Agentが予約確定できないと案内し、予約ツールを呼びませんでした。

どちらもAPIエラーによる失敗ではなく、Agent guidance、予約Skill、粗大ごみFAQに残っていた公開チャネルと`bulky-waste`の予約操作禁止が主因です。ANI所有者照合を実装する前の安全停止としては意図どおりでしたが、新しい公開デモ要件とは一致しません。

### 確認順

1. Analyticsで対象engagementのチャネル、使用Skill、実行Tool、終了理由を確認します。文字起こしだけでTool実行の有無を断定しません。
2. Agent guidanceの全般指示と予約対応節を開き、「公開チャネルでは予約操作しない」「予約確定を表現しない」「bulky-wasteは空き案内だけ」が残っていないか確認します。
3. `未来市の予約案内・予約管理`のSkill Library版とAgentローカル版を別々に開き、指示、6件のツール参照、`Active`状態を確認します。Agentローカル版の同名ツールはTemplate更新で自動同期されないため、最新4件を再追加した証拠も確認します。
4. 作成、詳細取得、完全更新、削除の各Tool TemplateとAgentローカルコピーを開き、`X-Reservation-Caller-Phone`、`From Variable`、`global_system.Engagement.ANI`を1件ずつ読み戻します。
5. Productionのデプロイとデータベース移行を確認し、欠落・不正ANIが400、別ANI・legacy reservationが詳細なしの404になることをAPI契約で確認します。
6. Tool Debugで同一ANIの正常系、別ANI、欠落、形式不正を確認します。Debug結果に実番号が表示される可能性があるため、管理されたテストANIだけを使用します。
7. Previewの`Start test with variables`で会話とツール順を確認します。その後に公開音声チャネルの実通話で、ZoomがANIを自動連携することを確認します。
8. Analytics、Agent発話、APIの`requestId`を照合します。文字起こしやエクスポートは共有前にraw ANIをマスクし、調査メモへ転記しません。

### 判定方法

| 観測結果 | 判定 | 対応 |
| --- | --- | --- |
| 空き枠案内後に作成Toolが呼ばれず、公開禁止文を発話 | guidanceまたはSkillの旧禁止指示 | 旧禁止を範囲指定へ置換し、保存後に読み戻す |
| 粗大ごみだけ作成Toolが呼ばれない | SkillまたはFAQの`bulky-waste`禁止 | 日付だけのデモ予約を許可し、行政上の申込み完了との区別を残す |
| `RESERVATION_CALLER_PHONE_REQUIRED` | ANIヘッダー欠落または非通知 | 4件の変数mappingを確認する。発話で番号を補完しない |
| `RESERVATION_CALLER_PHONE_INVALID` | ANIがstrict E.164でない | Zoomから渡る値とヘッダー設定を確認する。Agentで整形、推測しない |
| 同一ANIでも404 | 別APIキー、移行前予約、digest不一致、対象外予約 | デプロイ、APIキー、予約作成時刻、所有者digestの有無を管理側で確認する。利用者へ理由を分けて説明しない |
| 別ANIで予約内容が返る | 所有者照合が未適用または該当Toolのヘッダー欠落 | 即時に公開版をread-onlyへ戻し、バックエンドと4件の設定を修正する |
| Previewは成功し実通話だけ失敗 | Previewへ手動設定した変数と実通話ANIの差 | 実通話のチャネル連携とsystem variableを確認する |
| 変更依頼で部分更新Toolが呼ばれる | SkillまたはAgentに未確認Toolが残存 | 同Toolを外し、GET、availability、replaceへ戻す |

### 再発防止

- バックエンド移行、4件のANI mapping、Skill、Agent guidance、粗大ごみFAQ、実通話を一つの公開チェックリストとして管理します。
- Tool Template、Skill Library版、Agentローカルコピーは保存直後だけでなく開き直して値を確認し、4件のうち設定済み件数をそれぞれ記録します。保存ボタンがフォーカスされたことだけを成功証拠にしません。
- AgentとSkillのツールinventoryを監査し、予約一覧と部分更新が0件、公開用6件が各1件であることを確認します。
- same-owner、wrong-owner、missing、invalid、legacyをAPI契約テストの固定ケースにします。wrong-ownerとlegacyの外部応答は404で統一します。
- Debug、Preview、実通話を別の証拠として記録し、Preview成功だけで公開可と判定しません。
- raw ANIをアプリ側ログ、レスポンス、文書、テストfixture、`externalReferenceId`へ残しません。Zoomの文字起こし、Analytics、Debug、エクスポートにはraw ANIが含まれ得るため、共有前にマスクし、閲覧権限と保持期間を必要最小限にします。
- 本番の行政予約へ展開する場合は、ANI一致だけを本人確認とせず、OTPなどの追加認証、番号変更・再割当て時の復旧、監査、保持期間を別途設計します。

## Agentの非開示応答

別ANI、非通知、形式不正、所有者情報のない旧予約、存在しない予約は、次の同じ案内へ寄せます。

```text
この通話では、その予約を確認できません。予約IDをご確認のうえ、必要な場合は未来市の正式な問い合わせ先へご連絡ください。
```

「別の電話番号です」「旧予約です」「予約は存在します」のように、予約の存在や照合条件を推測できる説明をしません。

## 参考情報

- [予約APIツールテンプレート作成](./04_予約APIツールテンプレート作成.md)
- [音声ボット作成](./02_音声ボット作成.md)
- [予約デモのトーク例](./05_予約デモトーク例.md)
- [Creating Zoom Virtual Agent tools](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0081099)
- [Testing a voice or chat agent in Zoom Virtual Agent](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0081098)
- [Managing global custom and system variables for Zoom Virtual Agent](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058251)
- [Using the Profile tab for Zoom Contact Center](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059477)
- [Redacting personal data in Zoom Contact Center](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0073940)
- [Changing data retention settings for Zoom Contact Center](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058770)
- [Erasing consumer information from Zoom Contact Center](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058446)
