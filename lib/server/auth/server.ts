import { ADMIN_REQUEST_PATH_HEADER, adminAuthHref, safeAdminCallback } from "@/lib/admin-routing";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { withAuth } from "@/lib/auth";
import {
  getSessionUser,
  isAdminSession,
  shouldChangePassword,
} from "@/lib/server/auth/helpers";

export const getCurrentSession = cache(async () => {
  const requestHeaders = await headers();

  return withAuth((auth) =>
    auth.api.getSession({
      headers: requestHeaders,
    }),
  );
});

export async function requireSession(callbackURL = "/admin") {
  const session = await getCurrentSession();

  if (!session) {
    redirect(adminAuthHref("login", await currentAdminCallback(callbackURL)));
  }

  return session;
}

export async function requirePasswordReadySession(callbackURL = "/admin") {
  const session = await requireSession(callbackURL);

  if (shouldChangePassword(session)) {
    redirect(adminAuthHref("change-password", await currentAdminCallback(callbackURL)));
  }

  return session;
}

export async function requireAdminSession(callbackURL = "/admin") {
  const session = await requirePasswordReadySession(callbackURL);

  if (!isAdminSession(session)) {
    redirect("/admin");
  }

  return session;
}

export async function getCurrentUser() {
  const session = await getCurrentSession();

  return getSessionUser(session);
}

export async function currentAdminCallback(fallback = "/admin") {
  const requestHeaders = await headers();
  return safeAdminCallback(requestHeaders.get(ADMIN_REQUEST_PATH_HEADER) ?? fallback);
}
