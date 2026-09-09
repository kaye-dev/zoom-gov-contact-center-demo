import { safeAdminCallback } from "@/lib/admin-routing";
import { LoginForm } from "@/app/login/LoginForm";

type LoginPageProps = {
  searchParams: Promise<{
    callbackURL?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackURL = safeAdminCallback(params.callbackURL);

  return (
    <main className="min-h-screen bg-surface px-4 py-12 text-fg">
      <LoginForm callbackURL={callbackURL} />
    </main>
  );
}
