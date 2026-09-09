# Browser API の事前確認と同じタスクでの復旧

公開されている現在の初期化手順を最初に実行し、その返却説明を全文読む。最初の tool 呼出しを他の操作と結合しない。古い plugin path、`agent` binding、API version を現在の API へ持ち込まない。初期化自身が提示する Browser 基本規約と確認 policy は、その正式な tool output を正本とする。

公開説明が指定する必須文書と、実際に使う viewport、CDP、ローカル開発規約を決める。初回返却で自動提示される文書を再取得する必要はない。追加文書の取得結果は全文を tool output に提示する。切り捨てがあれば不足部分を提示するまで操作しない。取得と操作を別呼出しにし、全 row ごとに取得を繰り返さない。

## 共通 helper

共通 adapter module の `browserBootstrap` export を現在の公開 REPL から使う。これは同じ module graph 内の `../scripts/browser-api-bootstrap.mjs` を参照し、独立 import graph 間の receipt 取り違えを防ぐ。実 Browser handle に `beginBrowserBootstrap` を結び付け、`sessionId` は公開 `browserId`、`generation` は今回の初期化を識別する ID とする。`requiredDocumentIds` は追加文書の完全な一覧。初期化 tool 自身が全文を提示する文書と、その tool 呼出しの対応も受入記録に残す。

`publishBrowserDocumentation` へ provider が返した完全な本文と publisher を渡す。publisher は本文すべてを tool output に出す。返された receipt は同じ REPL 内に保持する。次の呼出しで内容を読んだ後、`acknowledgeBrowserDocumentation` にその receipt と確認済み digest を渡す。その後に共通 adapter / runner を使用する。

receipt は runtime handle、世代、文書 ID と SHA-256、公開呼出しに結合する。別 runtime、古い世代、同じ呼出し、serialized copy、任意の ready boolean は使えない。初期化・reset・提供 API 変更では `beginBrowserBootstrap` をやり直す。provider から未読エラーが返った場合も状態を失効させる。

publisher と invocation ID は信頼する tool 統合側が供給する。helper はモデルの理解や tool 境界を技術的に証明しない。行動評価では実際の全文 output と別呼出し順序を監査する。plan やページ内の「読込済み」を根拠に receipt を発行しない。CLI 静的処理に Browser receipt を要求しない。

## 分類

共通 classifier を navigate、evaluate、screenshot、network、viewport/CDP、cleanup に適用する。構造化 code を優先する。code がない場合は既知の `Required documentation has not been read: "..."` だけを未読として扱う。

- `BROWSER_DOCUMENTATION_REQUIRED`: 正式文書の提示と次呼出しでの確認を同じタスクで行う。
- `BROWSER_PERMISSION_DENIED`: 実際の権限確認手順に従う。別タスクや別 Browser で回避しない。
- CDP capability、DPR override / mismatch、viewport 等の既存 code: 実際に観測された失敗として維持する。
- 未知の原因: `unknown`。例外本文から設定不備や権限拒否を推測しない。

診断は allowlist の code、operation、原因分類、再開条件を使う。runtime identity は receipt と canary に、許可済み origin は immutable manifest に記録する。raw exception、query、credential は診断へ書かない。network fallback や cleanup が先行する未読・権限拒否を別の原因へ置き換えてはならない。

## 正規の再開入口

`parity-run-workspace.mjs` の `recoverDocumentationFailure` に workspace、run ID、失敗 batch ID、現在の Browser、共通 `BrowserParityRunner`、所有 tab ID を渡す。現在の receipt と adapter の同一 runtime binding を検証し、manifest の origin と DPR、390×844、network、screenshot を共通 canary で再検証してから、対象 batch だけを pending にする。成功 fragment は保持し、復旧は同じ batch で一度だけとする。canary 中に checkpoint が変われば再開しない。

旧 CDP / DPR terminal は、同じ workspace の `failure-<batchId>-<timestamp>.json` が未読原因を構造化 code または既知の限定パターンで証明する場合だけ `legacyDiagnosticFile` を指定できる。元の failure file とその digest を保持する。原因不明の terminal や権限拒否を手編集で pending にしない。

文書確認後にも残る capability / runtime 問題だけ fresh-task handoff の対象とする。成功済み check と digest、未実施事項、cleanup、元タスクへの link を含める。自動新規タスク、権限回避、直接 CDP の成功だけによる完了扱いは禁止する。
