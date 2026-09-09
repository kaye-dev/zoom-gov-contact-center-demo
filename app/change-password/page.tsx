import { redirect } from "next/navigation";
import { safeAdminCallback } from "@/lib/admin-routing";

export default async function LegacyAuthPage({ searchParams }: { searchParams: Promise<{ callbackURL?: string | string[] }> }) {
  const callbackURL = safeAdminCallback((await searchParams).callbackURL);
  redirect(`/admin/change-password?callbackURL=${encodeURIComponent(callbackURL)}`);
}
