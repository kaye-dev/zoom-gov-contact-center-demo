import { notFound } from "next/navigation"; import { UniversityPortal } from "@/app/tenants/univ/UniversityPortal"; import { getRequestTenant } from "@/lib/server/tenant";
export default async function Page(){ if(!(await getRequestTenant()).features.universityPortal) notFound(); return <UniversityPortal page="careers"/>; }
