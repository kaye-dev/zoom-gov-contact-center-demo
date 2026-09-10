import type { Metadata } from "next";
import { Header } from "@/app/components/Header";
import { Footer } from "@/app/components/Footer";
import { MunicipalNotificationRegistration } from "./MunicipalNotificationRegistration";
import { UniversityPortal } from "@/app/tenants/univ/UniversityPortal";
import { getRequestTenant } from "@/lib/server/tenant";
import { admissionYears } from "@/lib/zaad/university/contracts";
import { StudentNotificationRegistration } from "./StudentNotificationRegistration";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  return {
    title: `オートリーチ | 電話通知の登録 | ${tenant.metadata.shortName}`,
    robots: { index: false, follow: false },
  };
}
export default async function Page() {
  const tenant = await getRequestTenant();
  if (tenant.key === "lg") return <div className="flex min-h-screen flex-col"><Header /><main className="flex-1"><MunicipalNotificationRegistration /></main><Footer /></div>;
  const now = new Date();
  return (
    <UniversityPortal page="registration">
      <StudentNotificationRegistration
        admissionYears={admissionYears(now)}
        serverDate={now.toISOString()}
      />
    </UniversityPortal>
  );
}
