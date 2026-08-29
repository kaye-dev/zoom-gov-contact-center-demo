import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { dictionaries, locales } from '../app/i18n/dictionaries';
import { listPublicSitemapPaths } from '../lib/search-indexing';

const route = '/life/emergency-safety-disaster/disaster-prevention-radio';
const registrationAddress = 'bosai-register@city.example';
const senderAddress = 'bosai-info@city.example';

const footerSource = readFileSync(
  new URL('../app/components/FooterClient.tsx', import.meta.url),
  'utf8',
);
const viewSource = readFileSync(
  new URL(
    '../app/components/DisasterPreventionRadioView.tsx',
    import.meta.url,
  ),
  'utf8',
);
const pageSource = readFileSync(
  new URL(
    '../app/life/emergency-safety-disaster/disaster-prevention-radio/page.tsx',
    import.meta.url,
  ),
  'utf8',
);
const informationPageSource = readFileSync(
  new URL('../app/components/InformationPageViews.tsx', import.meta.url),
  'utf8',
);
const headerSource = readFileSync(
  new URL('../app/components/Header.tsx', import.meta.url),
  'utf8',
);
const mobileMenuSource = readFileSync(
  new URL('../app/components/MobileMenu.tsx', import.meta.url),
  'utf8',
);
const chevronDownSource = readFileSync(
  new URL('../app/components/svg/ChevronDownIcon.tsx', import.meta.url),
  'utf8',
);
const chevronRightSource = readFileSync(
  new URL('../app/components/svg/ChevronRightIcon.tsx', import.meta.url),
  'utf8',
);

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

test('DR-01 footer link contract', () => {
  const serviceLinksStart = footerSource.indexOf('const serviceLinks = [');
  const serviceLinksEnd = footerSource.indexOf('];', serviceLinksStart);
  const serviceLinksSource = footerSource.slice(
    serviceLinksStart,
    serviceLinksEnd,
  );

  assert.ok(serviceLinksStart >= 0);
  assert.match(serviceLinksSource, /label: t\.footer\.disasterRadio/);
  assert.match(serviceLinksSource, new RegExp(`href: '${route}'`));
  assert.ok(
    serviceLinksSource.indexOf('t.footer.disasterRadio') <
      serviceLinksSource.indexOf('t.footer.feedback'),
  );
  assert.doesNotMatch(serviceLinksSource, /aria-current|font-bold|text-accent/);
  assert.match(
    footerSource,
    /className="text-fg-muted underline-offset-4 transition-colors hover:text-accent hover:underline"/,
  );
  assert.equal(dictionaries.ja.footer.disasterRadio, '防災無線');
});

test('DR-02 page structure and metadata', () => {
  const copy = dictionaries.ja.contentPages.disasterRadio;

  assert.equal(copy.title, '防災行政無線の放送内容を確認する');
  assert.match(viewSource, /<PageFrame>/);
  assert.match(viewSource, /<Breadcrumbs/);
  assert.match(viewSource, /href: '\/life\/emergency-safety-disaster'/);
  assert.match(viewSource, /<PageTitleBand[\s\S]*title=\{copy\.title\}/);
  assert.match(viewSource, /<ContentsNavigation items=\{contentsItems\}/);
  assert.match(viewSource, /id="email-service"/);
  assert.match(viewSource, /id="phone-service"/);
  assert.match(viewSource, /id="radio-contact"/);
  assert.match(pageSource, /export const metadata: Metadata/);
  assert.match(
    pageSource,
    /title: `\$\{pageCopy\.title\} \| \$\{dictionary\.cityName\}`/,
  );
  assert.match(pageSource, /description: pageCopy\.lead/);
});

