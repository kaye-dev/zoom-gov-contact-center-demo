import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { NewsArticleView } from '../../components/InformationPageViews';
import { getNewsArticle, newsArticles } from '../../content/site-content';
import { defaultLocale, dictionaries } from '../../i18n/dictionaries';

type NewsPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return newsArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: NewsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getNewsArticle(slug);
  if (!article) return {};

  const dictionary = dictionaries[defaultLocale];
  const title = dictionary.news.articles[article.id];

  return {
    title: `${title} | ${dictionary.cityName}`,
    description: dictionary.contentPages.newsSummaries[article.id],
  };
}

export default async function NewsArticlePage({ params }: NewsPageProps) {
  const { slug } = await params;
  const article = getNewsArticle(slug);
  if (!article) notFound();

  return <NewsArticleView article={article} />;
}
