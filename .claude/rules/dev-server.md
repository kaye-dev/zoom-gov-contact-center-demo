# 開発サーバーとCodexアプリ内Browserの表示確認規約

## 実アプリ

- 起動前に3000番台のLISTEN port、PID、cwd、commandを確認し、対象appの既存serverへ重ねて起動しない。
- 必要な場合だけ`npm run dev`を起動し、Codexが起動したPIDだけをcwdとcommandまで照合して停止する。ユーザーの既存processは停止しない。
- UI変更はCodexアプリ内Browserでlight・dark双方のdesktopと390×844、影響するresponsive breakpointの直前・境界、主要操作、keyboard、focus、主要state、console、networkを確認する。`curl`やtestだけで実画面確認済みとしない。

## plan prototypeとHTMLレビュー

`plans/tmp/<plan-id>/prototype/`は次の軽量なloopback serverで配信する。引数なしでは最終更新されたprototypeを自動選択し、過去のprototypeなどを指定する場合だけplan IDを渡す。

```sh
./dev-prototype.sh
./dev-prototype.sh <plan-id>
```

`plans/tmp/<plan-id>/implementation-review/`は対象を明示して同じserver本体で配信する。

```sh
node scripts/serve-plan-artifact.mjs plans/tmp/<plan-id>/implementation-review
```

- `127.0.0.1`の出力URLをCodexアプリ内Browserで開く。
- UI変更のprototypeは、作成前に最も近い実画面とそのshell、token、共通componentを確認する。mockにしてよいのはdata、永続化、backend side effectだけであり、brand、navigation、layout、typography、color、control、icon、responsive behaviorは本番実装と同等の完成度にする。
- redesignが明示されていない限り、既存UIにないhero、breadcrumb、sidebar、hamburger menu、shadow、背景色、brand wordingを発明しない。prototype注記、debug control、実装上の免責はproduct UI内へ表示しない。
- 承認前に実画面とprototypeをlight・dark双方のdesktop、390×844、影響するbreakpoint境界で比較し、shell、主要computed style、overflow、keyboard、focus、theme切替、主要state、console、network、意図した差分を記録する。機能・a11y・responsive確認だけではUI parity完了としない。
- `file://`、外部CDN、外部API、analytics、repo全体を公開するserverは使わない。
- prototypeのstylingは本番と同じTailwind CSS utilityと`app/globals.css`で完結させる。手書きCSS、`@apply` component、token複製が必要な場合は追加前に理由と対象を示し、ユーザーの明示承認を得る。
- productionがlight・darkを持つためprototypeも両themeを完成状態で実装する。本番と同じdocument class、semantic token、初期同期、保存、既存toggle配置を使い、対象routeにtoggleがない場合はproduct UIを変えず`?theme=light|dark`などのreviewer entry pointを用意する。
- responsive variantをsourceからinventoryし、390×844とdesktopだけでなく、layoutが変わる各breakpointの1px手前と境界でstack、wrap、visibility、dialog fit、横overflowを確認する。primary mobile・desktopはlight・dark双方で確認する。
- 比較前に両画面が実際に報告するviewport、devicePixelRatio、scrollX・scrollY、locale、theme、fixture、stateを読み取り、一致しない組み合わせをparity証拠に使わない。viewport overrideを設定した事実だけで一致扱いにしない。focusによる自動scrollが異なる場合はscrollを揃えるか、document座標へ換算して比較する。
- 初期表示だけでなく、影響画面の既存edit、dialog、disabled sibling、saving、errorなど新機能と共存・競合するstateをsourceからinventoryし、同一stateのscreenshot、DOM・a11y、主要computed styleを比較する。
- prototype確認、HTML差分レビュー、実装後の実アプリ確認は別の証拠として扱う。
- Browser検証合格はmachine parityでありユーザーのUI承認ではない。rendered prototypeの明示承認があるまでUI承認gateを完了しない。
- Browserを利用できない場合は未検証と報告する。

Codexのproject-local設定は`.codex/config.toml`を参照する。`.mcp.json`はClaude Code用である。
