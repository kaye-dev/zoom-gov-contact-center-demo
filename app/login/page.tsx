import { LoginForm } from "./LoginForm";

type LoginPageProps = {
  searchParams: Promise<{
    callbackURL?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackURL = normalizeCallbackURL(params.callbackURL);

  return (
    <main className="min-h-screen bg-surface px-4 py-12 text-fg">
      <LoginForm callbackURL={callbackURL} />
    </main>
  );
}

function normalizeCallbackURL(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return "/admin";
  }

  return candidate;
}
