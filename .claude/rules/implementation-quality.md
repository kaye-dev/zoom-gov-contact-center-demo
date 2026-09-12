# 実装時のCI整合性

`$implement`と直接の修正依頼に適用する。変更に連動する登録・期待値・環境依存を実装中に解決し、commit・push時に検証を追加しない。対象外の全テスト整理やCI基盤の改修へ広げない。

## 変更に連動する箇所を先に特定する

- 編集前に変更する識別子・旧文言・CSSクラス・migration名・CLIの出力や設定値を`rg`で検索し、実装と、それを参照するtest・fixture・文書を読む。`package.json`と`.github/workflows/deploy-runner-quality.yml`で、変更がどの検証に含まれるか確認する。
- `Deploy runner quality`はDocker内でアプリ・開発ツールの`npm test`、typecheck、migrationのDB検証、runtime依存のauditを行う。対象機能のテストだけでなく、変更値を固定している別領域のテストも影響範囲に含める。
- 実装と関連する期待値・登録・文書を同じ変更単位で更新する。最新指示による意図した変更と回帰を区別し、CI通過だけを理由に旧仕様へ戻したり、検証を削除・skip・無条件成功にしたりしない。

## Migrationを追加・変更する場合

- `prisma/schema.prisma`、新規`prisma/migrations/*/migration.sql`と、次の登録・検証を照合する。名前、順序、SQLのSHA-256、分類、適用可能な履歴の範囲を揃える。
  - `scripts/deploy/migrations.manifest.json`
  - `scripts/deploy/lib/reviewed-migrations.ts`の厳密な承認済みchain
  - `scripts/deploy/test/direct-production.test.ts`と`reviewed-migrations.test.ts`
  - `test/zaad-migration.test.ts`など、履歴の末尾・件数・`slice`・indexを固定するテスト
- 上記だけで完結すると仮定せず、直前のmigration名やchainの識別子で他の参照も探す。manifestだけを更新して完了としない。SQL変更がschemaへ反映されていること、既存DBへの適用条件を実装中に確認する。
- 適用済みSQLとそのhashは保全し、必要な変更は新しいmigrationにする。分類はSQLの実際の影響から判断し、破壊的変更を通すために`expand-compatible`へ変えたり、承認済み履歴の照合を緩めたりしない。

## UI・文書・開発ワークフローを変更する場合

- ナビ順序、アイコン、件数表示、タブ配置、フォーム構造、共通tokenを変更したら、旧値を要求するソース検査・SSRテスト・snapshot・fixture・設計文書を同じ実装内で追従させる。軽微な直接修正にも適用する。
- 期待値を変える前に最新要求との一致を確かめ、保存・権限・アクセシビリティ・エラー表示など維持する振る舞いの検証を残す。新規・修正テストでは、振る舞いを検証できる場合はソースの書式、内部アイコン名、クラスの並びへの依存を避ける。視覚仕様そのものが要件なら、その条件を明示して検証する。
- CSS snapshotは差分のtoken・global styleと影響する表示を確認してから更新する。hashの置換だけで互換性を確認したことにしない。UI確認は既存の代表1〜3シナリオのsmoke内で行う。
- skill・手順・CLI・評価シナリオを変更したら、現行の参照先、登録一覧、fixture、文書契約テストも照合する。廃止した手順の固定文言を残さず、過去のgoal・証跡は元のまま保全する。行数制限がある場合は重複を整理し、通過目的で上限だけを増やさない。

## Docker・OS・プロセス・依存パッケージを変更する場合

- CIで動くコードが外部コマンドを使う場合、`Dockerfile.deploy`の導入内容と関連するDocker契約テストも照合する。macOSにある`lsof`等をコンテナにもあると仮定しない。Linuxでのコマンド出力、PID/cwd確認、権限、Nodeの型・環境変数、`--network none`の制約を考慮する。
- プロセステストは起動完了やsignal handler準備を観測してから操作し、固定sleepや実行速度に依存させない。終了codeとsignalを区別し、仕様で許された終了だけを受理する。所有権確認と他processを保全する条件は維持する。
- 依存更新は`package.json`とlockfileを揃え、既知のaudit指摘に対応する場合は修正版と互換性を確認する。通信の503と脆弱性検出を区別し、後者をretryで解決扱いにしたりauditを無効化したりしない。将来の脆弱性公開や外部障害は実装だけでは防げない。

## 検証する時点と引継ぎ

- 実装中・実装完了時に変更の影響するtestと適用lint/typecheckを行う。全suite・build・DockerでのCI再現・DB検証は具体的な変更理由がある場合だけ選ぶ。毎回のフルCI再現や環境構築を必須にしない。
- 失敗時は最初の原因と連鎖する失敗を切り分け、関連箇所をまとめて修正し、影響する検証だけを再実行する。未解決の同じ失敗を残したまま実装完了としない。
- 完了報告には整合させた関連箇所、実行した検証と結果、未実施・既知の失敗を簡潔に記す。報告のための新しい台帳や証跡ファイルは不要。
- commit・push・PR操作では実装時の結果を再利用し、独立したローカルtest/lint/typecheck/build/audit・DB検証・DockerでのCI再現を自動実行しない。未実施は未実施と記載する。既存hookと軽量なdiff/index/Git状態の確認は維持し、CI待ちを追加しない。既知の必須check失敗は隠さず、検証を伴う修正が必要なら原因と対応案を報告し、明示の修正・検証依頼で再開する。
