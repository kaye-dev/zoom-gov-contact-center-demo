# 連絡先グループの同期

大学・自治体の「連絡先グループ」では、右上の「同期」からZoomのキャンペーン用連絡先リストを取得し、複数選択で追加する。全権アクセスとZAAD更新権限が必要。候補の全ページ取得後に最大100件を追加できる。現在の業種に追加済みのリストは選択不可で、他業種に追加済みの通常リストは選択できる。

リスト名・最終更新日・連絡先数を表示する。更新日はZoomの応答に含まれないことがあり、その場合は「—」を表示する。アプリ側の登録時刻をZoomの更新日として代用しない。

同期はリストと業種の関連付けのみを保存する。Zoomのリストを新規作成せず、所属ユーザーをZAADの連絡先へ自動登録しない。部署は未指定で、既存の部署制限は維持する。部署が必要な操作はグループ編集で部署を指定してから行う。

## 共有と追加解除

同じZoomアカウントの同じ連絡先リストを、大学と自治体の両方へ追加できる。名前・連絡先の編集はZoom上の同一リストへ反映される。グループの「追加解除」は現在の業種の紐付けを無効化するだけで、Zoomのリスト、他業種の紐付け、CRMの人・membershipを削除しない。再追加では同じbinding IDを復帰する。

連絡先自体の削除はZoom上のリストに反映され、同じリストを利用する他業種にも影響する。ZAADの人物レコードは削除しない。

## API

すべて `/api/admin/zaad` 配下で `tenant=lg|univ` を明示する。

- `GET contact-lists/sync-candidates?cursor=...`: accountId、候補のitems（added/selectableを含む）、nextCursorを返す。
- `POST contact-lists/sync-bindings`: operationKey、選択時のaccountId、contactListIds（1〜100件）を受け、DBトランザクションで追加する。異なるアカウント、変更されたID、内部配信用リソースを拒否する。
- `GET contact-lists/sync-operations/:operationKey`: 操作者・業種に限定して操作結果を返す。通信途絶後は同じキーで確認・再送し、二重登録を防ぐ。
- `DELETE contact-lists/:id`: operationKey、versionを受けて現在の業種から追加解除する。Zoom DELETEは呼ばない。

## マイグレーション

`20260909130000_shared_contact_list_bindings`は既存データを変更せず、accountId/resourceType/zoomId/ownerSiteKeyの一意制約と、CONTACT_LIST以外のアカウント全体の部分一意制約を作成する。部分インデックスはmigration SQLで管理し、Prisma schemaとの整合と他リソースの重複拒否をDBテストで検証する。

共有行が存在する状態で旧制約に戻すことはできない。rollbackでは行を自動削除せず、共有の解消方針を確定してから制約を戻す。Productionへのmigrationとデプロイは別途実施する。

既存インデックスの置換を伴うため、デプロイ用manifestでは`destructive-reviewed`に分類する。通常デプロイによる自動適用の対象にはせず、Production適用時は別途レビューする。
