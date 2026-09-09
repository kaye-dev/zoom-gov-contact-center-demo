import { withPrisma } from "@/lib/server/prisma";
import { getRegistrationReception } from "@/lib/server/zaad/registration-reception";
import { RegistrationClosed } from "./RegistrationClosed";
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
  const reception = await withPrisma(db => getRegistrationReception(db, tenant.key));
  const callerNotices = tenant.key === "lg" ? await withPrisma(db => db.municipalCallerNotice.findMany({ where: { siteKey: "lg", publishedAt: { lte: new Date() } }, orderBy: { departmentKey: "asc" }, select: { departmentKey: true, callerPhone: true, officeUrl: true } })) : [];
  if (tenant.key === "lg") return <div className="flex min-h-screen flex-col"><Header /><main className="flex-1">{reception.enabled ? <MunicipalNotificationRegistration callerNotices={callerNotices} /> : <RegistrationClosed />}</main><Footer /></div>;
  const now = new Date();
  return (
    <UniversityPortal page="registration">
      {reception.enabled ? <StudentNotificationRegistration
        admissionYears={admissionYears(now)}
        serverDate={now.toISOString()}
      /> : <RegistrationClosed />}
    </UniversityPortal>
  );
}
