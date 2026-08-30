import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { handle } from "hono/vercel";

import { createAuth, type AppAuth } from "@/lib/auth";
import { canAdminAccess } from "@/lib/admin-access/authorization";
import {
  parseAdminRoleMetadata,
  parsePermissionMatrix,
} from "@/lib/admin-access/validation";
import {
  ADMIN_USER_ERROR_CODES,
  parseAdminUserPasswordReset,
  parseAdminUserUpdate,
} from "@/lib/admin-users";
import { generateTemporaryPassword } from "@/lib/password-policy";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  countDemoRecords,
  createDemoRecord,
  ensureDatabase,
  listDemoRecords,
  MAX_DEMO_RECORD_MESSAGE_LENGTH,
} from "@/lib/server/db";
import {
  getAppSession,
  getSessionUser,
  shouldChangePassword,
} from "@/lib/server/auth/helpers";
import { authorizeAdminApi } from "@/lib/server/admin-access/api-guard";
import {
  AdminAccessServiceError,
  createAdminRole,
  deleteProtectedAdminUser,
  deleteAdminRole,
  reactivateAdminUser,
  replaceAdminRolePermissions,
  replaceUserAdminAccessRoles,
  runAuthorizedAdminUserCreation,
  runAuthorizedAdminUserOperation,
  suspendProtectedAdminUser,
  updateAdminRoleMetadata,
  updateProtectedAdminUserRole,
} from "@/lib/server/admin-access/authority-service";
import {
  getAdminRoleDetail,
  listAdminRoleMemberCandidates,
  listAdminRoleMembers,
  listAdminRoles,
  parseAdminRoleDirectoryInput,
} from "@/lib/server/admin-access/queries";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
  hasDatabaseConfiguration,
} from "@/lib/server/prisma";
import { saveChatSettings } from "@/lib/server/chat-settings";
import { savePhoneSettings } from "@/lib/server/phone-settings";
import { saveLanguageSettings } from "@/lib/server/site-settings";
import { saveMaintenanceSettings } from "@/lib/server/maintenance-settings-write";
import { createBoundedPasswordResetRequest } from "@/lib/server/password-reset-requests";
import { parseChatSettings } from "@/lib/chat-settings";
import { parsePhoneSettings } from "@/lib/phone-settings";
import {
  DEVELOPER_API_ERROR_CODES,
  parseDeveloperApiSecretReveal,
  parseDeveloperApiSettings,
} from "@/lib/developer-api-settings";
import {
  DeveloperApiEncryptionUnavailableError,
} from "@/lib/server/developer-api-crypto";
import {
  revealDeveloperApiSecret,
  saveDeveloperApiSettings,
} from "@/lib/server/developer-api-settings";
import { MAINTENANCE_SETTINGS_CONFLICT_CODE } from "@/lib/maintenance-config";
import {
  SETTINGS_ERROR_CODES,
  parseLanguageSettings,
} from "@/lib/site-settings";
import {
  RESERVATION_ERROR_CODES,
  isReservationMonthInRange,
  isReservationServiceKey,
} from "@/lib/reservations";
import {
  getReservationCalendarSnapshot,
  regenerateDemoReservations,
} from "@/lib/server/reservations";
import {
  RESERVATION_API_ERROR_CODES,
  parseReservationApiKeyIssue,
  parseReservationApiKeyRevoke,
  parseReservationApiUsageLimit,
  parseReservationId,
  parseReservationList,
  parseReservationPatch,
  parseReservationWrite,
  type ReservationApiPermission,
} from "@/lib/reservation-api";
import {
  authenticateReservationApiRequest,
  issueReservationApiKey,
  listReservationApiKeys,
  revokeReservationApiKey,
  updateReservationApiKeyUsageLimit,
} from "@/lib/server/reservation-api-keys";
import {
  getReservationApiUsageSnapshot,
  updateReservationApiUsageLimit,
} from "@/lib/server/reservation-api-usage";
import {
  ReservationApiOperationError,
  createPublicReservation,
  deletePublicReservation,
  getPublicReservation,
  listPublicReservations,
  updatePublicReservation,
} from "@/lib/server/public-reservations";

export const runtime = "nodejs";

type AppEnvironment = {
  Variables: {
    auth: AppAuth;
    prisma: PrismaClient;
  };
};

const app = new Hono<AppEnvironment>().basePath("/api");

app.use("*", async (c, next) => {
  if (isDatabaseFreeRequest(c.req.raw)) {
    await next();
    return;
  }

  const database = createDatabaseContext();

  try {
    await connectDatabaseWithRetry(database.prisma);
    c.set("prisma", database.prisma);
    c.set("auth", createAuth(database.prisma));
    await next();
  } finally {
    await database.close();
  }
});

const USER_ROLES = ["user", "admin"] as const;

app.get("/health", async (c) => {
  const prisma = c.get("prisma");
  await ensureDatabase(prisma);

  return c.json({
    status: "ok",
    database: {
      driver: "postgresql",
      orm: "prisma",
      configured: hasDatabaseConfiguration(),
      demoRecordCount: await countDemoRecords(prisma),
    },
  });
});

app.get("/demo-records", async (c) => {
  const prisma = c.get("prisma");
  return c.json({
    records: await listDemoRecords(prisma),
  });
});

