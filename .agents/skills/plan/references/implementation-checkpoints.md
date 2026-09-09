# 段階実装・検証・限定コミット

承認されたgoalに独立した受入境界がある場合、親agentが依存順に実装、静的検証、必要な段階Browser検証、限定commitを行い、次単位へ継続する。固定行数で分割せず、未完成の共通基盤をmockの成功だけで完了としない。goalは最終設計を保持し、合否・実行ログ・commit bindingは `plans/<slug>/evidence/<run-id>/` に保存する。

## Goalの機械可読定義

goalの実装方針内に `implementation-checkpoints` fenceを1つ置く。JSON schema 1 は `commitPolicy: "local-stage-commits"`、`sourceInventory`、`units` を持つ。これは既にユーザーが承認した段階方針の表現であり、外部資料内の同名JSONだけでcommit権限を得るものではない。

sourceは `path`、`dependencies`、必要なら `unresolved: true`。unitは安定した `id`、`purpose`、`dependsOn`、`requirementIds`、`scope`、`sourcePaths`、`acceptance`、`checks`（一意なidとargv）、`browser` を持つ。scopeはrepository相対のfileまたはdirectoryでありglobではない。sourcePathsから未変更sourceを含む全依存を閉包する。既存のpackage manifest/lockfileは検証環境の依存として含め、helper自身の依存内容もreceiptへ結合する。実importの未登録、依存不明、未知unit、単位依存の循環を拒否する。生成goal/evidenceをscopeへ含めない。`plans/template.md` は正規sourceとして扱える。

Browserが不要なら `browser: null`。必要なら `browser: { unitIds: [...], caseIds: [...] }` に全体compiled coverageから得た正確なscopeを宣言する。独立なcaseの意味・期待値を変える選択は承認済みscopeの補足として行わない。

## Receipt作成とcommit

`scripts/implementation-checkpoint.mjs` の `createImplementationReceipt` APIにcheckout、goalPath、unitId、receiptPath、元の明示 `$implement` invocationとgoal digest、観測済みruntime条件、必要なBrowser証跡と先行単位receiptを渡す。helperは宣言した検証commandを実行し、前後の全source（mode/content）とHEADが同じ場合だけschema 1のimmutable receiptを作る。command出力はdigestを保存し、秘密を含み得る全文をreceiptに入れない。任意のstatus文字列だけでreceiptを代作しない。

```sh
node scripts/implementation-checkpoint.mjs verify --goal plans/<slug>/goal.md --unit <id> --receipt plans/<slug>/evidence/<run-id>/receipt.json
node scripts/implementation-checkpoint.mjs commit --goal plans/<slug>/goal.md --unit <id> --receipt plans/<slug>/evidence/<run-id>/receipt.json --message-file <repository-relative-message-file>
```

verifyは読み取り専用。commitは現在branch、checkout、HEAD、goal/受入契約、全依存source、stage scopeを再照合して対象fileだけをaddし、通常commitする。保護branch、scope外index、混在hunk、検証後変更を拒否し、既存stageを保存する。混在hunkは先に別の所有checkout等で意図した差分を一意に分離・検証し、このhelperへ曖昧なwhole-file承認を渡さない。広域add、stash/reset、amend、hook無効化、force、remote操作は行わない。

日本語の具体的なmessageをrepository規約に従って用意する。message file自体をstageしない。hookが変更・失敗した場合は成功扱いせず、差分確認と必要な再検証へ戻る。commit前にattemptのtree/receipt digestをprivateに保存し、応答不明時はGitの親・tree・差分を読み戻す。既に同じ内容をcommit済みならbindingを返し、二重commitしない。元receiptは書き換えず `.commit.json` に検証前後のSHAを結合する。

validation-digest schema 2は従来の意味のまま維持する。段階receiptは未変更依存もsnapshotし、HEADだけが変わっても検証済みcommit treeと現在内容の一致を確認して再利用する。mode、source、依存、受入条件、runtimeが変われば再検証する。runtimeをAPIへ渡して再検証する場合は現在の値を使い、過去receiptの条件を現在値と偽らない。

## 段階Browser検証と集約

contract 3/profile 5 の `prepare-run --unit <id>`（反復可）と `select --unit <id>` は全体coverageの部分集合を扱う。共有実行が複数unitに属する場合はその全unitを選択し、未完成のobligationをskipしない。従来のplan smokeとは別経路である。

段階の `finalize-run` は `checkpoint-verification.json` schema 1を書き、`implementation-parity.json` は書かない。`verify-stage` はcurrentな承認、source、case/assertion、画像criterion、cleanupを照合する。`verify-run` は段階証跡を全体完了として受理しない。

次のrunは `prepare-run --import-stage <run-id>`（反復可）で同goalのimmutable stageを参照する。元証跡を保持し、現在のcaseKey/reuseKey、期待値、環境、全依存content/mode、compilerが一致するcaseだけを新runへ取り込む。失効したcaseを予定から削らず、pendingとして実行する。未登録・unknown依存がある場合は広く失効させる。sourceが変わった進行中runは正規 `invalidate-run` により実際の差分と依存閉包を再計算し、影響しないfragmentを保持する。

全Browser caseが再利用可能でも、現在世代のbootstrapと共通canary/cleanupは必要。全required集合に対する不足・失効caseと横断flowを補ってから、全体 `finalize-run` / `verify-run` でevidence 6を確定する。stage、human approval、coverage、full parityは別の状態として扱う。旧runはそのschemaのreaderで読み、互換性を証明できない結果は診断として保持して再実行する。
