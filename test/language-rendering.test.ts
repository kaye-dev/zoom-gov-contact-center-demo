import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);
const uiFoundationSource = readFileSync(
  new URL("../app/styles/ui-foundation.css", import.meta.url),
  "utf8",
);
const providerSource = readFileSync(
  new URL("../app/i18n/LanguageProvider.tsx", import.meta.url),
  "utf8",
);
const languageStoreSource = readFileSync(
  new URL("../app/i18n/language-store.ts", import.meta.url),
  "utf8",
);

test("language content stays hidden until storage, context and HTML lang agree", () => {
  assert.match(
    layoutSource,
    /className="theme-loading language-loading scheme-light h-full antialiased dark:scheme-dark"/,
  );
  assert.match(layoutSource, /lang={toHtmlLanguageTag\(DEFAULT_SITE_LOCALE\)}/);
  assert.match(
    uiFoundationSource,
    /:root\.language-loading body\s*{\s*visibility: hidden;/,
  );
  assert.match(providerSource, /useLayoutEffect\(\(\) =>\s*{/);

  const syncIndex = providerSource.indexOf(
    "const resolved = syncLanguageFromStorage(availableLocales);",
  );
  const matchIndex = providerSource.indexOf("if (resolved !== locale)");
  const revealIndex = providerSource.indexOf("revealLanguageContent();");
  assert.ok(syncIndex >= 0);
  assert.ok(matchIndex > syncIndex);
  assert.ok(revealIndex > matchIndex);

  assert.match(providerSource, /isLocaleReady,/);
  assert.match(
    languageStoreSource,
    /document\.documentElement\.lang = toHtmlLanguageTag\(resolved\);/,
  );
  assert.match(
    languageStoreSource,
    /classList\.remove\('language-loading'\)/,
  );
});

test("language changes persist before reloading the current document", () => {
  assert.match(
    providerSource,
    /if \(resolved === locale \|\| !storeLocale\(resolved\)\) return;/,
  );
  assert.match(providerSource, /window\.location\.reload\(\);/);
  assert.match(providerSource, /window\.addEventListener\('storage', onStorage\)/);
  assert.match(
    providerSource,
    /document\.documentElement\.lang !== toHtmlLanguageTag\(next\)/,
  );
});

test("language loading suppresses initial transitions independently of theme", () => {
  assert.match(
    uiFoundationSource,
    /:root\.language-loading \*[\s\S]*?transition: none !important;/,
  );
});
