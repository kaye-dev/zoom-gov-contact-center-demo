# 共通Developer APIと既定の連絡先グループ

Developer APIの資格情報は`global_developer_api_settings`の`id=global`で全業種に共通です。管理画面は`/admin/developer-api`です。旧tenant queryは同じ設定に到達します。連絡先・グループ・操作履歴の権限は引き続き業種と部署で分離します。

## 既存資格情報の移行

通常のPrisma migrationは新しいテーブルと既定グループ、既存の同意済み登録の所属を追加します。資格情報の採用は別操作です。対象DBと暗号化キーを設定した環境で、まず読み取り専用のpreflightを実行します。

```sh
node --import tsx scripts/migrate-global-developer-api.ts
```

`READY`なら次の明示操作で採用できます。旧設定行は削除しません。

```sh
node --import tsx scripts/migrate-global-developer-api.ts --apply
```

業種別設定が相違する場合は`CONFLICT`とフィールド名だけを返します。採用する一組を決めてから`--source-site lg`または`--source-site univ`を指定します。異なる行の秘密情報を混ぜません。既に共通設定がある場合は`ALREADY_CONFIGURED`となり、上書きしません。移行前の旧設定への暗黙fallbackはありません。本番へのmigration・移行スクリプト実行・デプロイは個別のリリース操作です。

rollbackでは書込みを止め、共通設定の更新と所属・同期結果を保全し、旧版が参照する設定を整合させてから戻します。テーブルdropやZoom連絡先の削除をrollbackに使用しません。

## 登録・同期

大学5項目、自治体4項目と防災無線の合計10グループを用意します。ID未設定でも受付と所属を保存します。大学は申込IDで参照し、職員確認済みCRMへ自動変換しません。自治体の配信有効化・本人確認も従来どおりです。防災無線の公開登録は防災無線だけに所属します。

全権アクセスとオートリーチ更新権限を持つ職員が、既定グループへZoomのキャンペーン用連絡先リストIDを設定します。他業種共有・別の既定項目への重複割当・内部配信用リストは採用できません。通常グループ同士の共有契約は維持します。

詳細はZoomの全ページとローカル所属を合わせて表示します。電話番号の一致だけで同一人物とは判定しません。取得失敗時の全体件数は未確定です。「登録済み」はZoomのみの行、「同期完了」はサイトとの同期が確認できた行です。

個別・一括同期は操作IDと対象versionを永続化し、1回のadvanceで最大20件を処理します。画面を離れた場合は保存済み操作を再開できます。429は待機して再試行し、送信結果不明は自動で新規作成しません。Zoom側のIDと内容を確認して関連付けを照合します。稼働中キャンペーンが使うリストへの同期は保留します。登録・同期・移行はキャンペーンを開始しません。

## 検証

`test/integration/zaad-default-groups-runtime.test.ts`は公開登録、業種境界、ID割当、混在一覧、結果不明、配信中、45件の部分同期を検証します。`zaad-group-members-sync-runtime.test.ts`は通常グループの部署境界、同時同期、外部変更と取得障害を検証します。`developer-api-route-runtime.test.ts`はtenantなし・旧query・認可・暗号化・再表示・同一origin制約を実ルートで検証します。DBテストではworktreeの専用PostgreSQLを指定し、外部Zoomはfixtureで代替します。
