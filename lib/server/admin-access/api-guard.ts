import {
  canAdminAccess,
  evaluateAdminAccess,
} from "@/lib/admin-access/authorization";
import type {
  AdminAccessAction,
  AdminResourceKey,
} from "@/lib/admin-access/types";
import type { AppAuth } from "@/lib/auth";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { getAppSession, getSessionUser } from "@/lib/server/auth/helpers";

import { getAdminAccessActor } from "./queries";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export const ADMIN_ACCESS_API_ERROR_CODES = {
  authenticationRequired: "AUTHENTICATION_REQUIRED",
  passwordChangeRequired: "PASSWORD_CHANGE_REQUIRED",
  accessDenied: "ADMIN_ACCESS_DENIED",
} as const;

export async function authorizeAdminApi(
  auth: AppAuth,
  prisma: PrismaLike,
  headers: Headers,
  resourceKey: AdminResourceKey,
  action: AdminAccessAction,
) {
  const session = await getAppSession(auth, headers);
  const sessionUser = getSessionUser(session);

  if (!sessionUser) {
    return {
      ok: false as const,
      status: 401 as const,
      error: ADMIN_ACCESS_API_ERROR_CODES.authenticationRequired,
    };
  }

  const actor = await getAdminAccessActor(prisma, sessionUser.id);
  if (!actor || actor.banned) {
    return {
      ok: false as const,
      status: 403 as const,
      error: ADMIN_ACCESS_API_ERROR_CODES.accessDenied,
    };
  }

  if (actor.mustChangePassword) {
    return {
      ok: false as const,
      status: 403 as const,
      error: ADMIN_ACCESS_API_ERROR_CODES.passwordChangeRequired,
    };
  }

  const decision = evaluateAdminAccess(actor, resourceKey, action);
  if (!canAdminAccess(actor, resourceKey, action)) {
    return {
      ok: false as const,
      status: 403 as const,
      error: ADMIN_ACCESS_API_ERROR_CODES.accessDenied,
      decision,
    };
  }

  return { ok: true as const, session, actor, decision };
}
