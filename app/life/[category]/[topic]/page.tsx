import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LifeTopicView } from '../../../components/InformationPageViews';
import { getLifeTopic, lifeCategories } from '../../../content/site-content';
import { getRequestDictionary } from "../../../i18n/server-dictionary";

type TopicPageProps = {
  params: Promise<{ category: string; topic: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return lifeCategories.flatMap((category) =>
    category.topics.map((topic) => ({ category: category.slug, topic: topic.slug })),
  );
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { category: categorySlug, topic: topicSlug } = await params;
  const result = getLifeTopic(categorySlug, topicSlug);
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
  const result = getLifeTopic(categorySlug, topicSlug);
  if (!result) notFound();

  return <LifeTopicView category={result.category} topic={result.topic} />;
}
