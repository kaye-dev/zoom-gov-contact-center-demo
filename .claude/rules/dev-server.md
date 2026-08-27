# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 実アプリ

- 起動前に3000番台のLISTEN port、PID、cwd、commandを確認し、対象appの既存serverへ重ねて起動しない。
- 必要な場合だけ`npm run dev`を起動し、Codexが起動したPIDだけをcwdとcommandまで照合して停止する。ユーザーの既存processは停止しない。
- UI変更はCodexアプリ内Browserでlight・dark双方のdesktopと390×844、影響するresponsive breakpointの直前・境界、主要操作、keyboard、focus、主要state、console、networkを確認する。`curl`やtestだけで実画面確認済みとしない。

## HTMLレビュー

`plans/reviews/<slug>/`を次の専用loopback serverで配信する。

```sh
node scripts/serve-plan-artifact.mjs plans/reviews/<slug>
```

- 出力された`127.0.0.1`のURLをCodexアプリ内Browserで開き、desktopと390×844でリスクfilter、判断button、コメント、Markdown生成・copy、keyboard、focus、console、networkを確認する。
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- Browserを利用できない場合は未検証と報告する。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
