import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LifeTopicView } from '../../../components/InformationPageViews';
import {
  getLifeTopic,
  listAllTenantLifeTopicSlugs,
} from '../../../content/site-content';
import { getRequestTenant } from '../../../../lib/server/tenant';
import { getRequestDictionary } from "../../../i18n/server-dictionary";

type TopicPageProps = {
  params: Promise<{ category: string; topic: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return listAllTenantLifeTopicSlugs();
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { category: categorySlug, topic: topicSlug } = await params;
  const tenant = await getRequestTenant();
  const result = getLifeTopic(tenant.key, categorySlug, topicSlug);
  if (!result) return {};

  const dictionary = await getRequestDictionary();
  const title = dictionary.contentPages.lifeTopics[result.topic.id];

  return {
    title: `${title} | ${dictionary.siteName}`,
    description: dictionary.contentPages.lifeTopicSummaries[result.topic.id],
  };
}

export default async function LifeTopicPage({ params }: TopicPageProps) {
  const { category: categorySlug, topic: topicSlug } = await params;
  const tenant = await getRequestTenant();
  const result = getLifeTopic(tenant.key, categorySlug, topicSlug);
  if (!result) notFound();

  return <LifeTopicView category={result.category} topic={result.topic} />;
}
