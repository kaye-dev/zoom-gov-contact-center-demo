# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 実アプリ

- 起動前に3000番台のLISTEN port、PID、cwd、commandを確認し、対象appの既存serverへ重ねて起動しない。
- 必要な場合だけ`npm run dev`を起動し、Codexが起動したPIDだけをcwdとcommandまで照合して停止する。ユーザーの既存processは停止しない。
- UI変更はCodexアプリ内Browserでlight・dark双方のdesktopと390×844、影響するresponsive breakpointの直前・境界、主要操作、keyboard、focus、主要state、console、networkを確認する。`curl`やtestだけで実画面確認済みとしない。

## plan prototypeとHTMLレビュー

`plans/<slug>/prototype/`は次の軽量なloopback serverで配信する。引数なしではcanonical prototypeから最終更新されたものを自動選択し、canonicalが1件もない場合だけ旧`plans/tmp/<slug>/prototype/`へフォールバックする。対象を指定する場合だけslugを渡す。

```sh
./dev-prototype.sh
./dev-prototype.sh <slug>
```

`plans/<slug>/review/`は対象を明示して同じserver本体で配信する。

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

- 出力された`127.0.0.1`のURLをCodexアプリ内Browserで開く。
- UI prototypeは作成前に最も近い実画面、shell、token、共通componentを確認する。mockにしてよいのはdata、永続化、authorization、backend side effectだけであり、brand、navigation、layout、typography、color、control、icon、responsive behaviorは本番相当とする。
- prototypeは本番と同じTailwind utilityと`app/globals.css`を使い、light・dark、desktop、390×844、関連breakpoint境界、主要state、keyboard、focus、DOM・a11y、computed style、console、networkを比較する。
- Browserや自動比較の合格はmachine parityであり、ユーザーのUI承認ではない。rendered prototypeの明示承認前にproduction実装を開始しない。
- HTML reviewはdesktopと390×844でリスクfilter、判断button、コメント、Markdown生成・copy、keyboard、focus、console、networkを確認する。
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- prototype確認、HTML review、実装後の実アプリ確認は別の証拠として扱う。
- Browserを利用できない場合は未検証と報告する。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
