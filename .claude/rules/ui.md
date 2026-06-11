# UI（インタラクション）コーディング規約

画面に出るインタラクティブ要素の振る舞いについて、以下を**確認なしで**遵守すること。

## 1. クリック可能な要素はホバー時にポインターカーソルにする

- クリックイベントが発生する HTML 要素（`<button>`、`onClick` を持つ要素、クリック用の
  `role="button"` 要素など）は、ホバー時にカーソルがポインター（手の形）になるようにする。
- Tailwind では `cursor-pointer` クラスを付与する。
  ```tsx
  <button type="button" className="... cursor-pointer ...">…</button>
  ```
- `<a href="...">`（リンク）はブラウザ既定でポインターになるため、原則として追加不要。
  ただし `href` を持たず `onClick` だけで遷移・動作する要素には `cursor-pointer` を付ける。
- 無効状態（`disabled`）のボタンには付けない（`disabled:cursor-not-allowed` 等を優先）。
