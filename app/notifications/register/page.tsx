import { getSettingsReview } from "@/lib/server/admin-settings-review";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await getRequestTenant()).key !== "univ") notFound();
  const now = new Date();
  const query = await searchParams;
  const reviewState =
    (await getSettingsReview("default")) && typeof query.state === "string"
      ? query.state
      : undefined;
  return (
    <UniversityPortal page="registration">
      <StudentNotificationRegistration
        reviewState={reviewState}
        admissionYears={admissionYears(now)}
        serverDate={now.toISOString()}
      />
    </UniversityPortal>
  );
}
