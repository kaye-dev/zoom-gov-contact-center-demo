import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqDepartmentView } from "../../../components/FaqPageViews";
import { defaultLocale } from "../../../i18n/dictionaries";
import { getRequestDictionary } from "../../../i18n/server-dictionary";
import {
  getFaqDepartmentPageData,
  getFaqDepartmentStaticParams,
} from "../../../../lib/faq-content";
import { getRequestTenant } from "../../../../lib/server/tenant";

type FaqDepartmentPageProps = {
  params: Promise<{ department: string }>;
};

export const dynamicParams = true;

export function generateStaticParams() {
  return getFaqDepartmentStaticParams();
}

export async function generateMetadata({ params }: FaqDepartmentPageProps): Promise<Metadata> {
  const { department: departmentSlug } = await params;
  const tenant = await getRequestTenant();
  const department = getFaqDepartmentPageData(departmentSlug, tenant.key);
  if (!department) return {};

  const dictionary = await getRequestDictionary();
  const title = department.labels[defaultLocale];
  return {
    title: `${title} | ${dictionary.findInfo.lifeInfo.items.faq} | ${dictionary.siteName}`,
    description: dictionary.contentPages.faq.departmentLead.replace("{name}", title),
  };
}

export default async function FaqDepartmentPage({ params }: FaqDepartmentPageProps) {
  const { department: departmentSlug } = await params;
  const tenant = await getRequestTenant();
  const data = getFaqDepartmentPageData(departmentSlug, tenant.key);
  if (!data) notFound();

  return <FaqDepartmentView data={data} />;
}
