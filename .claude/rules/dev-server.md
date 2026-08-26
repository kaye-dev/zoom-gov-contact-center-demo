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
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- prototype確認、HTML差分レビュー、実装後の実アプリ確認は別の証拠として扱う。
- Browserを利用できない場合は未検証と報告する。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
