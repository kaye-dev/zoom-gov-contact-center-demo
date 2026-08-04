import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqDetailView } from "../../../../components/FaqPageViews";
import { defaultLocale, dictionaries } from "../../../../i18n/dictionaries";
import {
  getFaqCategoryStaticParams,
  getFaqDetailPageData,
} from "../../../../../lib/faq-content";

type FaqDetailPageProps = {
  params: Promise<{ department: string; faq: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getFaqCategoryStaticParams();
}

export async function generateMetadata({ params }: FaqDetailPageProps): Promise<Metadata> {
  const { department: departmentSlug, faq: faqSlug } = await params;
  const data = getFaqDetailPageData(departmentSlug, faqSlug);
  if (!data) return {};

  const dictionary = dictionaries[defaultLocale];
  const title = data.category.labels[defaultLocale];
  return {
    title: `${title} | ${dictionary.findInfo.lifeInfo.items.faq} | ${dictionary.cityName}`,
    description: dictionary.contentPages.faq.categoryLead.replace("{name}", title),
  };
}

export default async function FaqDetailPage({ params }: FaqDetailPageProps) {
  const { department: departmentSlug, faq: faqSlug } = await params;
  const data = getFaqDetailPageData(departmentSlug, faqSlug);
  if (!data) notFound();

  return <FaqDetailView data={data} />;
}
