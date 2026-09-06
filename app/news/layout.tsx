import type { ReactNode } from "react";

import { getRequestTenant } from "@/lib/server/tenant";
import { PublicInformationLayout } from "../components/PublicInformationLayout";

export default async function NewsLayout({
  children,
}: {
  children: ReactNode;
}) {
  if ((await getRequestTenant()).features.universityPortal) return children;
  return <PublicInformationLayout>{children}</PublicInformationLayout>;
}
