import { auth } from "@/lib/auth";

export type AppSession = Awaited<ReturnType<typeof auth.api.getSession>>;

type AppSessionUser = NonNullable<AppSession>["user"] & {
  mustChangePassword?: boolean | null;
  role?: string | null;
};

export async function getAppSession(headers: Headers) {
  return auth.api.getSession({ headers });
}

export function isAdminSession(session: AppSession) {
  return getSessionUser(session)?.role === "admin";
}

export function shouldChangePassword(session: AppSession) {
  return Boolean(getSessionUser(session)?.mustChangePassword);
}

export function getSessionUser(session: AppSession) {
  return session?.user as AppSessionUser | undefined;
}
