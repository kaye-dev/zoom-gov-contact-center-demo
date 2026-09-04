import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ExternalLink } from '../app/components/ExternalLink';
import { LanguageProvider } from '../app/i18n/LanguageProvider';
import {
  dictionaries,
  locales,
  type Locale,
} from '../app/i18n/dictionaries';

const TestLanguageProvider = LanguageProvider as ComponentType<{
  availableLocales: readonly Locale[];
  children?: ReactNode;
}>;

test('external links open safely with an accessible Open In New icon', () => {
  const html = renderToStaticMarkup(
    createElement(
      TestLanguageProvider,
      { availableLocales: ['ja'] },
      createElement(
        ExternalLink,
        { href: 'https://example.com/reference', className: 'text-accent' },
        '外部サイト',
      ),
    ),
  );

  assert.match(html, /href="https:\/\/example\.com\/reference"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /class="[^"]*cursor-pointer[^"]*text-accent"/);
  assert.match(html, /focus-visible:outline-2/);
  assert.match(html, /viewBox="0 -960 960 960"/);
  assert.match(html, /height="16px" width="16px"/);
  assert.match(html, /fill="currentColor"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /class="sr-only">（新しいタブで開きます）<\/span>/);
});

test('MDX and global styles apply the shared external-link behavior', () => {
  const mdxSource = readFileSync(
    new URL('../mdx-components.tsx', import.meta.url),
    'utf8',
  );
  const uiFoundationCss = readFileSync(
    new URL('../app/styles/ui-foundation.css', import.meta.url),
    'utf8',
  );

  assert.match(mdxSource, /\^\(\?:https\?:\)\?\\\/\\\//);
  assert.match(mdxSource, /<ExternalLink href=\{href\}/);
  assert.match(
    uiFoundationCss,
    /a\[href\]:not\(\[aria-disabled="true"\]\)\s*\{\s*cursor: pointer;/,
  );
  assert.match(
    uiFoundationCss,
    /a\[href\]\[aria-disabled="true"\]\s*\{\s*cursor: not-allowed;/,
  );
});

test('the new-tab announcement exists in every locale', () => {
  for (const locale of locales) {
    assert.ok(dictionaries[locale].links.opensInNewTab.length > 0, locale);
  }
});