app.post("/demo-records", async (c) => {
  // This endpoint is only a local database-development aid. Keeping an
  // unauthenticated production writer would allow arbitrary database growth,
  // so fail before opening a database connection in production.
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Not found." }, 404);
  }

  const prisma = c.get("prisma");
  const body = await readJsonBody(c.req.raw);

  if (!isDemoRecordPayload(body)) {
    return c.json({ error: "Request body must include a message string." }, 400);
  }

  const message = body.message.trim();
  if (message.length === 0) {
    return c.json({ error: "Message must not be empty." }, 400);
  }

  if (message.length > MAX_DEMO_RECORD_MESSAGE_LENGTH) {
    return c.json(
      {
        error: `Message must be ${MAX_DEMO_RECORD_MESSAGE_LENGTH} characters or fewer.`,
      },
      400,
    );
  }

  return c.json({ record: await createDemoRecord(prisma, message) }, 201);
});

app.post("/password-reset-requests", async (c) => {
  const prisma = c.get("prisma");
  const body = await readJsonBody(c.req.raw);

  if (!isEmailPayload(body)) {
    return c.json({ error: "Request body must include an email string." }, 400);
  }

  const email = normalizeEmail(body.email);
  if (!isEmail(email)) {
    return c.json({ error: "Email address is invalid." }, 400);
  }

  await createBoundedPasswordResetRequest(prisma, email);

  return c.json({ ok: true });
});

app.get("/admin/password-reset-requests", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "password-reset-requests",
    "VIEW",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const requests = await prisma.passwordResetRequest.findMany({
    orderBy: { requestedAt: "desc" },
    take: 100,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          mustChangePassword: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return c.json({ requests });
});

app.post("/admin/password-reset-requests/:id/approve", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "password-reset-requests",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }
  const session = authorization.session;

  const reviewer = getSessionUser(session);
  const request = await prisma.passwordResetRequest.findUnique({
    where: { id: c.req.param("id") },
    include: { user: true },
  });

  if (!request || request.status !== "PENDING") {
    return c.json({ error: "Pending password reset request not found." }, 404);
  }

  if (!request.user) {
    return c.json({ error: "The requested email does not match a user." }, 400);
  }

  const targetUserId = request.user.id;
  const temporaryPassword = generateTemporaryPassword();
  const issuedAt = new Date();

  try {
    await runAuthorizedAdminUserOperation(
      prisma,
      authorization.actor.id,
      targetUserId,
      { resourceKey: "password-reset-requests", action: "UPDATE" },
      { requireSystemFullActorForFullAccessTarget: true },
      async (transaction) => {
        const approved = await transaction.passwordResetRequest.updateMany({
          where: { id: request.id, status: "PENDING" },
          data: {
            status: "APPROVED",
            reviewedAt: issuedAt,
            reviewedByUserId: reviewer?.id,
            issuedAt,
          },
        });
        if (approved.count !== 1) {
          throw new AdminAccessServiceError(
            "PASSWORD_RESET_REQUEST_CONFLICT",
            409,
          );
        }
        await createAuth(transaction).api.setUserPassword({
          headers: c.req.raw.headers,
          body: {
            userId: targetUserId,
            newPassword: temporaryPassword,
          },
        });
        await transaction.user.update({
          where: { id: targetUserId },
          data: {
            mustChangePassword: true,
            temporaryPasswordIssuedAt: issuedAt,
          },
        });
      },
    );
  } catch (error) {
    if (error instanceof AdminAccessServiceError) {
      return c.json({ error: error.code }, error.status);
    }
    return c.json({ error: getAuthErrorMessage(error) }, getAuthErrorStatus(error));
  }

  return c.json({ temporaryPassword });
});

app.post("/admin/password-reset-requests/:id/reject", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "password-reset-requests",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }
  const session = authorization.session;

  const reviewer = getSessionUser(session);

  const result = await prisma.passwordResetRequest.updateMany({
    where: {
      id: c.req.param("id"),
      status: "PENDING",
    },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedByUserId: reviewer?.id,
    },
  });

  if (result.count === 0) {
    return c.json({ error: "Pending password reset request not found." }, 404);
  }

  return c.json({ ok: true });
});

app.get("/admin/users", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "users",
    "VIEW",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const query = (c.req.query("query") ?? c.req.query("search") ?? "")
    .trim()
    .normalize("NFKC")
    .slice(0, 100);
  const commonUserQuery = {
    where: query
      ? {
          OR: [
            { id: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ name: "asc" }, { email: "asc" }, { id: "asc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      mustChangePassword: true,
    },
  } satisfies Prisma.userFindManyArgs;
  const canViewAssignedRoles =
    canAdminAccess(authorization.actor, "roles", "VIEW") &&
    canAdminAccess(authorization.actor, "role-assignments", "VIEW");

  if (!canViewAssignedRoles) {
    const users = await prisma.user.findMany(commonUserQuery);
    return c.json({ users, total: users.length });
  }

  const users = await prisma.user.findMany({
    ...commonUserQuery,
    select: {
      ...commonUserQuery.select,
      adminAccessRoleRevision: true,
      accessRoleAssignments: {
        orderBy: { roleId: "asc" },
        select: { roleId: true },
      },
    },
  });
  return c.json({
    users: users.map(({ accessRoleAssignments, ...user }) => ({
      ...user,
      assignedRoleIds: accessRoleAssignments.map(({ roleId }) => roleId),
    })),
    total: users.length,
  });
});

app.post("/admin/users", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "users",
    "CREATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const body = await readJsonBody(c.req.raw);

  if (!isCreateUserPayload(body)) {
    return c.json(
      { error: "Request body must include name, email, and role." },
      400,
    );
  }

  const name = body.name.trim();
  const email = normalizeEmail(body.email);
  const role = body.role;

  if (!name) {
    return c.json({ error: "Name must not be empty." }, 400);
  }

  if (!isEmail(email)) {
    return c.json({ error: "Email address is invalid." }, 400);
  }

  if (!isUserRole(role)) {
    return c.json({ error: "Role must be user or admin." }, 400);
  }

  const temporaryPassword = generateTemporaryPassword();
  const issuedAt = new Date();

  try {
    const user = await runAuthorizedAdminUserCreation(
      prisma,
      authorization.actor.id,
      body.accessRoleIds,
      async (transaction) => {
        const result = await createAuth(transaction).api.createUser({
          headers: c.req.raw.headers,
          body: {
            name,
            email,
            role,
            password: temporaryPassword,
            data: {
              mustChangePassword: true,
              temporaryPasswordIssuedAt: issuedAt,
            },
          },
        });
        const user = await transaction.user.update({
          where: { id: result.user.id },
          data: {
            mustChangePassword: true,
            temporaryPasswordIssuedAt: issuedAt,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            mustChangePassword: true,
          },
        });
        return { userId: user.id, value: user };
      },
    );
    return c.json({ user, temporaryPassword }, 201);
  } catch (error) {
    if (error instanceof AdminAccessServiceError) {
      return respondWithAdminAccessServiceError(c, error);
    }
    return c.json({ error: getAuthErrorMessage(error) }, getAuthErrorStatus(error));
  }
});

