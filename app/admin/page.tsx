import { redirect } from "next/navigation";
import { adminHomeDestination } from "@/lib/admin-routing";

export default async function AdminPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(adminHomeDestination(await searchParams));
}
