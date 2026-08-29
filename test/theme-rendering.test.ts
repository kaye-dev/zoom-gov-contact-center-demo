import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
  assert.match(layoutSource, /strategy="beforeInteractive"/);
  assert.match(
    globalsSource,
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
});

test("theme toggle has its initial visual state before transitions are enabled", () => {
  assert.match(
    globalsSource,
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
  assert.doesNotMatch(globalsSource, /prefers-color-scheme/);
});

test("the pre-paint script restores dark only for an explicit dark preference", () => {
  assert.match(layoutSource, /localStorage\.getItem\('theme'\)/);
  assert.match(layoutSource, /var d=t==='dark'/);
  assert.match(layoutSource, /classList\.toggle\('dark',d\)/);
  assert.match(layoutSource, /classList\.toggle\('light',!d\)/);
});

test("dark mode uses GitHub-style semantic canvas roles and native control scheme", () => {
  assert.match(globalsSource, /--surface:\s*#0d1117;/);
  assert.match(globalsSource, /--surface-raised:\s*#161b22;/);
  assert.match(globalsSource, /--surface-selected:\s*#21262d;/);
  assert.match(
    globalsSource,
    /--surface-accent-subtle:\s*rgb\(56 139 253 \/ 10%\);/,
  );
  assert.match(globalsSource, /--line:\s*#30363d;/);
  assert.match(globalsSource, /--fg:\s*#c9d1d9;/);
  assert.match(globalsSource, /--fg-muted:\s*#8b949e;/);
  assert.match(globalsSource, /--accent:\s*#58a6ff;/);
  assert.match(globalsSource, /--color-surface-selected:/);
  assert.match(globalsSource, /--color-surface-accent-subtle:/);
  assert.doesNotMatch(globalsSource, /--color-primary-950:/);
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
