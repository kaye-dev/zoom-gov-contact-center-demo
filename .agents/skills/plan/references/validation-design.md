## 適用状態・画像・再利用の設計

> Historical reference only. This document describes stored detailed-parity tooling and records. Plan, implement, review, and shipping use the smoke contract in `workflow-verification-contract.md`; do not execute or require the procedures below for feature work.

- contract v2のcoverageは、各画面の全stateを`viewportOrder[0]`・`themeOrder[0]`で確認し、最初のstateを全viewport × themeで確認する。関連する状態・表示の交互作用はrisk/anchor/fidelity groupへ明示する。v1の選択手順は保持する。
- 業務因子と表示因子を目的ごとに定義する。因子が2つなら全2因子の積であり、多因子の検査を一律pairwiseへ弱める根拠にはしない。保存・再読込・権限・境界・未保存・競合・失敗時の入力保持・二重実行を要件へ対応付ける。
- screenshotはvisual checkまたは画像を必要とするrisk/anchorのrowに限る。assertion・期待値・失敗状態を画像削減と一緒に削除しない。
- source inventoryは実際のentry/layout/APIとimport依存を列挙し、target/sharedのconsumerを証明する。共有基盤・未解決の依存は全対象へ倒す。
- 旧runは不変とする。`parity-evidence-equivalence.mjs`で条件・assertionの同値性と依存sourceの現在性を評価する。新しく発見した依存の旧fingerprint欠落は再実行理由であり、未変更と推測しない。source qualificationだけではimportできない。合格候補がある場合もfixture/auth・artifact・必要assertionの完全性と公開readerで検証可能な由来を確認してから別runへ取り込む。候補が0件ならその拒否理由を記録し、再実行する。
