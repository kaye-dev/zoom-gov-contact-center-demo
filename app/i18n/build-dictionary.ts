import { videoConsultationDictionaries } from "./video-consultation";
import { siteAccessDictionaries } from "./site-access";
import { municipalWorkflowDictionaries } from "./municipal-workflows";
import { outreachCommonDictionaries } from "./outreach-common";
import { municipalOutreachDictionaries } from "./municipal-outreach";
import { universityOutreachDictionaries } from "./university-outreach";
import { DEFAULT_TENANT_KEY, type TenantKey } from '@/lib/tenants';

import { lgContent } from '../tenants/lg/content';
import { univContent } from '../tenants/univ/content';
import { chromeDictionaries, type Dictionary, type Locale } from './dictionaries';
import type { TenantContentDictionary } from './tenant-content';

/**
 * 業種テナントごとのコンテンツパック。
 *
 * 現状は静的importで全テナント分をバンドルする。テナントが増えてバンドルサイズが
 * 問題になった場合は、この対応表の内部だけを動的importへ置き換えられる。
 */
const TENANT_CONTENT: Record<TenantKey, Record<Locale, TenantContentDictionary>> = {
  lg: lgContent,
  // The legacy dictionary only supplies shared provider chrome. University
  // pages read their dedicated content model directly and never render these
  // municipal labels.
  univ: Object.fromEntries(
    (Object.keys(lgContent) as Locale[]).map((locale) => [
      locale,
      {
        ...lgContent[locale],
        siteName: univContent[locale].siteName,
        siteNameRoman: univContent[locale].siteNameRoman,
      },
    ]),
  ) as Record<Locale, TenantContentDictionary>,
};

const cache = new Map<string, Dictionary>();

/**
 * 共通クロームと業種コンテンツを合成して、画面が参照する辞書を作る。
 *
 * 合成結果はロケールとテナントの組ごとに使い回す。辞書は不変な定数から作られる
 * ため、レンダーごとに新しいオブジェクトを返すとcontextの参照が毎回変わってしまう。
 */
export function buildDictionary(
  tenantKey: TenantKey,
  locale: Locale,
): Dictionary {
  const cacheKey = `${tenantKey}:${locale}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const chrome = chromeDictionaries[locale];
  const content = TENANT_CONTENT[tenantKey][locale];

  const dictionary: Dictionary = {
    ...chrome,
    videoConsultation: videoConsultationDictionaries[locale],
    siteAccess: siteAccessDictionaries[locale],
    universityOutreach: universityOutreachDictionaries[locale],
    municipalOutreach: municipalOutreachDictionaries[locale],
    outreachCommon: outreachCommonDictionaries[locale],
    municipalWorkflows: municipalWorkflowDictionaries[locale],
    siteName: content.siteName,
    siteNameRoman: content.siteNameRoman,
    findInfo: {
      ...chrome.findInfo,
      lifeInfo: content.findInfo.lifeInfo,
    },
    news: {
      ...chrome.news,
      articles: content.news.articles,
    },
    contentPages: {
      ...chrome.contentPages,
      ...content.contentPages,
    },
    footer: {
      ...chrome.footer,
      ...content.footer,
    },
  };

  cache.set(cacheKey, dictionary);
  return dictionary;
}

/**
 * 既定テナントの全ロケール辞書。
 *
 * テナントを解決できない文脈（テストなど）専用。リクエストを処理する場面では
 * Hostが決めたテナントを使う必要があるため、代わりに
 * app/i18n/server-dictionary.ts の getRequestDictionary() を使う。
 */
export const defaultTenantDictionaries: Record<Locale, Dictionary> =
  Object.fromEntries(
    (Object.keys(chromeDictionaries) as Locale[]).map((locale) => [
      locale,
      buildDictionary(DEFAULT_TENANT_KEY, locale),
    ]),
  ) as Record<Locale, Dictionary>;