test('DR-03 embedded email registration content', () => {
  const copy = dictionaries.ja.contentPages.disasterRadio;

  assert.equal(copy.registrationSteps.length, 3);
  assert.match(copy.registrationSteps[1], /件名に「ALL」と入力/);
  assert.match(viewSource, /<ol className=/);
  assert.match(viewSource, /copy\.registrationSteps\.map/);
  assert.match(
    viewSource,
    /href=\{`mailto:\$\{registrationAddress\}\?subject=\$\{registrationSubject\}`\}/,
  );
  assert.match(viewSource, new RegExp(registrationAddress.replace('.', '\\.')));
  assert.match(viewSource, new RegExp(senderAddress.replace('.', '\\.')));
  assert.match(viewSource, /const registrationSubject = 'ALL'/);
  assert.doesNotMatch(viewSource, /iframe|\.pdf/iu);
});

test('DR-04 embedded phone service content', () => {
  const copy = dictionaries.ja.contentPages.disasterRadio;

  assert.equal(copy.phoneHeading, '電話応答サービス');
  assert.equal(copy.demoSuffix, '（デモ用）');
  assert.match(copy.phoneNote, /実際の通話には接続しません/);
  assert.match(viewSource, /const demoPhone = '0120-000-000'/);
  assert.doesNotMatch(viewSource, /tel:0120-000-000/);
  assert.match(viewSource, /const contactPhoneHref = 'tel:\+81312345678'/);
});

test('DR-05 frontend-only boundary', () => {
  const routeSources = `${viewSource}\n${pageSource}`;

  assert.doesNotMatch(
    routeSources,
    /\b(?:fetch|axios|prisma|use server|server action|route handler)\b/iu,
  );
  assert.doesNotMatch(routeSources, /<iframe|\.pdf|FormData|onSubmit/iu);
  assert.match(viewSource, /^'use client';/);
});

test('DR-06 demo endpoint safety', () => {
  const implementedContent = `${viewSource}\n${JSON.stringify(
    dictionaries.ja.contentPages.disasterRadio,
  )}`;
  const forbiddenValues = [
    'd-touroku@rt.city.rikuzentakata.iwate.jp',
    'd-mail@rt.city.rikuzentakata.iwate.jp',
    '0120-273-256',
  ];

  for (const forbiddenValue of forbiddenValues) {
    assert.doesNotMatch(
      implementedContent,
      new RegExp(forbiddenValue.replaceAll('.', '\\.')),
    );
  }
  assert.match(implementedContent, /デモ用/);
  assert.match(implementedContent, /実際の登録は行われません/);
});

test('DR-07 locale completeness', () => {
  const expectedKeys = Object.keys(
    dictionaries.ja.contentPages.disasterRadio,
  ).sort();

  for (const locale of locales) {
    const copy = dictionaries[locale].contentPages.disasterRadio;
    assert.deepEqual(Object.keys(copy).sort(), expectedKeys, locale);
    assert.equal(copy.registrationSteps.length, 3, locale);
    for (const value of collectStrings(copy)) {
      assert.ok(value.trim().length > 0, `${locale}: empty disaster radio copy`);
    }
    assert.ok(dictionaries[locale].footer.disasterRadio.trim().length > 0);
  }
});

test('DR-08 semantic UI and icon source guard', () => {
  assert.match(
    informationPageSource,
    /<CategoryIcon src=\{iconSrc\} className="absolute h-11 w-11 opacity-60 md:h-13 md:w-13"/,
  );
  assert.match(informationPageSource, /bg-accent/);
  assert.match(informationPageSource, /maskImage/);
  assert.match(viewSource, /iconSrc="\/life-information\/life-safety\.png"/);
  assert.match(viewSource, /<ContentsNavigation items=\{contentsItems\}/);
  assert.match(viewSource, /<ChevronRightIcon className="shrink-0"/);
  assert.match(
    chevronDownSource,
    /M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z/,
  );
  assert.match(
    chevronRightSource,
    /M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z/,
  );
  assert.match(chevronDownSource, /height = 24/);
  assert.match(chevronDownSource, /width = 24/);
  assert.match(chevronRightSource, /height = 24/);
  assert.match(chevronRightSource, /width = 24/);
  assert.doesNotMatch(viewSource, /[⌄›‹]/u);
});

