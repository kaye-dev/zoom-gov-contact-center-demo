import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveReviewTheme } from "../app/components/ThemeSync";

const layoutSource = readFileSync(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);
const uiFoundationSource = readFileSync(
  new URL("../app/styles/ui-foundation.css", import.meta.url),
  "utf8",
);
const themeSyncSource = readFileSync(
  new URL("../app/components/ThemeSync.tsx", import.meta.url),
  "utf8",
);
const themeToggleSource = readFileSync(
  new URL("../app/components/ThemeToggle.tsx", import.meta.url),
  "utf8",
);
const themeStoreSource = readFileSync(
  new URL("../app/components/theme-store.ts", import.meta.url),
  "utf8",
);
const appRoot = fileURLToPath(new URL("../app/", import.meta.url));

function readTsxSources(directory: string): { path: string; source: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) return readTsxSources(entryPath);
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) return [];

    return [
      {
        path: relative(appRoot, entryPath),
        source: readFileSync(entryPath, "utf8"),
      },
    ];
  });
}

const appTsxSources = readTsxSources(appRoot);
const combinedAppTsxSource = appTsxSources
  .map(({ source }) => source)
  .join("\n");

test("theme content stays hidden until the stored theme is synchronized", () => {
  assert.match(
    layoutSource,
    /className="theme-loading language-loading scheme-light h-full antialiased dark:scheme-dark"/,
  );
  assert.match(layoutSource, /<head>[\s\S]*?<script[\s\S]*?id="theme-init"/);
  assert.doesNotMatch(layoutSource, /next\/script|strategy="beforeInteractive"/);
  assert.match(
    uiFoundationSource,
    /:root\.theme-loading body,[\s\S]*?:root\.language-loading body\s*{\s*visibility: hidden;/,
  );
  assert.match(themeSyncSource, /useLayoutEffect\(\(\) =>\s*{/);

  assert.match(themeSyncSource, /const isDark = useIsDarkTheme\(\);/);

  const syncIndex = themeSyncSource.indexOf(
    "const synchronizedIsDark = syncThemeFromStorage();",
  );
  const matchIndex = themeSyncSource.indexOf(
    "if (isDark === synchronizedIsDark)",
  );
  const revealIndex = themeSyncSource.indexOf(
    "classList.remove('theme-loading')",
  );
  assert.ok(syncIndex >= 0);
  assert.ok(matchIndex > syncIndex);
  assert.ok(revealIndex > matchIndex);
  assert.match(themeSyncSource, /}, \[isDark\]\);/);
  assert.match(
    themeSyncSource,
    /function ReviewThemeSync\(\)[\s\S]*?useLayoutEffect\(\(\) =>\s*{[\s\S]*?const reviewIsDark = applyReviewTheme\(\);[\s\S]*?classList\.remove\('theme-loading'\)[\s\S]*?}, \[\]\);/,
  );
  assert.match(
    themeSyncSource,
    /return reviewTheme \? <ReviewThemeSync \/> : <StoredThemeSync \/>;/,
  );
  assert.match(themeSyncSource, /new MutationObserver/);
  assert.match(themeSyncSource, /attributeFilter: \['class'\]/);
  assert.match(themeSyncSource, /return \(\) => observer\.disconnect\(\);/);
});

test("theme toggle has its initial visual state before transitions are enabled", () => {
  assert.match(
    uiFoundationSource,
    /:root\.theme-loading \*[\s\S]*?transition: none !important;/,
  );
  assert.match(themeToggleSource, /translate-x-\[2px\]/);
  assert.match(themeToggleSource, /dark:translate-x-\[22px\]/);
  assert.doesNotMatch(
    themeToggleSource,
    /isDark \? 'translate-x-\[22px\]' : 'translate-x-\[2px\]'/,
  );
});

test("theme defaults to light without following the operating system", () => {
  assert.match(themeStoreSource, /if \(stored\) return stored === 'dark';\s*return false;/);
  assert.doesNotMatch(themeStoreSource, /matchMedia|prefers-color-scheme/);
  assert.doesNotMatch(uiFoundationSource, /prefers-color-scheme/);
});

test("the pre-paint script restores dark only for an explicit dark preference", () => {
  assert.match(layoutSource, /localStorage\.getItem\('theme'\)/);
  assert.match(layoutSource, /new URLSearchParams\(location\.search\)\.getAll\('theme'\)/);
  assert.match(layoutSource, /location\.hostname==='localhost'/);
  assert.match(layoutSource, /var d=t==='dark'/);
  assert.match(layoutSource, /classList\.toggle\('dark',d\)/);
  assert.match(layoutSource, /classList\.toggle\('light',!d\)/);
  assert.match(layoutSource, /classList\.toggle\('review-theme',r!==null\)/);
});

test("review theme query is development-only, loopback-only, and non-persistent", () => {
  assert.equal(resolveReviewTheme({ hostname: "localhost", search: "?theme=dark" }, "development"), "dark");
  assert.equal(resolveReviewTheme({ hostname: "127.0.0.1", search: "?theme=light" }, "test"), "light");
  assert.equal(resolveReviewTheme({ hostname: "[::1]", search: "?theme=dark" }, "development"), "dark");
  assert.equal(resolveReviewTheme({ hostname: "demo.example", search: "?theme=dark" }, "development"), null);
  assert.equal(resolveReviewTheme({ hostname: "localhost", search: "?theme=dark" }, "production"), null);
  assert.equal(resolveReviewTheme({ hostname: "localhost", search: "?theme=blue" }, "development"), null);
  assert.equal(resolveReviewTheme({ hostname: "localhost", search: "?theme=dark&theme=light" }, "development"), null);
  assert.doesNotMatch(themeSyncSource, /localStorage\.setItem/);
  assert.match(uiFoundationSource, /:root\.review-theme nextjs-portal\s*{\s*display: none;/);
});

test("dark mode uses GitHub-style semantic canvas roles and native control scheme", () => {
  assert.match(uiFoundationSource, /--surface:\s*#0d1117;/);
  assert.match(uiFoundationSource, /--surface-raised:\s*#161b22;/);
  assert.match(uiFoundationSource, /--surface-selected:\s*#21262d;/);
  assert.match(
    uiFoundationSource,
    /--surface-accent-subtle:\s*rgb\(56 139 253 \/ 10%\);/,
  );
  assert.match(uiFoundationSource, /--line:\s*#30363d;/);
  assert.match(uiFoundationSource, /--fg:\s*#c9d1d9;/);
  assert.match(uiFoundationSource, /--fg-muted:\s*#8b949e;/);
  assert.match(uiFoundationSource, /--accent:\s*#58a6ff;/);
  assert.match(uiFoundationSource, /--color-surface-selected:/);
  assert.match(uiFoundationSource, /--color-surface-accent-subtle:/);
  assert.doesNotMatch(uiFoundationSource, /--color-primary-950:/);
  assert.match(layoutSource, /scheme-light[^"]*dark:scheme-dark/);
});

test("selected and accent surfaces use theme-aware semantic roles", () => {
  assert.doesNotMatch(combinedAppTsxSource, /dark:[^\s"'`]*bg-primary-/);
  assert.doesNotMatch(
    combinedAppTsxSource,
    /has-\[:checked\]:bg-primary-/,
  );
  assert.ok(
    (combinedAppTsxSource.match(/bg-surface-selected/g)?.length ?? 0) >= 3,
  );
  assert.ok(
    (combinedAppTsxSource.match(/bg-surface-accent-subtle/g)?.length ?? 0) >= 8,
  );
  assert.doesNotMatch(combinedAppTsxSource, /accent-primary/);
  assert.doesNotMatch(
    combinedAppTsxSource,
    /border-primary bg-surface-selected/,
  );
  assert.doesNotMatch(
    combinedAppTsxSource,
    /bg-surface-accent-subtle[^"'`\n]*dark:border-primary/,
  );
});

test("native radios keep semantic accent and fixed geometry", () => {
  const radioControls = [
    ...combinedAppTsxSource.matchAll(/<input\b[\s\S]*?\/>/g),
  ]
    .map(([source]) => source)
    .filter((source) => /type="radio"/.test(source));

  assert.ok(radioControls.length >= 3);
  radioControls.forEach((source) => {
    assert.match(source, /accent-accent/);
    assert.match(source, /shrink-0/);
    assert.match(source, /focus-visible:outline-accent/);
  });
});

test("light-only surfaces cannot remain white in dark mode", () => {
  const missingDarkBackground = appTsxSources.flatMap(
    ({ path, source }) =>
      source.split("\n").flatMap((line, index) => {
        if (!line.includes("bg-primary-50") && !line.includes("bg-white")) {
          return [];
        }
        if (/dark:[^\s"'`]*bg-/.test(line)) return [];
        if (
          line.includes("bg-white") &&
          line.includes("rounded-full") &&
          (path === "components/ThemeToggle.tsx" ||
            path === "admin/users/[id]/UserDetailsView.tsx")
        ) {
          return [];
        }
        return [`${path}:${index + 1}`];
      }),
  );

  assert.deepEqual(missingDarkBackground, []);
});
