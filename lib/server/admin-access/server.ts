import { cache } from "react";
import { redirect } from "next/navigation";

import {
  canAdminAccess,
  evaluateAdminAccess,
} from "@/lib/admin-access/authorization";
import type {
  AdminAccessAction,
  AdminResourceKey,
} from "@/lib/admin-access/types";
import { getSessionUser } from "@/lib/server/auth/helpers";
import { requirePasswordReadySession } from "@/lib/server/auth/server";
import { withPrisma } from "@/lib/server/prisma";

import { getAdminAccessActor } from "./queries";

const loadCurrentAdminAccessActor = cache(async (userId: string) =>
  withPrisma((prisma) => getAdminAccessActor(prisma, userId)),
);

export async function getCurrentAdminAccessActor(callbackURL = "/admin") {
  const session = await requirePasswordReadySession(callbackURL);
  const sessionUser = getSessionUser(session)!;
  const actor = await loadCurrentAdminAccessActor(sessionUser.id);

  if (!actor || actor.banned) {
    redirect(`/login?callbackURL=${encodeURIComponent(callbackURL)}`);
  }

  return { session, actor };
}

export async function requireAdminAccess(
  resourceKey: AdminResourceKey,
  action: AdminAccessAction,
  callbackURL: string,
) {
  const context = await getCurrentAdminAccessActor(callbackURL);
  const decision = evaluateAdminAccess(context.actor, resourceKey, action);

  if (!canAdminAccess(context.actor, resourceKey, action)) {
    redirect("/admin?error=access-denied");
  }

  return { ...context, decision };
}

export async function getAdminActionDecision(
  resourceKey: AdminResourceKey,
  action: AdminAccessAction,
  callbackURL: string,
) {
  const context = await getCurrentAdminAccessActor(callbackURL);
  return {
    ...context,
    decision: evaluateAdminAccess(context.actor, resourceKey, action),
  };
}
