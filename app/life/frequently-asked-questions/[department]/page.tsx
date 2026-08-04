import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqDepartmentView } from "../../../components/FaqPageViews";
import { defaultLocale, dictionaries } from "../../../i18n/dictionaries";
import {
  getFaqDepartmentPageData,
  getFaqDepartmentStaticParams,
} from "../../../../lib/faq-content";

type FaqDepartmentPageProps = {
  params: Promise<{ department: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getFaqDepartmentStaticParams();
}

export async function generateMetadata({ params }: FaqDepartmentPageProps): Promise<Metadata> {
  const { department: departmentSlug } = await params;
  const department = getFaqDepartmentPageData(departmentSlug);
  if (!department) return {};

  const dictionary = dictionaries[defaultLocale];
  const title = department.labels[defaultLocale];
  return {
    title: `${title} | ${dictionary.findInfo.lifeInfo.items.faq} | ${dictionary.cityName}`,
    description: dictionary.contentPages.faq.departmentLead.replace("{name}", title),
  };
}

export default async function FaqDepartmentPage({ params }: FaqDepartmentPageProps) {
  const { department: departmentSlug } = await params;
  const data = getFaqDepartmentPageData(departmentSlug);
  if (!data) notFound();

  return <FaqDepartmentView data={data} />;
}