app.patch("/admin/users/:id", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "users",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }
  const session = authorization.session;

  const actor = getSessionUser(session);
  const parsed = parseAdminUserUpdate(await readJsonBody(c.req.raw));

  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  const userId = c.req.param("id");
  const target = await findManagedUser(prisma, userId);

  if (!target) {
    return c.json({ error: ADMIN_USER_ERROR_CODES.userNotFound }, 404);
  }

  if (parsed.value.field === "email") {
    const existing = await prisma.user.findFirst({
      where: {
        id: { not: userId },
        email: { equals: parsed.value.value, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      return c.json({ error: ADMIN_USER_ERROR_CODES.emailAlreadyExists }, 409);
    }
  }

  try {
    if (parsed.value.field === "role") {
      const user = await updateProtectedAdminUserRole(
        prisma,
        actor!.id,
        userId,
        parsed.value.value,
      );
      return c.json({ user });
    }

    const user = await runAuthorizedAdminUserOperation(
      prisma,
      actor!.id,
      userId,
      { resourceKey: "users", action: "UPDATE" },
      {},
      (transaction) =>
        createAuth(transaction).api.adminUpdateUser({
          headers: c.req.raw.headers,
          body: {
            userId,
            data: { [parsed.value.field]: parsed.value.value },
          },
        }),
    );
    return c.json({ user });
  } catch (error) {
    if (error instanceof AdminAccessServiceError) {
      return c.json({ error: error.code }, error.status);
    }
    if (parsed.value.field === "email") {
      const existing = await prisma.user.findFirst({
        where: {
          id: { not: userId },
          email: { equals: parsed.value.value, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        return c.json(
          { error: ADMIN_USER_ERROR_CODES.emailAlreadyExists },
          409,
        );
      }
    }
    console.error("Failed to update an admin-managed user.");
    return c.json({ error: ADMIN_USER_ERROR_CODES.updateFailed }, 500);
  }
});

app.post("/admin/users/:id/reset-password", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "users",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }
  const session = authorization.session;

  const parsed = parseAdminUserPasswordReset(await readJsonBody(c.req.raw));

  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  const userId = c.req.param("id");
  const target = await findManagedUser(prisma, userId);

  if (!target) {
    return c.json({ error: ADMIN_USER_ERROR_CODES.userNotFound }, 404);
  }

  const actor = getSessionUser(session)!;

  if (actor.id === userId) {
    return c.json({ error: ADMIN_USER_ERROR_CODES.selfProtected }, 409);
  }

  const changedAt = new Date();
  let updatedUser: { id: string; mustChangePassword: boolean };

  try {
    updatedUser = await runAuthorizedAdminUserOperation(
      prisma,
      actor.id,
      userId,
      { resourceKey: "users", action: "UPDATE" },
      { requireSystemFullActorForFullAccessTarget: true },
      async (transaction) => {
        const transactionAuth = createAuth(transaction);
        await transactionAuth.api.setUserPassword({
          headers: c.req.raw.headers,
          body: {
            userId,
            newPassword: parsed.value.password,
          },
        });
        const user = await transaction.user.update({
          where: { id: userId },
          data:
            parsed.value.mode === "temporary"
              ? {
                  mustChangePassword: true,
                  temporaryPasswordIssuedAt: changedAt,
                }
              : {
                  mustChangePassword: false,
                  temporaryPasswordIssuedAt: null,
                  passwordChangedAt: changedAt,
                },
          select: {
            id: true,
            mustChangePassword: true,
          },
        });
        await transaction.passwordResetRequest.updateMany({
          where: {
            userId,
            status: "PENDING",
          },
          data: {
            status: "REJECTED",
            reviewedAt: changedAt,
            reviewedByUserId: actor.id,
          },
        });
        await transaction.passwordResetRequest.updateMany({
          where: {
            userId,
            status: "APPROVED",
          },
          data: {
            status: "CONSUMED",
            consumedAt: changedAt,
          },
        });
        if (parsed.value.revokeSessions) {
          await transactionAuth.api.revokeUserSessions({
            headers: c.req.raw.headers,
            body: { userId },
          });
        }
        return user;
      },
    );
  } catch (error) {
    if (error instanceof AdminAccessServiceError) {
      return c.json({ error: error.code }, error.status);
    }
    console.error("Failed to reset an admin-managed user password.");
    return c.json(
      { error: ADMIN_USER_ERROR_CODES.resetPasswordFailed },
      500,
    );
  }

  return c.json({ ok: true, user: updatedUser });
});

app.post("/admin/users/:id/suspend", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "users",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }
  const session = authorization.session;

  const userId = c.req.param("id");
  const target = await findManagedUser(prisma, userId);

  if (!target) {
    return c.json({ error: ADMIN_USER_ERROR_CODES.userNotFound }, 404);
  }

  try {
    const user = await suspendProtectedAdminUser(
      prisma,
      getSessionUser(session)!.id,
      userId,
    );
    return c.json({ user });
  } catch (error) {
    if (error instanceof AdminAccessServiceError) {
      return c.json({ error: error.code }, error.status);
    }
    console.error("Failed to suspend an admin-managed user.");
    return c.json({ error: ADMIN_USER_ERROR_CODES.suspendFailed }, 500);
  }
});

