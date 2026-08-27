# <計画名>

## メタデータ

- template_version: 2
- plan_id: <英小文字・数字・ハイフン>
- plan_version: 1
- 作成日: YYYY-MM-DD
- base_commit: <Git commit SHA>
- status: draft
- UI変更有無: UI変更なし
- 計画モデル: gpt-5.6-sol / xhigh
- plan承認記録: 未承認
- UI承認記録: UI変更なし

## 目的と完了条件

この変更の目的、利用者、完了時に確認できる結果を日本語で記載する。

## 現状と根拠

関連する実装、runtime、既存UI、repo規約、参照した一次資料を記載する。推測と確認済み事実を分ける。

## 対象範囲

変更する機能、ファイル、運用を記載する。

## 対象外

変更しない機能、外部サービス、本番操作を記載する。

## 確定した設計

採用する設計、理由、互換性、エラー時の振る舞いを記載する。

## UI契約

UI変更なし。UI変更がある場合は、対象画面と次を記載し、`plans/tmp/<plan-id>/prototype/`の承認記録を残す。

- production baseline: 比較した実画面URL、runtime owner、checkout、commit、関連するshell・component・style・tokenのpath
- comparison conditions: 実画面とprototypeがそれぞれ報告したviewport、devicePixelRatio、scrollX・scrollY、locale、theme、fixture、query state。指定値でなく両画面の実測値を記録する
- baseline state inventory: 影響画面の既存interactionをsourceと実操作から列挙し、rendered、removed、hidden、disabled、inert、active element、entry、exitを記録する
- styling pipeline: 本番と同じTailwind CSS utilityとapp/globals.cssを使用したこと。手書きCSSがある場合は事前のユーザー承認記録と例外理由
- 視覚的不変条件: brand、navigation、layout、DOMの親子関係、grid・flex、typography、color、control、icon、focus、disabled、responsive behaviorのうち既存UIから維持するもの
- 意図した差分: explicitな要件IDに基づき既存UIから変更する箇所と理由。要件に紐付かない差分は失敗として扱う
- stateとinteraction: baseline既存stateと新規normal、empty、loading、error、disabled、saving、conflictの適用範囲、keyboard、focus
- parity evidence: 条件を揃えた同一stateのscreenshot pair、unchanged regionのbounding rect・computed style・DOM・a11y比較、overflow、console、network、未解消差分
- production UI正本: 承認済みprototypeを実装後の完成UI契約とし、実装時に未承認の構造・文言・component・responsive・interaction変更を行わないこと
- parity matrix: 影響するroute・overlay・baseline state・新規stateごとのentry point、両画面の実測条件、screenshot、unchanged region、意図した差分ID、desktop、390×844、keyboard・focus、未決事項
- approval semantics: Browserと自動検証はmachine parityの証拠でありUI承認ではない。ユーザーがrendered prototypeを明示承認するまでUI承認記録とG02を未承認にする

## インターフェースとデータフロー

入力、出力、型、永続化、権限境界、エラー処理を記載する。

## 並列実装計画

| 並列グループ | タスクID | 実装内容 | 担当agent/model | write_set | 実行環境 | 依存タスク | 完了条件 | 検証 |
|---|---|---|---|---|---|---|---|---|
| P1 | T01 | <実装内容> | implementer / gpt-5.6-terra / high | <変更対象パス> | shared | なし | <完了条件> | <検証> |

読み取り・調査・レビューは可能な限り並列化する。書き込みtaskを並列化する場合だけtask専用Git worktreeを使用し、shared worktree上の書き込み、schema、migration、lockfile、共通設定、同一ファイルの変更は直列化する。仕様判断を伴わない限定taskだけ`mechanical_worker / gpt-5.6-luna / medium`へ委譲する。

task表のセル内ではpipe文字、escaped pipe、複数行を使わず、識別子・path・検証はカンマ区切りで記載する。

## 進捗管理

### 実装タスク

- [ ] T01: <タスク名> — 完了条件: <条件> — 検証: 未実施

### ゲート

- [ ] G01: plan内容の確認・承認完了
- [ ] G02: UI prototypeの承認完了、または「UI変更なし」を確認
- [ ] G03: 実装コードと自動検証完了
- [ ] G04: 二段階HTMLレビュー完了、または非該当理由確認
- [ ] G05: 必要な実画面・動作確認と承認済みprototypeとのparity確認完了
- [ ] G06: commit・push・PR反映確認完了

## 実行記録

実行したtask、検証コマンドと結果、修正内容、未完了項目を日本語で追記する。秘密情報、生ログ、環境変数値は記録しない。

## 検証計画

変更内容に応じたlint、typecheck、test、build、実画面確認、HTMLレビューを記載する。

## リスクとロールバック

主なリスク、失敗時の戻し方、外部権限が必要な操作、停止条件を記載する。

## 前提と未決事項

未決事項がない場合は`なし`と記載する。高影響の未決事項が残る間は実装へ進まない。
