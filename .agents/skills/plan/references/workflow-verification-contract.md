# 機能別検証・段階実装の共通契約

新規UI計画は `ui-contract.json` version 3 / `parity-spec.json` version 5を使う。原要件bundleから適用状態、層別obligation、visual family、因子・制約・次数・回帰seed、観測時点を定義する。画面・状態・境界値・locale・代表条件は各goalの入力とsourceから解決し、共通処理へ製品固有値を固定しない。異なる機能のstateを全画面へ直積展開しない。同条件・同時点の実行共有でも元の全assertionを維持する。

再開時も修復・自動整理の前に共通 `parity-runner.mjs estimate` で入力時点の費用を記録する。不足obligationの復元や自動整理を行った後は再estimateし、Browser起動前にpreflightを実行する。全source global、全行画像、過大な因子展開は依存関係と能力の証明に基づき整理し、再estimateする。費用だけを理由にREQ、risk、境界、consumer接続、期待値を削らない。承認時からの費用増加や必要な大型unitは共通budget判定と理由付きoverrideで扱う。代表hostの成功だけで全consumerを合格にせず、SSRを実Browserのfocus/layout/eventへ代用しない。画像共有は条件・phase・時点が一致する原観点だけとし、全指定観点をCodexが確認する。

採用goalが段階commitを明記する場合、単位の目的・依存・scope・静的check・Browser obligation・完了条件を定義し、各単位の検証、内容binding、限定local commitを終えて次へ継続する。新たなpush/PR/merge承認にはならない。詳細は `.agents/skills/plan/references/implementation-checkpoints.md`。段階receiptは全体完了ではない。current sourceに対する不足・失効結果を埋め、全REQ・risk・境界・実操作・目視・cleanupを再計算したschema 6 `implementation-parity.json`を公開 `verify-run` で検証する。契約1/2・profile1〜4・evidence1〜5は従来のreaderで検証し、暗黙変換しない。

採用目的・外部期待結果・権限・データ正本・API/DB互換性・検証水準を保つscope内の不具合修正は、理由・影響・対象再検証を記録して継続する。goalを進捗記録にしない。説明補足の自動承認継承は `scripts/goal-clarification.mjs` が機械的に証明できる既存要件の逐語引用だけとし、元のinvocationがこの方針を承認している場合に限る。前後全文・digest・差分・分類・不変契約を容量上限付きの追加証跡へ保存し、元approval/manifestを変更しない。新規文章の意味同一性、仕様・権限・受入水準の変更は自動継承せず依存作業を止める。
