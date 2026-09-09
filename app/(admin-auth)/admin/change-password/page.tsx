import { safeAdminCallback } from "@/lib/admin-routing";
import { requireSession } from "@/lib/server/auth/server";

import { ChangePasswordForm } from "@/app/change-password/ChangePasswordForm";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ callbackURL?: string | string[] }> }) {
  const callbackURL = safeAdminCallback((await searchParams).callbackURL);
  await requireSession(callbackURL);

  return (
    <main className="min-h-screen bg-surface px-4 py-12 text-fg">
      <ChangePasswordForm callbackURL={callbackURL} />
    </main>
  );
}