app.post("/admin/users/:id/reactivate", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "users",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const userId = c.req.param("id");
  if (!(await findManagedUser(prisma, userId))) {
    return c.json({ error: ADMIN_USER_ERROR_CODES.userNotFound }, 404);
  }

  try {
    const user = await reactivateAdminUser(
      prisma,
      authorization.actor.id,
      userId,
    );
    return c.json({ user });
  } catch (error) {
    if (error instanceof AdminAccessServiceError) {
      return c.json({ error: error.code }, error.status);
    }
    console.error("Failed to reactivate an admin-managed user.");
    return c.json({ error: ADMIN_USER_ERROR_CODES.reactivateFailed }, 500);
  }
});

app.delete("/admin/users/:id", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "users",
    "DELETE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }
  const session = authorization.session;

  const userId = c.req.param("id");
  const target = await findManagedUser(prisma, userId);

  if (!target) {
    return c.json({ error: ADMIN_USER_ERROR_CODES.userNotFound }, 404);
  }

  try {
    await deleteProtectedAdminUser(
      prisma,
      getSessionUser(session)!.id,
      userId,
    );
    return c.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminAccessServiceError) {
      return c.json({ error: error.code }, error.status);
    }
    console.error("Failed to delete an admin-managed user.");
    return c.json({ error: ADMIN_USER_ERROR_CODES.deleteFailed }, 500);
  }
});

app.put("/admin/phone-settings", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "phone-settings",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const parsed = parsePhoneSettings(await readJsonBody(c.req.raw));
  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  try {
    const settings = await savePhoneSettings(prisma, parsed.value);
    return c.json({ settings });
  } catch {
    console.error("Failed to save phone settings.");
    return c.json({ error: SETTINGS_ERROR_CODES.saveFailed }, 500);
  }
});

app.put("/admin/developer-api", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "developer-api",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const parsed = parseDeveloperApiSettings(await readJsonBody(c.req.raw));
  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  try {
    const settings = await saveDeveloperApiSettings(prisma, parsed.value);
    if (!settings) {
      return c.json(
        {
          error:
            parsed.value.section === "server-to-server-oauth"
              ? DEVELOPER_API_ERROR_CODES.oauthSecretRequired
              : DEVELOPER_API_ERROR_CODES.webhookSecretRequired,
        },
        400,
      );
    }
    return c.json({ settings });
  } catch (error) {
    if (error instanceof DeveloperApiEncryptionUnavailableError) {
      return c.json(
        { error: DEVELOPER_API_ERROR_CODES.encryptionUnavailable },
        503,
      );
    }
    // Credentials, encryption keys, ciphertext, and original errors must never be logged.
    console.error("Failed to save Developer API settings.");
    return c.json({ error: DEVELOPER_API_ERROR_CODES.saveFailed }, 500);
  }
});

app.post("/admin/developer-api/reveal", async (c) => {
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "developer-api",
    "VIEW",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const parsed = parseDeveloperApiSecretReveal(await readJsonBody(c.req.raw));
  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  try {
    const value = await revealDeveloperApiSecret(prisma, parsed.value.field);
    if (value === null) {
      return c.json(
        { error: DEVELOPER_API_ERROR_CODES.secretNotConfigured },
        404,
      );
    }
    return c.json({ field: parsed.value.field, value });
  } catch (error) {
    if (error instanceof DeveloperApiEncryptionUnavailableError) {
      return c.json(
        { error: DEVELOPER_API_ERROR_CODES.encryptionUnavailable },
        503,
      );
    }
    // Credentials, encryption keys, ciphertext, and original errors must never be logged.
    console.error("Failed to reveal a Developer API secret.");
    return c.json(
      { error: DEVELOPER_API_ERROR_CODES.secretRevealFailed },
      500,
    );
  }
});

app.put("/admin/chat-settings", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "chat-settings",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const parsed = parseChatSettings(await readJsonBody(c.req.raw));
  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  try {
    await saveChatSettings(prisma, parsed.value);
    return c.json({ saved: true });
  } catch {
    // Memo fields may contain copied tags or operational notes. Never log the payload.
    console.error("Failed to save chat settings.");
    return c.json({ error: SETTINGS_ERROR_CODES.saveFailed }, 500);
  }
});

