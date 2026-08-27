# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 実アプリ

- 起動前に3000番台のLISTEN port、PID、cwd、commandを確認し、対象appの既存serverへ重ねて起動しない。
- 必要な場合だけ`npm run dev`を起動し、Codexが起動したPIDだけをcwdとcommandまで照合して停止する。ユーザーの既存processは停止しない。
- UI変更はCodexアプリ内Browserでdesktopと390×844、主要操作、keyboard、focus、主要state、console、networkを確認する。`curl`やtestだけで実画面確認済みとしない。

## plan prototypeとHTMLレビュー

`plans/tmp/<plan-id>/prototype/`と`plans/tmp/<plan-id>/implementation-review/`は次の軽量なloopback serverで配信する。

```sh
node scripts/serve-plan-artifact.mjs plans/tmp/<plan-id>/<prototype|implementation-review>
```

- `127.0.0.1`の出力URLをCodexアプリ内Browserで開く。
- UI変更のprototypeは、作成前に最も近い実画面とそのshell、token、共通componentを確認する。mockにしてよいのはdata、永続化、backend side effectだけであり、brand、navigation、layout、typography、color、control、icon、responsive behaviorは本番実装と同等の完成度にする。
- redesignが明示されていない限り、既存UIにないhero、breadcrumb、sidebar、hamburger menu、shadow、背景色、brand wordingを発明しない。prototype注記、debug control、実装上の免責はproduct UI内へ表示しない。
- 承認前に実画面とprototypeをdesktop、390×844で比較し、shell、主要computed style、overflow、keyboard、focus、主要state、console、network、意図した差分を記録する。機能・a11y・responsive確認だけではUI parity完了としない。
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- prototype確認、HTML差分レビュー、実装後の実アプリ確認は別の証拠として扱う。
- Browserを利用できない場合は未検証と報告する。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
