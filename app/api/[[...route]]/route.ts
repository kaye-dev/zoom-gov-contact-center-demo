import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { handle } from "hono/vercel";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  countDemoRecords,
  createDemoRecord,
  ensureDatabase,
  hasDatabaseUrl,
  listDemoRecords,
  MAX_DEMO_RECORD_MESSAGE_LENGTH,
} from "@/lib/server/db";
import {
  getAppSession,
  getSessionUser,
  isAdminSession,
  shouldChangePassword,
} from "@/lib/server/auth/helpers";
import { prisma } from "@/lib/server/prisma";
import {
  saveContactSettings,
  saveLanguageSettings,
} from "@/lib/server/site-settings";
import {
  SETTINGS_ERROR_CODES,
  parseContactSettings,
  parseLanguageSettings,
} from "@/lib/site-settings";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

const USER_ROLES = ["user", "admin"] as const;

app.get("/health", async (c) => {
  await ensureDatabase();

  return c.json({
    status: "ok",
    database: {
      driver: "postgresql",
      orm: "prisma",
      configured: hasDatabaseUrl(),
      demoRecordCount: await countDemoRecords(),
    },
  });
});

app.get("/demo-records", async (c) => {
  return c.json({
    records: await listDemoRecords(),
  });
});

app.post("/demo-records", async (c) => {
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

  return c.json({ record: await createDemoRecord(message) }, 201);
});

app.post("/password-reset-requests", async (c) => {
  const body = await readJsonBody(c.req.raw);

  if (!isEmailPayload(body)) {
    return c.json({ error: "Request body must include an email string." }, 400);
  }

  const email = normalizeEmail(body.email);
  if (!isEmail(email)) {
    return c.json({ error: "Email address is invalid." }, 400);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  await prisma.passwordResetRequest.create({
    data: {
      email,
      userId: user?.id,
    },
  });

  return c.json({ ok: true });
});

app.get("/admin/password-reset-requests", async (c) => {
  const session = await getAppSession(c.req.raw.headers);
  const unauthorized = rejectNonAdmin(session);

  if (unauthorized) {
    return c.json(unauthorized.body, unauthorized.status);
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
  const session = await getAppSession(c.req.raw.headers);
  const unauthorized = rejectNonAdmin(session);

  if (unauthorized) {
    return c.json(unauthorized.body, unauthorized.status);
  }

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

  const temporaryPassword = generateTemporaryPassword();
  const issuedAt = new Date();

  try {
    await auth.api.setUserPassword({
      headers: c.req.raw.headers,
      body: {
        userId: request.user.id,
        newPassword: temporaryPassword,
      },
    });
  } catch (error) {
    return c.json({ error: getAuthErrorMessage(error) }, getAuthErrorStatus(error));
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: request.user.id },
      data: {
        mustChangePassword: true,
        temporaryPasswordIssuedAt: issuedAt,
      },
    }),
    prisma.passwordResetRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedAt: issuedAt,
        reviewedByUserId: reviewer?.id,
        issuedAt,
      },
    }),
  ]);

  return c.json({ temporaryPassword });
});

app.post("/admin/password-reset-requests/:id/reject", async (c) => {
  const session = await getAppSession(c.req.raw.headers);
  const unauthorized = rejectNonAdmin(session);

  if (unauthorized) {
    return c.json(unauthorized.body, unauthorized.status);
  }

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

app.post("/admin/users", async (c) => {
  const session = await getAppSession(c.req.raw.headers);
  const unauthorized = rejectNonAdmin(session);

  if (unauthorized) {
    return c.json(unauthorized.body, unauthorized.status);
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
    const result = await auth.api.createUser({
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

    const user = await prisma.user.update({
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

    return c.json({ user, temporaryPassword }, 201);
  } catch (error) {
    return c.json({ error: getAuthErrorMessage(error) }, getAuthErrorStatus(error));
  }
});

app.put("/admin/contact-settings", async (c) => {
  const session = await getAppSession(c.req.raw.headers);
  const unauthorized = rejectNonAdminForSettings(session);

  if (unauthorized) {
    return c.json(unauthorized.body, unauthorized.status);
  }

  const parsed = parseContactSettings(await readJsonBody(c.req.raw));
  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  try {
    const settings = await saveContactSettings(parsed.value);
    revalidatePath("/", "layout");
    return c.json({ settings });
  } catch (error) {
    console.error("Failed to save contact settings.", error);
    return c.json({ error: SETTINGS_ERROR_CODES.saveFailed }, 500);
  }
});

app.put("/admin/language-settings", async (c) => {
  const session = await getAppSession(c.req.raw.headers);
  const unauthorized = rejectNonAdminForSettings(session);

  if (unauthorized) {
    return c.json(unauthorized.body, unauthorized.status);
  }

  const parsed = parseLanguageSettings(await readJsonBody(c.req.raw));
  if (!parsed.ok) {
    return c.json({ error: parsed.code }, 400);
  }

  try {
    const settings = await saveLanguageSettings(parsed.value);
    revalidatePath("/", "layout");
    return c.json({ settings });
  } catch (error) {
    console.error("Failed to save language settings.", error);
    return c.json({ error: SETTINGS_ERROR_CODES.saveFailed }, 500);
  }
});

app.post("/account/change-password", async (c) => {
  const session = await getAppSession(c.req.raw.headers);
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
): value is { name: string; email: string; role: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "email" in value &&
    "role" in value &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    typeof value.role === "string"
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

function rejectNonAdmin(session: Awaited<ReturnType<typeof getAppSession>>) {
  if (!session) {
    return { status: 401 as const, body: { error: "Authentication is required." } };
  }

  if (!isAdminSession(session)) {
    return { status: 403 as const, body: { error: "Administrator role is required." } };
  }

  return null;
}

function rejectNonAdminForSettings(
  session: Awaited<ReturnType<typeof getAppSession>>,
) {
  if (!session) {
    return {
      status: 401 as const,
      body: { error: SETTINGS_ERROR_CODES.authenticationRequired },
    };
  }

  if (!isAdminSession(session)) {
    return {
      status: 403 as const,
      body: { error: SETTINGS_ERROR_CODES.administratorRequired },
    };
  }

  return null;
}

function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const crypto = globalThis.crypto;
  let password = "";

  for (let i = 0; i < 20; i += 1) {
    password += alphabet[crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length];
  }

  return password;
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