app.put("/admin/language-settings", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "language-settings",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const parsed = parseLanguageSettings(await readJsonBody(c.req.raw));
  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  try {
    const settings = await saveLanguageSettings(prisma, parsed.value);
    return c.json({ settings });
  } catch (error) {
    console.error("Failed to save language settings.", error);
    return c.json({ error: SETTINGS_ERROR_CODES.saveFailed }, 500);
  }
});

app.put("/admin/maintenance-settings", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "maintenance-settings",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  try {
    const result = await saveMaintenanceSettings(
      await readJsonBody(c.req.raw),
      {
        requestHostname: new URL(c.req.raw.url).hostname,
        prisma,
      },
    );

    if (!result.ok) {
      return c.json(
        { error: result.code },
        result.code === MAINTENANCE_SETTINGS_CONFLICT_CODE ? 409 : 400,
      );
    }

    return c.json({
      config: result.snapshot.config,
      environment: result.snapshot.environment,
      key: result.snapshot.configKey,
      effective: result.snapshot.effective,
      revision: result.snapshot.revision,
    });
  } catch {
    // Store failures can contain connection metadata. Never log the request
    // body, credentials, or original error.
    console.error("Failed to save maintenance settings.");
    return c.json({ error: SETTINGS_ERROR_CODES.saveFailed }, 500);
  }
});

app.get("/admin/reservations", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "reservations",
    "VIEW",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const now = new Date();
  const parsed = parseReservationCalendarRequest(new URL(c.req.raw.url), now);
  if (!parsed) {
    return c.json({ error: RESERVATION_ERROR_CODES.invalidRequest }, 400);
  }

  try {
    const calendar = await getReservationCalendarSnapshot(prisma, {
      ...parsed,
      now,
    });
    return c.json({ calendar });
  } catch {
    console.error("Failed to load reservation availability.");
    return c.json({ error: RESERVATION_ERROR_CODES.saveFailed }, 500);
  }
});

app.post("/admin/reservations/demo-fill", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "reservations",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const now = new Date();
  const body = await readJsonBody(c.req.raw);
  if (!isReservationDemoFillPayload(body) || !isReservationMonthInRange(body.month, now)) {
    return c.json({ error: RESERVATION_ERROR_CODES.invalidRequest }, 400);
  }

  try {
    return c.json(await regenerateDemoReservations(prisma, { month: body.month, now }));
  } catch {
    console.error("Failed to generate demo reservations.");
    return c.json({ error: RESERVATION_ERROR_CODES.saveFailed }, 500);
  }
});

app.get("/admin/reservation-api-keys", async (c) => {
  setPrivateNoStore(c);
  const authorization = await authorizeAdminApi(
    c.get("auth"), c.get("prisma"), c.req.raw.headers, "reservations", "VIEW",
  );
  if (!authorization.ok) return c.json({ error: authorization.error }, authorization.status);
  return c.json({ apiKeys: await listReservationApiKeys(c.get("prisma")) });
});

app.post("/admin/reservation-api-keys", async (c) => {
  setPrivateNoStore(c);
  const authorization = await authorizeAdminApi(
    c.get("auth"), c.get("prisma"), c.req.raw.headers, "reservations", "UPDATE",
  );
  if (!authorization.ok) return c.json({ error: authorization.error }, authorization.status);
  const input = parseReservationApiKeyIssue(await readJsonBody(c.req.raw));
  if (!input) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  try {
    return c.json(await issueReservationApiKey(c.get("prisma"), {
      ...input,
      actorId: authorization.actor.id,
    }), 201);
  } catch {
    console.error("Failed to issue a reservation API key.");
    return c.json({ error: RESERVATION_API_ERROR_CODES.operationFailed }, 500);
  }
});

app.delete("/admin/reservation-api-keys/:id", async (c) => {
  setPrivateNoStore(c);
  const authorization = await authorizeAdminApi(
    c.get("auth"), c.get("prisma"), c.req.raw.headers, "reservations", "UPDATE",
  );
  if (!authorization.ok) return c.json({ error: authorization.error }, authorization.status);
  const input = parseReservationApiKeyRevoke(await readJsonBody(c.req.raw));
  if (!input) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  const result = await revokeReservationApiKey(c.get("prisma"), {
    id: c.req.param("id"),
    expectedRevision: input.expectedRevision,
    actorId: authorization.actor.id,
  });
  if (result === "NOT_FOUND") return c.json({ error: RESERVATION_API_ERROR_CODES.keyNotFound }, 404);
  if (result === "CONFLICT") return c.json({ error: RESERVATION_API_ERROR_CODES.keyConflict }, 409);
  return c.body(null, 204);
});

app.put("/admin/reservation-api-keys/:id/usage-limit", async (c) => {
  setPrivateNoStore(c);
  const authorization = await authorizeAdminApi(
    c.get("auth"), c.get("prisma"), c.req.raw.headers, "reservations", "UPDATE",
  );
  if (!authorization.ok) return c.json({ error: authorization.error }, authorization.status);
  const input = parseReservationApiUsageLimit(await readJsonBody(c.req.raw));
  if (!input) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  const result = await updateReservationApiKeyUsageLimit(c.get("prisma"), {
    id: c.req.param("id"),
    monthlyLimit: input.mode === "UNLIMITED" ? null : input.monthlyLimit,
    expectedRevision: input.expectedRevision,
  });
  if (result.status === "NOT_FOUND") {
    return c.json({ error: RESERVATION_API_ERROR_CODES.keyNotFound }, 404);
  }
  if (result.status === "CONFLICT") {
    return c.json({ error: RESERVATION_API_ERROR_CODES.keyConflict }, 409);
  }
  return c.json({ apiKey: result.apiKey });
});

