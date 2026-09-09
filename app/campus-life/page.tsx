import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UniversityPortal } from "@/app/tenants/univ/UniversityPortal";
import { getRequestTenant } from "@/lib/server/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  return { title: `学生生活 | ${tenant.metadata.shortName}` };
}

export default async function Page() {
  if (!(await getRequestTenant()).features.universityPortal) notFound();
  return <UniversityPortal page="campus-life" />;
}
