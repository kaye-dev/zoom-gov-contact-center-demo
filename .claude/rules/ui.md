# UI（インタラクション）コーディング規約

画面に出るインタラクティブ要素の振る舞いについて、以下を**確認なしで**遵守すること。

## 1. クリック可能な要素はホバー時にポインターカーソルにする

- 以下の要素には必ず `cursor-pointer` を付与する: `<button>`、`href` を持たない `onClick` を持つ要素、`role="button"` を持つ要素。`tabIndex=0` と `aria-disabled={false}` を満たす要素も対象とする。
- React のカスタムコンポーネント（例: `<MyButton />`）や SVG 要素でも、`onClick` または `role="button"` を持つ場合は、この規約を適用する。
- Tailwind では `cursor-pointer` クラスを付与する。
  ```tsx
  <button type="button" className="... cursor-pointer ...">…</button>
  ```
- リンク要素 `<a href="...">` には `cursor-pointer` を付与しない。`href` を持たず `onClick` だけで遷移する要素にのみ `cursor-pointer` を付与する。
- 無効状態の要素には `cursor-pointer` を付けない。`disabled` に加えて `aria-disabled={true}` を持つ要素についても `cursor-pointer` を付けず、`disabled:cursor-not-allowed` や `cursor-not-allowed` を使用する。