app.get("/admin/reservation-api-usage-limit", async (c) => {
  setPrivateNoStore(c);
  const authorization = await authorizeAdminApi(
    c.get("auth"), c.get("prisma"), c.req.raw.headers, "reservations", "VIEW",
  );
  if (!authorization.ok) return c.json({ error: authorization.error }, authorization.status);
  return c.json({ usageLimit: await getReservationApiUsageSnapshot(c.get("prisma")) });
});

app.put("/admin/reservation-api-usage-limit", async (c) => {
  setPrivateNoStore(c);
  const authorization = await authorizeAdminApi(
    c.get("auth"), c.get("prisma"), c.req.raw.headers, "reservations", "UPDATE",
  );
  if (!authorization.ok) return c.json({ error: authorization.error }, authorization.status);
  const input = parseReservationApiUsageLimit(await readJsonBody(c.req.raw));
  if (!input) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  const usageLimit = await updateReservationApiUsageLimit(c.get("prisma"), {
    monthlyLimit: input.mode === "UNLIMITED" ? null : input.monthlyLimit,
    expectedRevision: input.expectedRevision,
    actorId: authorization.actor.id,
  });
  if (!usageLimit) return c.json({ error: RESERVATION_API_ERROR_CODES.usageLimitConflict }, 409);
  return c.json({ usageLimit });
});

app.get("/public/v1/reservations", async (c) => {
  setPrivateNoStore(c);
  const guard = await guardPublicReservationApi(c, "LIST");
  if (!guard.ok) return guard.response;
  const input = parseReservationList(new URL(c.req.raw.url));
  if (!input) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  try {
    return c.json(await listPublicReservations(c.get("prisma"), input));
  } catch {
    console.error("Failed to list public reservations.");
    return c.json({ error: RESERVATION_API_ERROR_CODES.operationFailed }, 500);
  }
});

app.get("/public/v1/reservations/:id", async (c) => {
  setPrivateNoStore(c);
  const guard = await guardPublicReservationApi(c, "READ");
  if (!guard.ok) return guard.response;
  const id = parseReservationId(c.req.param("id"));
  if (!id) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  const reservation = await getPublicReservation(c.get("prisma"), id);
  return reservation
    ? c.json({ reservation })
    : c.json({ error: RESERVATION_API_ERROR_CODES.notFound }, 404);
});

app.post("/public/v1/reservations", async (c) => {
  setPrivateNoStore(c);
  const guard = await guardPublicReservationApi(c, "CREATE");
  if (!guard.ok) return guard.response;
  if (!isJsonRequest(c.req.raw)) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  const input = parseReservationWrite(await readJsonBody(c.req.raw));
  if (!input) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  try {
    return c.json({ reservation: await createPublicReservation(c.get("prisma"), input) }, 201);
  } catch (error) {
    return reservationOperationErrorResponse(c, error);
  }
});

app.patch("/public/v1/reservations/:id", async (c) => {
  setPrivateNoStore(c);
  const guard = await guardPublicReservationApi(c, "UPDATE");
  if (!guard.ok) return guard.response;
  const id = parseReservationId(c.req.param("id"));
  if (!id || !isJsonRequest(c.req.raw)) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  const input = parseReservationPatch(await readJsonBody(c.req.raw));
  if (!input) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  try {
    return c.json({ reservation: await updatePublicReservation(c.get("prisma"), id, input) });
  } catch (error) {
    return reservationOperationErrorResponse(c, error);
  }
});

app.delete("/public/v1/reservations/:id", async (c) => {
  setPrivateNoStore(c);
  const guard = await guardPublicReservationApi(c, "DELETE");
  if (!guard.ok) return guard.response;
  const id = parseReservationId(c.req.param("id"));
  if (!id || hasRequestBody(c.req.raw)) return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
  return await deletePublicReservation(c.get("prisma"), id)
    ? c.body(null, 204)
    : c.json({ error: RESERVATION_API_ERROR_CODES.notFound }, 404);
});

app.get("/admin/roles", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "roles",
    "VIEW",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const directory = parseAdminRoleDirectoryInput({
    query: c.req.query("query"),
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!directory.ok) {
    return c.json({ error: directory.error }, 400);
  }

  const result = await listAdminRoles(prisma, directory.value);
  return c.json({
    roles: result.roles.map(({ _count, ...role }) => ({
      ...role,
      memberCount: _count.assignments,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  });
});

app.post("/admin/roles", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "roles",
    "CREATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const metadata = parseAdminRoleMetadata(await readJsonBody(c.req.raw));
  if (!metadata.ok) return c.json({ error: metadata.code }, 400);

  try {
    const role = await createAdminRole(
      prisma,
      authorization.actor.id,
      metadata.value,
    );
    return c.json({ role }, 201);
  } catch (error) {
    return respondWithAdminAccessServiceError(c, error);
  }
});

app.get("/admin/roles/:id", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "roles",
    "VIEW",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const role = await getAdminRoleDetail(prisma, c.req.param("id"));
  return role
    ? c.json({ role })
    : c.json({ error: "ROLE_NOT_FOUND" }, 404);
});

app.get("/admin/roles/:id/members", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "roles",
    "VIEW",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }
  if (
    !canAdminAccess(authorization.actor, "users", "VIEW") ||
    !canAdminAccess(authorization.actor, "role-assignments", "VIEW")
  ) {
    return c.json({ error: "ADMIN_ACCESS_DENIED" }, 403);
  }

  const directory = parseAdminRoleDirectoryInput({
    query: c.req.query("query"),
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!directory.ok) return c.json({ error: directory.error }, 400);

  const result = await listAdminRoleMembers(
    prisma,
    c.req.param("id"),
    directory.value,
  );
  return result
    ? c.json(result)
    : c.json({ error: "ROLE_NOT_FOUND" }, 404);
});

