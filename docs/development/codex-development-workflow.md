# Codex計画・実装・HTMLレビューワークフロー

## 目的

大きな変更を、`plan作成 → 実装 → 解説付きHTMLレビュー → 修正・動作確認 → commit / PR`の順でCodex内に閉じて進める。これはCodex組み込みPlan Modeの代替runtimeではなく、Markdown planと明示呼び出しskillを使う軽量なrepo運用である。

## 標準フロー

1. `$implementation-planner`で`plans/template.md`を複製し、`plans/tmp/<plan-id>/draft.md`を日本語で作る。UI変更時は同じdirectoryに静的HTML prototypeも作り、既存実画面とのproduction parityを確認する。prototypeはwireframeではなく実装後の完成UI契約であり、mockにしてよいのはdata、永続化、backend side effectだけとする。
2. 必要ならfreshな`$plan-critic`で計画を指摘し、採用する判断を確定する。
3. `$final-plan-rewriter`で議論経緯を除いた`final.md`を作り、ユーザーがplanとprototypeを確認する。UI承認は影響するroute・overlay・stateのparity matrixがdesktop、390×844、keyboard、focusまで完了し、実装者へ残す画面設計判断がない場合だけ記録する。
4. `$implementation-executor plans/tmp/<plan-id>/final.md`で実装する。Terraを統合担当、Lunaを仕様判断のない限定taskに使う。
5. 差分が大きい、または変更意図をファイル順では理解しにくい場合だけ、`$implementation-review`を明示実行する。
6. HTML上のLLM指摘と人間コメントをまとめて元taskへ戻し、修正と自動検証・実画面確認を行う。
7. shippingが明示されている場合、planを漏れ確認に使いつつcommit文面はstaged diffと実行済み検証だけから作る。commit・push・PRの読み戻し後も一時成果物は既定で保持し、現在の依頼でcleanupまで明示された場合だけexact `plans/tmp/<plan-id>/`を削除する。

plan-driven HTML reviewでは、remote baseの同期をfinal plan base確定とreviewより前に行い、その時点のremote base ref/OIDを構造化したreview証拠へ記録する。実行済みvalidationとremote-base証拠はplan適合reviewの入力hashへ含め、review後の成功追記や差し替えを拒否する。Browser確認はplanのlifecycle証拠として別に記録する。review開始後はreviewed HEADとその単一shipping commitをrebase/mergeで変更しない。その間にbaseが再度進んだ場合は、記録したOIDから現在のremote base OIDへのancestor関係を確認する。線形な進行だけreview済みcommitを保ったままpushしてPR読み戻しで`BEHIND`を明示し、巻き戻し・force-update・別系統への付け替えならpush前に停止する。

一時plan、prototype、review画面は`plans/tmp/`へ置き、Gitでは追跡しない。追跡する正規書式は`plans/template.md`だけとする。

## plan成果物の一括cleanup

`npm run plans:cleanup`は、`plans/template.md`を除く`plans/`配下の削除候補をpreview表示する。previewはファイルを変更しない。候補を確認して一括削除する場合だけ、別の明示操作として`npm run plans:cleanup -- --apply`を実行する。この操作は日付付きの追跡済みplanと`plans/tmp/`の一時成果物をともに削除し、templateだけを残す。

この一括cleanupは`git-commit-push-pr`が明示承認されたexact `plans/tmp/<plan-id>/`だけを削除する処理とは別であり、shippingの一部として自動実行しない。Codexは現在のユーザー依頼で`plans/template.md`以外の一括削除が明示されている場合だけ`--apply`を実行する。

## HTMLレビューの要点

`implementation-review`はレビュー規則と画面templateを一つにまとめたskillであり、独自app serverやexecution engineではない。

- 変更をファイル順ではなく意図単位にまとめる。
- 影響とリスクが高い順に表示する。
- 各groupへ変更理由、diff位置、注意点、検証根拠を付ける。意図や妥当性を説明できない差分は要改善とする。
- 1回目はplanを見ないfresh agentが差分だけをレビューする。
- 2回目は別のfresh agentがplanとの適合を確認する。
- 二つのreview結果を混ぜて消さず、sourceを表示する。
- reviewerのcustom agentに指定したread-onlyは親taskのlive permissionで上書きされ得るため、絶対境界とは扱わない。各pass前後でHEAD・indexを含む全差分snapshot・入力artifact hashが不変であることを照合し、変化した場合はreviewを無効化して停止する。hard read-onlyが必要なら親task自体をread-onlyで分離する。
- 各指摘を`採用 / 却下 / 未確定`に分け、人間コメントと採用・未確定の指摘をMarkdownで生成・copyできるようにする。

画面は`node scripts/serve-plan-artifact.mjs plans/tmp/<plan-id>/implementation-review`でloopback配信し、Codexアプリ内Browserで確認する。HTMLレビューは自動testや実アプリ確認の代わりにはしない。

## 権限とGit

planやskillは追加権限ではない。deploy、外部API書き込み、共有・本番DB変更、secret操作、削除、commit、push、PRには現在のユーザー依頼による権限が必要である。Plan Modeやread-only permissionでは実装を始めない。

並列化はread-only調査・test・reviewを優先する。書き込みを並列化するときだけtaskごとの専用worktreeを使い、shared worktreeでは直列化する。workerはGit index・履歴を操作しない。

shipping前のstrict HTML reviewではexact task pathをstageし、base-to-working-tree、base-to-index、untrackedのunionを対象にする。review後にindexが変化した場合はレポートを再生成する。

## 参考にした運用

- [catnose「最近の開発の進め方」](https://x.com/catnose99/status/2080568062563201436)
- [catnose「レビュールール + 出力画面テンプレ」](https://x.com/catnose99/status/2080650223551156411)
