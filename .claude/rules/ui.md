# UI（インタラクション）コーディング規約

画面に出るインタラクティブ要素の振る舞いについて、以下を**確認なしで**遵守すること。

## デザインの正本と実装前チェック

- UI作業では`DESIGN.md`を必ず読む。管理画面は5.4、フォームは6.5、検証は11章と`.claude/rules/dev-server.md`を参照する。視覚仕様をこのファイルへ重複転記せず、変更時はDESIGNの関連箇所を同期する。
- 設定フォームに装飾目的の外枠・影・入れ子カードを追加しない。意味上の`fieldset`／`legend`と見た目の枠は別であり、外枠を消してもアクセシブルなグループ名は残す。入力境界、選択カード、独立データ、前景面は役割に応じて枠を残す。
- `AdminShell`、`AdminNavigation`、`AdminSettingsTabs`、`AdminPageTitleHelp`、`SearchInput`、`Pagination`、既存SVGとsemantic tokenを先に確認する。新しい見た目をページ固有CSSで複製しない。
- サイドバーのアイコン固定軸、下部アカウント、平坦なナビ順序、タブ下線の全幅、見出し／本文の共通開始線、単一境界の入力focus、本文に残す入力ガイダンスを変更対象の回帰条件に含める。
- light/dark、390px、関連breakpointの直前／直後、長い翻訳、readonly・saving・error・success、keyboard／focusを設計する。通常の`$implement`ではBrowserを起動せず、静的検証と未チェックのユーザー動作確認を引き渡す。
- テーブルの同一行に2つ以上のアクションがある場合は三点メニューへ集約する。件数は権限・表示条件の適用後で数え、表示されたdisabled項目を除外しない。データ名リンクやcheckboxとの区別、0/1件の扱い、portal・keyboard・focus・危険操作は`DESIGN.md` 5.4に従う。`UsersView`／`ReservationApiKeysView`の既存メニューと共通行操作部品を先に確認し、ページ固有の横並びボタンや独自menuを増やさない。

## 1. クリック可能な要素はホバー時にポインターカーソルにする

- 以下の要素には必ずポインターカーソルを表示する: `<button>`、`<a href="...">`、`Link`、`href` を持たない `onClick` を持つ要素、`role="button"` を持つ要素。`tabIndex=0` と `aria-disabled={false}` を満たす要素も対象とする。
- React のカスタムコンポーネント（例: `<MyButton />`）や SVG 要素でも、`onClick` または `role="button"` を持つ場合は、この規約を適用する。
- Tailwind では `cursor-pointer` クラスを付与する。`<a href="...">` と `Link` は `app/globals.css` の `a[href]` でも一括して保証し、個別実装の付け忘れを防ぐ。
  ```tsx
  <button type="button" className="... cursor-pointer ...">…</button>
  ```
- リンク要素 `<a href="...">` と `Link` にもポインターカーソルを表示する。ブラウザ既定値だけに依存しない。
- 無効状態の要素には `cursor-pointer` を付けない。`disabled` に加えて `aria-disabled={true}` を持つ要素についても `cursor-pointer` を付けず、`disabled:cursor-not-allowed` や `cursor-not-allowed` を使用する。
