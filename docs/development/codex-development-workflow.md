# Codex計画・実装・HTMLレビューワークフロー

## 目的

大きな変更を、自己完結したgoal、必要なUI prototype、production実装、独立レビューへ薄く受け渡す。独自runtime、専用agent、固定model routing、lifecycle state machineは作らない。

## 成果物

`plans/template.md`だけを追跡し、生成物はplan単位で同じdirectoryへ置く。

```text
plans/
├── <slug>/
│   ├── goal.md
│   ├── prototype/
│   └── review/
└── template.md
```

`prototype/`はUI変更時、`review/`は`$review`実行時だけ作る。生成directoryはGitへ追加しない。

## 標準フロー

1. `$plan`でrepository、runtime、既存UIを確認し、`plans/<slug>/goal.md`を作る。
2. UI変更では同じdirectoryにproduction-parity prototypeを作り、実画面とのmachine parityを確認する。rendered prototypeをユーザーが明示承認するまで`UI承認記録`は未承認とする。
3. 必要なら`$plan-critic`でgoalを独立レビューする。materialなUI契約変更はmachine parityとUI承認を無効化し、prototype revisionを`$plan`へ戻す。
4. `$implement`は承認済みgoalに従い、現在のagentがproduction実装と検証を行う。UI変更では承認済みprototypeとのlive parityを同じmatrixで確認する。
5. 大きい、または意図をdiffだけで追いにくい変更は`$review`でblind diff reviewとgoal適合reviewを行い、`plans/<slug>/review/`へHTML reportを生成する。
6. commit、push、PRは現在のユーザーが明示した場合だけ`$git-commit-push-pr`で行う。plan成果物のcleanupはshippingとは別の明示操作とする。

## UI prototype

prototypeは完成UI契約であり、wireframeや別productではない。data、persistence、authorization、backend side effectだけをmockとし、既存shell、copy、component、Tailwind utility、semantic token、theme、responsive behavior、interaction、DOM、accessibilityを本番相当にする。

stylingは`app/globals.css`と本番Tailwind utilityを使い、次でcompileする。

```sh
node .agents/skills/plan/scripts/build-prototype-css.mjs plans/<slug>/prototype
```

次でloopback配信する。

```sh
./dev-prototype.sh <slug>
```

machine parityとユーザーUI承認、実装後live parityは別々の証拠として扱う。

## HTML review

`$review`は変更を意図単位・リスク順にまとめ、blind reviewとgoal適合reviewをsource付きで保持する。画面は`採用 / 却下 / 未確定`、人間comment、Markdown生成とcopyを提供する。

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

HTML reviewは自動test、prototype parity、実アプリ確認の代わりにはならない。

## 権限とcleanup

goalやskillは追加権限ではない。deploy、外部API書き込み、共有・本番DB変更、secret操作、削除、commit、push、PRには現在のユーザー依頼による権限が必要である。

`npm run plans:cleanup`は`plans/template.md`以外の削除候補をpreviewする。実際に削除する場合だけ、別の明示操作として`npm run plans:cleanup -- --apply`を使う。
