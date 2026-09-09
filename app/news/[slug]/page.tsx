import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { NewsArticleView } from '../../components/InformationPageViews';
import {
  getNewsArticle,
  listAllTenantNewsSlugs,
} from '../../content/site-content';
import { getRequestTenant } from '../../../lib/server/tenant';
import { getRequestDictionary } from '../../i18n/server-dictionary';
import { UniversityPortal } from '@/app/tenants/univ/UniversityPortal';

type NewsPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return listAllTenantNewsSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: NewsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getRequestTenant();
  if (tenant.features.universityPortal) return {};
  const article = getNewsArticle(tenant.key, slug);
  if (!article) return {};

  const dictionary = await getRequestDictionary();
  const title = dictionary.news.articles[article.id];

  return {
    title: `${title} | ${dictionary.siteName}`,
    description: dictionary.contentPages.newsSummaries[article.id],
  };
}

export default async function NewsArticlePage({ params }: NewsPageProps) {
  const { slug } = await params;
  const tenant = await getRequestTenant();
  if (tenant.features.universityPortal) return <UniversityPortal page="news" />;
  const article = getNewsArticle(tenant.key, slug);
  if (!article) notFound();

  return <NewsArticleView article={article} />;
}