app.get("/admin/roles/:id/member-candidates", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "roles",
    "VIEW",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }
  if (
    !canAdminAccess(authorization.actor, "users", "VIEW") ||
    !canAdminAccess(authorization.actor, "role-assignments", "VIEW")
  ) {
    return c.json({ error: "ADMIN_ACCESS_DENIED" }, 403);
  }

  const directory = parseAdminRoleDirectoryInput({
    query: c.req.query("query"),
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!directory.ok) return c.json({ error: directory.error }, 400);

  const result = await listAdminRoleMemberCandidates(
    prisma,
    c.req.param("id"),
    directory.value,
    authorization.actor.id,
  );
  return result
    ? c.json(result)
    : c.json({ error: "ROLE_NOT_FOUND" }, 404);
});

app.patch("/admin/roles/:id", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "roles",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const body = await readJsonBody(c.req.raw);
  if (!isObjectWithRevision(body)) {
    return c.json({ error: "INVALID_ROLE_REQUEST" }, 400);
  }
  const metadata = parseAdminRoleMetadata(body);
  if (!metadata.ok) return c.json({ error: metadata.code }, 400);

  try {
    const role = await updateAdminRoleMetadata(
      prisma,
      authorization.actor.id,
      c.req.param("id"),
      body.expectedRevision,
      metadata.value,
    );
    return c.json({ role });
  } catch (error) {
    return respondWithAdminAccessServiceError(c, error);
  }
});

app.put("/admin/roles/:id/permissions", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "roles",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const body = await readJsonBody(c.req.raw);
  if (
    !isObjectWithRevision(body) ||
    !("permissions" in body)
  ) {
    return c.json({ error: "INVALID_ROLE_PERMISSIONS" }, 400);
  }
  const permissions = parsePermissionMatrix(body.permissions);
  if (!permissions.ok) return c.json({ error: permissions.code }, 400);

  try {
    const role = await replaceAdminRolePermissions(
      prisma,
      authorization.actor.id,
      c.req.param("id"),
      body.expectedRevision,
      permissions.value,
    );
    return c.json({ role });
  } catch (error) {
    return respondWithAdminAccessServiceError(c, error);
  }
});

app.delete("/admin/roles/:id", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "roles",
    "DELETE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const body = await readJsonBody(c.req.raw);
  if (!isObjectWithRevision(body)) {
    return c.json({ error: "INVALID_ROLE_REQUEST" }, 400);
  }
  try {
    await deleteAdminRole(
      prisma,
      authorization.actor.id,
      c.req.param("id"),
      body.expectedRevision,
    );
    return c.body(null, 204);
  } catch (error) {
    return respondWithAdminAccessServiceError(c, error);
  }
});

app.put("/admin/users/:id/access-roles", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const authorization = await authorizeAdminApi(
    auth,
    prisma,
    c.req.raw.headers,
    "role-assignments",
    "UPDATE",
  );
  if (!authorization.ok) {
    return c.json({ error: authorization.error }, authorization.status);
  }

  const body = await readJsonBody(c.req.raw);
  if (!isAccessRoleAssignmentPayload(body)) {
    return c.json({ error: "INVALID_ROLE_REQUEST" }, 400);
  }
  try {
    const assignment = await replaceUserAdminAccessRoles(
      prisma,
      authorization.actor.id,
      c.req.param("id"),
      body.roleIds,
      body.expectedAssignmentRevision,
    );
    return c.json({ assignment });
  } catch (error) {
    return respondWithAdminAccessServiceError(c, error);
  }
});

app.post("/account/change-password", async (c) => {
  const auth = c.get("auth");
  const prisma = c.get("prisma");
  const session = await getAppSession(auth, c.req.raw.headers);
  const user = getSessionUser(session);

  if (!user) {
    return c.json({ error: "Authentication is required." }, 401);
  }

  const body = await readJsonBody(c.req.raw);

  if (!isChangePasswordPayload(body)) {
    return c.json(
      { error: "Request body must include currentPassword and newPassword." },
      400,
    );
  }

  try {
    await auth.api.changePassword({
      headers: c.req.raw.headers,
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: false,
      },
    });
  } catch (error) {
    return c.json({ error: getAuthErrorMessage(error) }, getAuthErrorStatus(error));
  }

  const changedAt = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        mustChangePassword: false,
        temporaryPasswordIssuedAt: null,
        passwordChangedAt: changedAt,
      },
    }),
    prisma.passwordResetRequest.updateMany({
      where: {
        userId: user.id,
        status: "APPROVED",
      },
      data: {
        status: "CONSUMED",
        consumedAt: changedAt,
      },
    }),
  ]);

  return c.json({
    ok: true,
    redirectTo: shouldChangePassword(session) ? "/admin" : "/admin",
  });
});

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