test('DR-09 mobile menu focus lifecycle', () => {
  assert.match(
    headerSource,
    /const menuButtonRef = useRef<HTMLButtonElement>\(null\)/,
  );
  assert.match(headerSource, /ref=\{menuButtonRef\}/);
  assert.match(headerSource, /requestAnimationFrame\(\(\) => \{/);
  assert.match(headerSource, /menuButton\?\.isConnected\) menuButton\.focus\(\)/);
  assert.match(
    headerSource,
    /<MobileMenu open=\{menuOpen\} onClose=\{closeMobileMenu\}/,
  );

  assert.match(
    mobileMenuSource,
    /const closeButtonRef = useRef<HTMLButtonElement>\(null\)/,
  );
  assert.match(
    mobileMenuSource,
    /const dialogRef = useRef<HTMLDivElement>\(null\)/,
  );
  assert.match(mobileMenuSource, /ref=\{closeButtonRef\}/);
  assert.match(mobileMenuSource, /ref=\{dialogRef\}/);
  assert.match(
    mobileMenuSource,
    /closeButton\?\.isConnected\) closeButton\.focus\(\)/,
  );
  assert.match(mobileMenuSource, /if \(e\.key === 'Escape'\) \{/);
  assert.match(mobileMenuSource, /if \(e\.key !== 'Tab'\) return/);
  assert.match(mobileMenuSource, /'a\[href\]'/);
  assert.match(mobileMenuSource, /'button:not\(\[disabled\]\)'/);
  assert.match(mobileMenuSource, /'input:not\(\[disabled\]\)'/);
  assert.match(mobileMenuSource, /'select:not\(\[disabled\]\)'/);
  assert.match(mobileMenuSource, /'textarea:not\(\[disabled\]\)'/);
  assert.match(
    mobileMenuSource,
    /'\[tabindex\]:not\(\[tabindex="-1"\]\)'/,
  );
  assert.match(
    mobileMenuSource,
    /dialog\.querySelectorAll<HTMLElement>\(FOCUSABLE_SELECTOR\)/,
  );
  assert.match(mobileMenuSource, /element\.getClientRects\(\)\.length > 0/);
  assert.match(
    mobileMenuSource,
    /element\.getAttribute\('aria-hidden'\) !== 'true'/,
  );
  assert.match(mobileMenuSource, /if \(tabbableElements\.length === 0\)/);
  assert.match(mobileMenuSource, /const firstElement = tabbableElements\[0\]/);
  assert.match(
    mobileMenuSource,
    /const lastElement = tabbableElements\[tabbableElements\.length - 1\]/,
  );
  assert.match(
    mobileMenuSource,
    /const focusIsOutsideDialog = !dialog\.contains\(activeElement\)/,
  );
  assert.match(
    mobileMenuSource,
    /e\.shiftKey && \(activeElement === firstElement \|\| focusIsOutsideDialog\)/,
  );
  assert.match(
    mobileMenuSource,
    /activeElement === lastElement \|\| focusIsOutsideDialog/,
  );
  assert.match(mobileMenuSource, /lastElement\.focus\(\)/);
  assert.match(mobileMenuSource, /firstElement\.focus\(\)/);
  assert.match(mobileMenuSource, /e\.preventDefault\(\)/);
  assert.match(mobileMenuSource, /onClick=\{onClose\}/);
  assert.match(mobileMenuSource, /document\.body\.style\.overflow = prevOverflow/);
});

test('DR-10 sitemap path', async () => {
  const paths = await listPublicSitemapPaths();

  assert.equal(paths.length, 276);
  assert.equal(paths.filter((path) => path === route).length, 1);
  assert.equal(new Set(paths).size, paths.length);
});
