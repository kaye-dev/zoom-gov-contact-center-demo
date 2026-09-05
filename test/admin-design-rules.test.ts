import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("DOC-01 design source, entry and static implementation workflow stay synchronized", () => {
  const design = read("DESIGN.md");
  const rule = read(".claude/rules/ui.md");
  assert.match(rule, /DESIGN\.md.*必ず読む/);
  assert.match(read("AGENTS.md"), /\.claude\/rules/);
  assert.match(design, /app\/styles\/ui-foundation\.css.*正本/);
  assert.match(design, /外枠・影・別背景を持たない/);
  assert.match(design, /fieldset.*legend/);
  assert.match(rule, /通常の.*implement.*Browserを起動せず/);
  assert.match(design, /非表示タブを含むページ全体/);
  assert.match(design, /Developer APIは各セクション/);
  assert.doesNotMatch(design, /フォームは必ずカード|管理画面は中央寄せ/);
});
test("DOC-02 adopted administration layout and safety contracts remain discoverable", () => {
  const design = read("DESIGN.md");
  for (const value of ["1024px", "1023px", "18rem", "4.25rem", "200ms", "X/Y座標は固定", "最下部", "公開サイトへ戻る", "⌘B", "reduced-motion", "ダッシュボード → 予約システム → ZAAD → ユーザー → ロール → 電話管理 → AIチャット管理 → Developer API → 設定", "主領域全幅", "4px内側", "SearchInput", "Pagination", "1ページ", "AdminPageTitleHelp", "44px", "320px", "640px", "検索一致総数", "60dvh", "単一のaccent境界", "forced-colors", "水平線"]) assert.ok(design.includes(value), value);
});
test("DOC-03 action count, exclusions and accessible portal contract are explicit", () => {
  const design = read("DESIGN.md");
  for (const value of ["操作が0件", "1件なら", "2件以上", "表示されたdisabled操作も数える", "データ名・メンバー名", "checkbox", "matrix", "一括操作", "MoreHorizIcon", "UserActionsMenu", "ApiKeyActionsMenu", "document.body", "portal", "fixed", "実測", "Escape", "Tab/Shift+Tab", "focusを奪わない", "次の行または一覧見出し"]) assert.ok(design.includes(value), value);
  assert.match(read(".claude/rules/ui.md"), /2つ以上.*三点メニュー/);
});
