import assert from "node:assert/strict";
import test from "node:test";

import { lifeCategories, newsArticles } from "../app/content/site-content";
import {
  buildDictionary,
  defaultTenantDictionaries,
} from "../app/i18n/build-dictionary";
import { chromeDictionaries, locales } from "../app/i18n/dictionaries";
import { lgContent } from "../app/tenants/lg/content";
import { DEFAULT_TENANT_KEY, TENANT_KEYS } from "../lib/tenants";

test("every tenant content pack covers every locale with the same structure", () => {
  for (const locale of locales) {
    const content = lgContent[locale];
    assert.ok(content, `lg content is missing locale ${locale}`);

    // .claude/rules/i18n.md: a display string must exist in all locales.
    assert.ok(content.siteName.trim().length > 0, `${locale}: siteName`);
    assert.ok(content.siteNameRoman.trim().length > 0, `${locale}: siteNameRoman`);

    const reference = lgContent.ja;
    assert.deepEqual(
      Object.keys(content.findInfo.lifeInfo.items).sort(),
      Object.keys(reference.findInfo.lifeInfo.items).sort(),
      `${locale}: life info item ids must match ja`,
    );
    assert.deepEqual(
      Object.keys(content.news.articles).sort(),
      Object.keys(reference.news.articles).sort(),
      `${locale}: news article ids must match ja`,
    );
    assert.deepEqual(
      Object.keys(content.contentPages.lifeTopics).sort(),
      Object.keys(reference.contentPages.lifeTopics).sort(),
      `${locale}: life topic ids must match ja`,
    );
  }
});

test("site-content ids resolve to a label in every locale of every tenant", () => {
  for (const tenantKey of TENANT_KEYS) {
    for (const locale of locales) {
      const t = buildDictionary(tenantKey, locale);

      for (const category of lifeCategories) {
        assert.ok(
          t.findInfo.lifeInfo.items[category.id]?.trim(),
          `${tenantKey}/${locale}: missing label for category ${category.id}`,
        );
        for (const topic of category.topics) {
          assert.ok(
            t.contentPages.lifeTopics[topic.id]?.trim(),
            `${tenantKey}/${locale}: missing label for topic ${topic.id}`,
          );
          assert.ok(
            t.contentPages.lifeTopicSummaries[topic.id]?.trim(),
            `${tenantKey}/${locale}: missing summary for topic ${topic.id}`,
          );
        }
      }

      for (const article of newsArticles) {
        assert.ok(
          t.news.articles[article.id]?.trim(),
          `${tenantKey}/${locale}: missing headline for news ${article.id}`,
        );
        assert.ok(
          t.contentPages.newsSummaries[article.id]?.trim(),
          `${tenantKey}/${locale}: missing summary for news ${article.id}`,
        );
      }
    }
  }
});

test("the built dictionary merges chrome and tenant content without losing keys", () => {
  for (const locale of locales) {
    const t = defaultTenantDictionaries[locale];
    const chrome = chromeDictionaries[locale];
    const content = lgContent[locale];

    // Chrome keys survive the merge at every nesting level that is merged.
    assert.equal(t.nav.access, chrome.nav.access);
    assert.equal(t.findInfo.title, chrome.findInfo.title);
    assert.equal(t.news.title, chrome.news.title);
    assert.equal(t.contentPages.breadcrumbLabel, chrome.contentPages.breadcrumbLabel);
    assert.equal(t.footer.terms, chrome.footer.terms);

    // Tenant keys win where the tenant owns them.
    assert.equal(t.siteName, content.siteName);
    assert.equal(t.findInfo.lifeInfo.sectionLabel, content.findInfo.lifeInfo.sectionLabel);
    assert.equal(t.news.articles.assembly, content.news.articles.assembly);
    assert.equal(t.contentPages.lifeIndexTitle, content.contentPages.lifeIndexTitle);
    assert.equal(t.footer.address, content.footer.address);
  }
});

test("building the same tenant and locale twice returns a stable reference", () => {
  // useI18n() passes the dictionary through context; a new object per render
  // would change the context value on every render.
  for (const locale of locales) {
    assert.strictEqual(
      buildDictionary(DEFAULT_TENANT_KEY, locale),
      buildDictionary(DEFAULT_TENANT_KEY, locale),
    );
  }
});
