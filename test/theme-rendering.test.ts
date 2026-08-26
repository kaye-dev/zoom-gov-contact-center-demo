import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);
const globalsSource = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const themeSyncSource = readFileSync(
  new URL("../app/components/ThemeSync.tsx", import.meta.url),
  "utf8",
);
const themeStoreSource = readFileSync(
  new URL("../app/components/theme-store.ts", import.meta.url),
  "utf8",
);

test("theme content stays hidden until the stored theme is synchronized", () => {
  assert.match(layoutSource, /className="theme-loading h-full antialiased"/);
  assert.match(layoutSource, /strategy="beforeInteractive"/);
  assert.match(globalsSource, /:root\.theme-loading body\s*{\s*visibility: hidden;/);
  assert.match(themeSyncSource, /useLayoutEffect\(\(\) =>\s*{/);

  const syncIndex = themeSyncSource.indexOf("syncThemeFromStorage();");
  const revealIndex = themeSyncSource.indexOf(
    "classList.remove('theme-loading')",
  );
  assert.ok(syncIndex >= 0);
  assert.ok(revealIndex > syncIndex);
});

test("theme defaults to light without following the operating system", () => {
  assert.match(themeStoreSource, /if \(stored\) return stored === 'dark';\s*return false;/);
  assert.doesNotMatch(themeStoreSource, /matchMedia|prefers-color-scheme/);
  assert.doesNotMatch(globalsSource, /prefers-color-scheme/);
});

test("the pre-paint script restores dark only for an explicit dark preference", () => {
  assert.match(layoutSource, /localStorage\.getItem\('theme'\)/);
  assert.match(layoutSource, /var d=t==='dark'/);
  assert.match(layoutSource, /classList\.toggle\('dark',d\)/);
  assert.match(layoutSource, /classList\.toggle\('light',!d\)/);
});
