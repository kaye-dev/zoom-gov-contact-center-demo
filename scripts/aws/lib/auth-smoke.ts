import { randomUUID } from "node:crypto";

import { endpointUrl, fetchWithTimeout } from "./http";

type RequestFunction = (
  url: URL,
  timeoutMilliseconds: number,
  init?: RequestInit,
) => Promise<Response>;

type SessionPayload = {
  user?: {
    email?: unknown;
    role?: unknown;
  };
};

type CreatedUserPayload = {
  user?: {
    email?: unknown;
    id?: unknown;
  };
};

export async function verifySeedAdminAuthentication(
  baseUrl: URL,
  email: string,
  password: string,
  request: RequestFunction = fetchWithTimeout,
): Promise<void> {
  let cookie = "";
  let verificationUserId = "";
  const verificationEmail = `aws-verification-${randomUUID()}@example.invalid`;

  try {
    const signIn = await request(
      endpointUrl(baseUrl, "/api/auth/sign-in/email"),
      60_000,
      jsonRequest(baseUrl, undefined, { email, password, rememberMe: false }),
    );
    if (!signIn.ok) {
      throw new Error(`Seed admin sign-in returned HTTP ${signIn.status}.`);
    }

    cookie = readCookieHeader(signIn.headers);
    if (!cookie) {
      throw new Error("Seed admin sign-in did not return a session cookie.");
    }
    await signIn.arrayBuffer();

    const sessionResponse = await request(
      endpointUrl(baseUrl, "/api/auth/get-session"),
      60_000,
      cookieRequest(baseUrl, cookie),
    );
    const session = (await sessionResponse.json().catch(() => null)) as
      | SessionPayload
      | null;
    if (
      !sessionResponse.ok ||
      session?.user?.email !== email ||
      session.user.role !== "admin"
    ) {
      throw new Error("Seed admin session was not authenticated as admin.");
    }

    const adminApiResponse = await request(
      endpointUrl(baseUrl, "/api/admin/password-reset-requests"),
      60_000,
      cookieRequest(baseUrl, cookie),
    );
    if (!adminApiResponse.ok) {
      throw new Error(
        `Authenticated admin API returned HTTP ${adminApiResponse.status}.`,
      );
    }
    await adminApiResponse.arrayBuffer();

    const adminPageResponse = await request(
      endpointUrl(baseUrl, "/admin/users"),
      60_000,
      cookieRequest(baseUrl, cookie),
    );
    if (
      !adminPageResponse.ok ||
      !(adminPageResponse.headers.get("content-type") ?? "")
        .toLowerCase()
        .includes("text/html")
    ) {
      throw new Error(
        `Authenticated admin page returned HTTP ${adminPageResponse.status}.`,
      );
    }
    await adminPageResponse.arrayBuffer();

    const createUserResponse = await request(
      endpointUrl(baseUrl, "/api/admin/users"),
      60_000,
      jsonRequest(baseUrl, cookie, {
        email: verificationEmail,
        name: "AWS deployment verification",
        role: "user",
      }),
    );
    const created = (await createUserResponse.json().catch(() => null)) as
      | CreatedUserPayload
      | null;
    if (
      createUserResponse.status !== 201 ||
      typeof created?.user?.id !== "string" ||
      created.user.email !== verificationEmail
    ) {
      throw new Error(
        `Authenticated user creation returned HTTP ${createUserResponse.status}.`,
      );
    }
    verificationUserId = created.user.id;

    await removeVerificationUser(
      baseUrl,
      cookie,
      verificationUserId,
      request,
    );
    verificationUserId = "";

    const signOut = await request(
      endpointUrl(baseUrl, "/api/auth/sign-out"),
      60_000,
      jsonRequest(baseUrl, cookie, {}),
    );
    if (!signOut.ok) {
      throw new Error(`Seed admin sign-out returned HTTP ${signOut.status}.`);
    }
    await signOut.arrayBuffer();
    cookie = "";
  } finally {
    if (cookie && verificationUserId) {
      await removeVerificationUser(
        baseUrl,
        cookie,
        verificationUserId,
        request,
      ).catch(() => undefined);
    }
    if (cookie) {
      await request(
        endpointUrl(baseUrl, "/api/auth/sign-out"),
        60_000,
        jsonRequest(baseUrl, cookie, {}),
      ).catch(() => undefined);
    }
  }
}

async function removeVerificationUser(
  baseUrl: URL,
  cookie: string,
  userId: string,
  request: RequestFunction,
): Promise<void> {
  const response = await request(
    endpointUrl(baseUrl, "/api/auth/admin/remove-user"),
    60_000,
    jsonRequest(baseUrl, cookie, { userId }),
  );
  if (!response.ok) {
    throw new Error(
      `Verification user cleanup returned HTTP ${response.status}.`,
    );
  }
  await response.arrayBuffer();
}

function cookieRequest(baseUrl: URL, cookie: string): RequestInit {
  return {
    headers: {
      cookie,
      origin: baseUrl.origin,
    },
  };
}

function jsonRequest(
  baseUrl: URL,
  cookie: string | undefined,
  body: unknown,
): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl.origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  };
}

function readCookieHeader(headers: Headers): string {
  const getSetCookie = (
    headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie;
  const values = getSetCookie?.call(headers) ?? [headers.get("set-cookie") ?? ""];

  return values
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}
