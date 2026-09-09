import { TENANT_KEYS, type TenantKey } from '@/lib/tenants';

import { lgLifeCategories, lgNewsArticles } from '../tenants/lg/site-content';

export type LifeTopic = {
  id: string;
  slug: string;
  sourceUrl: string;
};

export type LifeCategory = {
  id: string;
  slug: string;
  icon: string;
  sourceUrl: string;
  topics: readonly LifeTopic[];
};

export type NewsArticle = {
  id: string;
  slug: string;
  date: string;
  category: 'new' | 'featured';
  image?: string;
  sourceUrl: string;
};

type TenantSiteContent = {
  lifeCategories: readonly LifeCategory[];
  newsArticles: readonly NewsArticle[];
};

/**
 * 業種テナントごとの公開コンテンツ構造。
 *
 * 表示文言は辞書側（app/tenants/<key>/content.ts）が持ち、このモジュールは
 * ルート、slug、アイコン、参照URLだけを持つ。両者は id で結び付き、
 * test/tenant-content.test.ts が全ロケール分の対応を検証する。
 */
const TENANT_SITE_CONTENT: Record<TenantKey, TenantSiteContent> = {
  lg: {
    lifeCategories: lgLifeCategories,
    newsArticles: lgNewsArticles,
  },
  univ: { lifeCategories: [], newsArticles: [] },
};

export function getLifeCategories(tenantKey: TenantKey): readonly LifeCategory[] {
  return TENANT_SITE_CONTENT[tenantKey].lifeCategories;
}

export function getNewsArticles(tenantKey: TenantKey): readonly NewsArticle[] {
  return TENANT_SITE_CONTENT[tenantKey].newsArticles;
}

export function getLifeCategory(tenantKey: TenantKey, slug: string) {
  return getLifeCategories(tenantKey).find((category) => category.slug === slug);
}

export function getLifeTopic(
  tenantKey: TenantKey,
  categorySlug: string,
  topicSlug: string,
) {
  const category = getLifeCategory(tenantKey, categorySlug);
  const topic = category?.topics.find((item) => item.slug === topicSlug);

  return category && topic ? { category, topic } : undefined;
}

export function getNewsArticle(tenantKey: TenantKey, slug: string) {
  return getNewsArticles(tenantKey).find((article) => article.slug === slug);
}

/**
 * generateStaticParams はビルド時に走りHostを見られないため、全テナントの
 * slugの和集合を返す。現在のテナントに属さないslugはページ側で notFound() にする。
 */
export function listAllTenantLifeCategorySlugs(): string[] {
  return unique(
    TENANT_KEYS.flatMap((tenantKey) =>
      getLifeCategories(tenantKey)
        .filter((category) => category.id !== 'faq')
        .map((category) => category.slug),
    ),
  );
}

export function listAllTenantLifeTopicSlugs(): Array<{
  category: string;
  topic: string;
}> {
  const seen = new Set<string>();
  const result: Array<{ category: string; topic: string }> = [];

  for (const tenantKey of TENANT_KEYS) {
    for (const category of getLifeCategories(tenantKey)) {
      for (const topic of category.topics) {
        const key = `${category.slug}/${topic.slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ category: category.slug, topic: topic.slug });
      }
    }
  }

  return result;
}

export function listAllTenantNewsSlugs(): string[] {
  return unique(
    TENANT_KEYS.flatMap((tenantKey) =>
      getNewsArticles(tenantKey).map((article) => article.slug),
    ),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
