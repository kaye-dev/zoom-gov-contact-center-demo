import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LifeCategoryView } from '../../components/InformationPageViews';
import { getLifeCategory, lifeCategories } from '../../content/site-content';
import { getRequestDictionary } from "../../i18n/server-dictionary";

type CategoryPageProps = {
  params: Promise<{ category: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return lifeCategories
    .filter((category) => category.id !== 'faq')
    .map((category) => ({ category: category.slug }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: categorySlug } = await params;
  const category = getLifeCategory(categorySlug);
  if (!category) return {};

  const dictionary = await getRequestDictionary();
  const title = dictionary.findInfo.lifeInfo.items[category.id];

  return {
    title: `${title} | ${dictionary.siteName}`,
    description: dictionary.contentPages.categoryLead.replace('{name}', title),
  };
}

export default async function LifeCategoryPage({ params }: CategoryPageProps) {
  const { category: categorySlug } = await params;
  const category = getLifeCategory(categorySlug);
  if (!category) notFound();

  return <LifeCategoryView category={category} />;
}
