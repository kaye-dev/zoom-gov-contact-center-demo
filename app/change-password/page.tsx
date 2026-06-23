import { requireSession } from "@/lib/server/auth/server";

import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  await requireSession("/change-password");

  return (
    <main className="min-h-screen bg-surface px-4 py-12 text-fg">
      <ChangePasswordForm />
    </main>
  );
}
