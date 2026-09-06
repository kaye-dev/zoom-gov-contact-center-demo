import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqDetailView } from "../../../../components/FaqPageViews";
import { defaultLocale } from "../../../../i18n/dictionaries";
import { getRequestDictionary } from "../../../../i18n/server-dictionary";
import {
  getFaqCategoryStaticParams,
  getFaqDetailPageData,
} from "../../../../../lib/faq-content";
import { getRequestTenant } from "../../../../../lib/server/tenant";

type FaqDetailPageProps = {
  params: Promise<{ department: string; faq: string }>;
};

export const dynamicParams = true;

export function generateStaticParams() {
  return getFaqCategoryStaticParams();
}

export async function generateMetadata({ params }: FaqDetailPageProps): Promise<Metadata> {
  const { department: departmentSlug, faq: faqSlug } = await params;
  const tenant = await getRequestTenant();
  const data = getFaqDetailPageData(departmentSlug, faqSlug, tenant.key);
  if (!data) return {};

  const dictionary = await getRequestDictionary();
  const title = data.category.labels[defaultLocale];
  return {
    title: `${title} | ${dictionary.findInfo.lifeInfo.items.faq} | ${dictionary.siteName}`,
    description: dictionary.contentPages.faq.categoryLead.replace("{name}", title),
  };
}

export default async function FaqDetailPage({ params }: FaqDetailPageProps) {
  const { department: departmentSlug, faq: faqSlug } = await params;
  const tenant = await getRequestTenant();
  const data = getFaqDetailPageData(departmentSlug, faqSlug, tenant.key);
  if (!data) notFound();

  return <FaqDetailView data={data} />;
}