async function guardPublicReservationApi(
  c: Context<AppEnvironment>,
  permission: ReservationApiPermission,
) {
  const result = await authenticateReservationApiRequest(c.get("prisma"), {
    authorization: c.req.raw.headers.get("authorization"),
  });
  if (result.status === "UNAUTHORIZED") {
    c.header("WWW-Authenticate", "Bearer");
    return {
      ok: false as const,
      response: c.json({ error: RESERVATION_API_ERROR_CODES.unauthorized }, 401),
    };
  }
  if (result.status === "GLOBAL_LIMIT_EXCEEDED" || result.status === "KEY_LIMIT_EXCEEDED") {
    c.header("Retry-After", result.retryAfterSeconds.toString());
    return {
      ok: false as const,
      response: c.json({
        error: result.status === "GLOBAL_LIMIT_EXCEEDED"
          ? RESERVATION_API_ERROR_CODES.monthlyLimitExceeded
          : RESERVATION_API_ERROR_CODES.keyMonthlyLimitExceeded,
      }, 429),
    };
  }
  if (!result.permissions.has(permission)) {
    return {
      ok: false as const,
      response: c.json({ error: RESERVATION_API_ERROR_CODES.forbidden }, 403),
    };
  }
  return { ok: true as const, result };
}

function reservationOperationErrorResponse(
  c: Context<AppEnvironment>,
  error: unknown,
) {
  if (error instanceof ReservationApiOperationError) {
    if (error.code === "INVALID") {
      return c.json({ error: RESERVATION_API_ERROR_CODES.invalidRequest }, 400);
    }
    if (error.code === "NOT_FOUND") {
      return c.json({ error: RESERVATION_API_ERROR_CODES.notFound }, 404);
    }
    return c.json({ error: RESERVATION_API_ERROR_CODES.slotFull }, 409);
  }
  console.error("Failed to mutate a public reservation.");
  return c.json({ error: RESERVATION_API_ERROR_CODES.operationFailed }, 500);
}

function setPrivateNoStore(c: Context<AppEnvironment>) {
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
}

function isJsonRequest(request: Request) {
  return /^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "");
}

function hasRequestBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  return request.body !== null ||
    (contentLength !== null && contentLength !== "0") ||
    request.headers.has("transfer-encoding");
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isDemoRecordPayload(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function parseReservationCalendarRequest(url: URL, now: Date) {
  const keys = [...url.searchParams.keys()];
  if (
    keys.length !== 2 ||
    keys.some((key) => key !== "service" && key !== "month") ||
    url.searchParams.getAll("service").length !== 1 ||
    url.searchParams.getAll("month").length !== 1
  ) {
    return null;
  }
  const service = url.searchParams.get("service");
  const month = url.searchParams.get("month");
  if (
    !service ||
    !month ||
    !isReservationServiceKey(service) ||
    !isReservationMonthInRange(month, now)
  ) {
    return null;
  }
  return { service, month };
}

function isReservationDemoFillPayload(
  value: unknown,
): value is { month: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "month" in value &&
    typeof value.month === "string"
  );
}

function isDatabaseFreeRequest(request: Request): boolean {
  if (request.method.toUpperCase() !== "POST") {
    return false;
  }

  const pathname = new URL(request.url).pathname;
  return (
    process.env.NODE_ENV === "production" &&
    pathname === "/api/demo-records"
  );
}

function isEmailPayload(value: unknown): value is { email: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string"
  );
}

function isCreateUserPayload(
  value: unknown,
): value is {
  name: string;
  email: string;
  role: string;
  accessRoleIds?: string[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "email" in value &&
    "role" in value &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    typeof value.role === "string" &&
    (!("accessRoleIds" in value) ||
      (Array.isArray(value.accessRoleIds) &&
        value.accessRoleIds.length <= 1 &&
        value.accessRoleIds.every((roleId) => typeof roleId === "string")))
  );
}

function isObjectWithRevision(
  value: unknown,
): value is Record<string, unknown> & { expectedRevision: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "expectedRevision" in value &&
    Number.isSafeInteger(value.expectedRevision) &&
    Number(value.expectedRevision) > 0
  );
}

function isAccessRoleAssignmentPayload(
  value: unknown,
): value is { roleIds: string[]; expectedAssignmentRevision: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "roleIds" in value &&
    Array.isArray(value.roleIds) &&
    value.roleIds.length <= 1 &&
    value.roleIds.every((roleId) => typeof roleId === "string") &&
    "expectedAssignmentRevision" in value &&
    Number.isSafeInteger(value.expectedAssignmentRevision) &&
    Number(value.expectedAssignmentRevision) > 0
  );
}

function isChangePasswordPayload(
  value: unknown,
): value is { currentPassword: string; newPassword: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "currentPassword" in value &&
    "newPassword" in value &&
    typeof value.currentPassword === "string" &&
    typeof value.newPassword === "string"
  );
}

function isUserRole(value: string): value is (typeof USER_ROLES)[number] {
  return USER_ROLES.includes(value as (typeof USER_ROLES)[number]);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findManagedUser(prisma: PrismaClient, id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      banned: true,
    },
  });
}

function getAuthErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Authentication request failed.";
}

function getAuthErrorStatus(error: unknown): ContentfulStatusCode {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    isContentfulStatusCode(error.statusCode)
  ) {
    return error.statusCode;
  }

  return 400;
}

function isContentfulStatusCode(value: number): value is ContentfulStatusCode {
  return value !== 101 && value !== 204 && value !== 205 && value !== 304;
}

function respondWithAdminAccessServiceError(
  c: Context<AppEnvironment>,
  error: unknown,
) {
  if (error instanceof AdminAccessServiceError) {
    return c.json({ error: error.code }, error.status);
  }
  console.error("Admin access operation failed.");
  return c.json({ error: "ADMIN_ACCESS_OPERATION_FAILED" }, 500);
}
