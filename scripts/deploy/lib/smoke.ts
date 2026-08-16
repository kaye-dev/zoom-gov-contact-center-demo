import { randomUUID } from "node:crypto";

import type { MaintenancePublicExpectation } from "./maintenance";

export type SmokeCredentials = {
  email: string;
  password: string;
};

export type SmokeResult = {
  checks: string[];
  authenticatedAdminCrud: boolean;
};

export type RequestFunction = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SmokeOptions = {
  cleanupRetryDelayMs?: number;
  publicSiteExpectation?: MaintenancePublicExpectation;
};

export async function runSmokeChecks(
  baseUrl: URL,
  credentials: SmokeCredentials,
  request: RequestFunction = globalThis.fetch,
  options: SmokeOptions = {},
): Promise<SmokeResult> {
  const checks: string[] = [];
  await assertHealth(baseUrl, request);
  checks.push("GET /api/health");

  const publicSiteExpectation = options.publicSiteExpectation ?? {
    environment: "DEVELOPMENT",
    status: 200,
  };
  checks.push(
    ...(await verifyPublicSiteSmoke(
      baseUrl,
      publicSiteExpectation,
      request,
    )),
  );

  const anonymousSession = await fetchWithTimeout(
    baseUrl,
    "/api/auth/get-session",
    request,
  );
  const anonymousPayload = await anonymousSession.json().catch(() => undefined);
  if (!anonymousSession.ok || anonymousPayload !== null) {
    throw new Error("Anonymous session smoke check did not return null.");
  }
  checks.push("anonymous GET /api/auth/get-session");

  const anonymousAdmin = await fetchWithTimeout(
    baseUrl,
    "/api/admin/password-reset-requests",
    request,
  );
  if (![401, 403].includes(anonymousAdmin.status)) {
    throw new Error(
      `Anonymous admin API returned HTTP ${anonymousAdmin.status}; expected 401 or 403.`,
    );
  }
  await anonymousAdmin.arrayBuffer();
  checks.push("anonymous admin API denied");

  await verifyAdminCrud(baseUrl, credentials, request, options);
  checks.push("administrator sign-in/session/API/page");
  checks.push("temporary user create/delete cleanup");
  return { checks, authenticatedAdminCrud: true };
}

export async function verifyPublicSiteSmoke(
  baseUrl: URL,
  publicSiteExpectation: MaintenancePublicExpectation,
  request: RequestFunction = globalThis.fetch,
): Promise<string[]> {
  const checks: string[] = [];
  for (const path of PUBLIC_HTML_SMOKE_PATHS) {
    await verifyPublicHtmlResponse(
      path,
      await fetchWithTimeout(baseUrl, path, request),
      publicSiteExpectation,
    );
    checks.push(`GET ${path}`);
  }

  await assertPublicExclusions(baseUrl, request);
  checks.push("maintenance exclusions: login/robots/static/raw Markdown");
  return checks;
}

/**
 * Captures the public behavior of an already-serving canonical deployment.
 * This is intentionally limited to public HTTP status and Retry-After state:
 * a previous release may use a different maintenance-settings provider.
 */
export async function capturePublicSiteBaseline(
  baseUrl: URL,
  request: RequestFunction = globalThis.fetch,
): Promise<MaintenancePublicExpectation> {
  const rootResponse = await fetchWithTimeout(baseUrl, "/", request);
  if (rootResponse.status !== 200 && rootResponse.status !== 503) {
    throw new Error(
      `Existing canonical / returned HTTP ${rootResponse.status}; expected 200 or 503.`,
    );
  }

  const retryAfter = rootResponse.headers.get("retry-after");
  if (
    retryAfter !== null &&
    !isCanonicalHttpDate(retryAfter)
  ) {
    throw new Error("Existing canonical / returned an invalid Retry-After header.");
  }
  const expectation: MaintenancePublicExpectation = {
    environment: "PRODUCTION",
    status: rootResponse.status,
    ...(retryAfter === null ? {} : { retryAfter }),
  };
  await verifyPublicHtmlResponse("/", rootResponse, expectation);

  for (const path of PUBLIC_HTML_SMOKE_PATHS.slice(1)) {
    await verifyPublicHtmlResponse(
      path,
      await fetchWithTimeout(baseUrl, path, request),
      expectation,
    );
  }
  await assertPublicExclusions(baseUrl, request);
  return expectation;
}

export function resolvePublicSiteBaselineAt(
  baseline: MaintenancePublicExpectation,
  now = new Date(),
): MaintenancePublicExpectation {
  if (baseline.status !== 503 || baseline.retryAfter === undefined) {
    return baseline;
  }
  const retryAt = Date.parse(baseline.retryAfter);
  if (!Number.isFinite(retryAt) || !Number.isFinite(now.getTime())) {
    throw new Error("Existing canonical public baseline is invalid.");
  }
  if (now.getTime() < retryAt) {
    return baseline;
  }
  return { environment: baseline.environment, status: 200 };
}

const PUBLIC_HTML_SMOKE_PATHS = [
  "/",
  "/docs/privacy-policy",
  "/life/frequently-asked-questions",
] as const;

async function verifyPublicHtmlResponse(
  path: string,
  response: Response,
  publicSiteExpectation: MaintenancePublicExpectation,
): Promise<void> {
  if (
    response.status !== publicSiteExpectation.status ||
    !(response.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("text/html")
  ) {
    throw new Error(
      `${path} returned HTTP ${response.status}; expected ${publicSiteExpectation.status} for ${publicSiteExpectation.environment}.`,
    );
  }
  const html = await response.text();
  if (publicSiteExpectation.status === 503) {
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cacheControl)) {
      throw new Error(`${path} maintenance response was not marked no-store.`);
    }
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter !== (publicSiteExpectation.retryAfter ?? null)) {
      throw new Error(`${path} returned an unexpected Retry-After header.`);
    }
    if (hasRobotsNoindexMeta(html)) {
      throw new Error(`${path} maintenance response unexpectedly used noindex.`);
    }
  } else {
    const marker =
      path === "/docs/privacy-policy"
        ? "プライバシーポリシー"
        : path === "/life/frequently-asked-questions"
          ? "未来市のよくある質問"
          : undefined;
    if (marker && !html.includes(marker)) {
      throw new Error(`${path} did not contain its deployment content marker.`);
    }
    if (response.headers.has("retry-after")) {
      throw new Error(`${path} unexpectedly returned Retry-After while available.`);
    }
  }
}

async function assertPublicExclusions(
  baseUrl: URL,
  request: RequestFunction,
): Promise<void> {
  const login = await fetchWithTimeout(baseUrl, "/login", request);
  if (
    login.status !== 200 ||
    !(login.headers.get("content-type") ?? "").toLowerCase().includes("text/html")
  ) {
    throw new Error(`Maintenance-exempt /login returned HTTP ${login.status}.`);
  }
  await login.arrayBuffer();

  const robots = await fetchWithTimeout(baseUrl, "/robots.txt", request);
  if (robots.status === 503) {
    throw new Error("Maintenance-exempt /robots.txt unexpectedly returned 503.");
  }
  await robots.arrayBuffer();

  const staticAsset = await fetchWithTimeout(
    baseUrl,
    "/news/news-default-item.png",
    request,
  );
  if (
    staticAsset.status !== 200 ||
    !(staticAsset.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("image/png")
  ) {
    throw new Error(
      `Maintenance-exempt static asset returned HTTP ${staticAsset.status}.`,
    );
  }
  await staticAsset.arrayBuffer();

  const rawMarkdown = await fetchWithTimeout(
    baseUrl,
    "/docs/privacy-policy.md",
    request,
  );
  const rawMarkdownType = (
    rawMarkdown.headers.get("content-type") ?? ""
  ).toLowerCase();
  if (
    rawMarkdown.status !== 200 ||
    !rawMarkdownType.includes("text/markdown")
  ) {
    throw new Error(
      `Maintenance-exempt raw Markdown returned HTTP ${rawMarkdown.status}.`,
    );
  }
  const markdown = await rawMarkdown.text();
  if (!markdown.includes("プライバシーポリシー")) {
    throw new Error("Maintenance-exempt raw Markdown did not contain its marker.");
  }
}

function hasRobotsNoindexMeta(html: string): boolean {
  return /<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*\bnoindex\b[^"']*["'])[^>]*>/i.test(
    html,
  );
}

function isCanonicalHttpDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toUTCString() === value;
}

export async function verifyIdleRecovery(
  baseUrl: URL,
  waitMs = 5 * 60_000,
  request: RequestFunction = globalThis.fetch,
  observeState: ((expected: "idle" | "active") => Promise<void>) | undefined =
    undefined,
): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, waitMs));
  await observeState?.("idle");
  await assertHealth(baseUrl, request);
  await observeState?.("active");
}

async function assertHealth(
  baseUrl: URL,
  request: RequestFunction,
): Promise<void> {
  const response = await fetchWithTimeout(baseUrl, "/api/health", request);
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const database = payload?.database as Record<string, unknown> | undefined;
  if (
    !response.ok ||
    payload?.status !== "ok" ||
    database?.configured !== true ||
    database?.driver !== "postgresql" ||
    database?.orm !== "prisma"
  ) {
    throw new Error(`Health check failed with HTTP ${response.status}.`);
  }
}

async function verifyAdminCrud(
  baseUrl: URL,
  credentials: SmokeCredentials,
  request: RequestFunction,
  options: SmokeOptions,
): Promise<void> {
  let cookie = "";
  let temporaryUserId = "";
  let primaryError: unknown;
  let creationAttempted = false;
  const temporaryEmail = `deployment-smoke-${randomUUID()}@example.invalid`;

  try {
    const signIn = await fetchWithTimeout(
      baseUrl,
      "/api/auth/sign-in/email",
      request,
      jsonRequest(baseUrl, undefined, {
        email: credentials.email,
        password: credentials.password,
        rememberMe: false,
      }),
    );
    if (!signIn.ok) {
      throw new Error(`Administrator sign-in returned HTTP ${signIn.status}.`);
    }
    cookie = readCookieHeader(signIn.headers);
    await signIn.arrayBuffer();
    if (!cookie) {
      throw new Error("Administrator sign-in did not return a session cookie.");
    }

    const session = await fetchWithTimeout(
      baseUrl,
      "/api/auth/get-session",
      request,
      cookieRequest(baseUrl, cookie),
    );
    const sessionPayload = (await session.json().catch(() => null)) as {
      user?: { email?: unknown; role?: unknown };
    } | null;
    if (
      !session.ok ||
      sessionPayload?.user?.email !== credentials.email ||
      sessionPayload.user.role !== "admin"
    ) {
      throw new Error("Authenticated session is not the expected administrator.");
    }

    for (const path of ["/api/admin/password-reset-requests", "/admin/users"]) {
      const response = await fetchWithTimeout(
        baseUrl,
        path,
        request,
        cookieRequest(baseUrl, cookie),
      );
      if (!response.ok) {
        throw new Error(`Authenticated ${path} returned HTTP ${response.status}.`);
      }
      await response.arrayBuffer();
    }

    await assertTemporaryUserAbsent(baseUrl, cookie, temporaryEmail, request);

    creationAttempted = true;
    const createdResponse = await fetchWithTimeout(
      baseUrl,
      "/api/admin/users",
      request,
      jsonRequest(baseUrl, cookie, {
        email: temporaryEmail,
        name: "Deployment verification",
        role: "user",
      }),
    );
    const created = (await createdResponse.json().catch(() => null)) as {
      user?: { id?: unknown; email?: unknown };
      temporaryPassword?: unknown;
    } | null;
    const createdUser = created?.user;
    if (typeof createdUser?.id === "string") {
      temporaryUserId = createdUser.id;
    }
    if (
      createdResponse.status !== 201 ||
      !temporaryUserId ||
      createdUser?.email !== temporaryEmail ||
      typeof created?.temporaryPassword !== "string"
    ) {
      throw new Error(
        `Temporary user creation returned HTTP ${createdResponse.status}.`,
      );
    }
    await removeTemporaryUser(baseUrl, cookie, temporaryUserId, request);
    await assertTemporaryUserAbsent(baseUrl, cookie, temporaryEmail, request);
    temporaryUserId = "";

    const signOut = await fetchWithTimeout(
      baseUrl,
      "/api/auth/sign-out",
      request,
      jsonRequest(baseUrl, cookie, {}),
    );
    if (!signOut.ok) {
      throw new Error(`Administrator sign-out returned HTTP ${signOut.status}.`);
    }
    await signOut.arrayBuffer();
    cookie = "";
  } catch (error) {
    primaryError = error;
  } finally {
    let cleanupError: unknown;
    if (cookie) {
      try {
        await cleanupTemporaryUserWithRetry(
          baseUrl,
          cookie,
          temporaryEmail,
          request,
          temporaryUserId,
          creationAttempted,
          options.cleanupRetryDelayMs ?? 1_000,
        );
      } catch (error) {
        cleanupError = error;
      }
    }
    if (cookie) {
      await fetchWithTimeout(
        baseUrl,
        "/api/auth/sign-out",
        request,
        jsonRequest(baseUrl, cookie, {}),
      ).catch(() => undefined);
    }
    if (cleanupError) {
      throw new Error(
        `Temporary smoke user cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : "unknown error"}`,
      );
    }
  }
  if (primaryError) {
    throw primaryError;
  }
}

async function removeTemporaryUser(
  baseUrl: URL,
  cookie: string,
  userId: string,
  request: RequestFunction,
): Promise<void> {
  const response = await fetchWithTimeout(
    baseUrl,
    "/api/auth/admin/remove-user",
    request,
    jsonRequest(baseUrl, cookie, { userId }),
  );
  if (!response.ok) {
    throw new Error(`remove-user returned HTTP ${response.status}.`);
  }
  await response.arrayBuffer();
}

async function cleanupTemporaryUserWithRetry(
  baseUrl: URL,
  cookie: string,
  email: string,
  request: RequestFunction,
  knownUserId: string,
  ambiguousCreationAttempt: boolean,
  retryDelayMs: number,
): Promise<void> {
  const attempts = ambiguousCreationAttempt ? 3 : 1;
  let candidateId = knownUserId;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      candidateId ||= await findTemporaryUserId(
        baseUrl,
        cookie,
        email,
        request,
      );
      if (candidateId) {
        await removeTemporaryUser(baseUrl, cookie, candidateId, request);
        candidateId = "";
      }
      await assertTemporaryUserAbsent(baseUrl, cookie, email, request);
      lastError = undefined;
      if (!ambiguousCreationAttempt || attempt === attempts) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs));
    }
  }
  if (lastError) {
    throw lastError;
  }
}

async function assertTemporaryUserAbsent(
  baseUrl: URL,
  cookie: string,
  email: string,
  request: RequestFunction,
): Promise<void> {
  const payload = await listTemporaryUsers(baseUrl, cookie, email, request);
  if (payload.users.length !== 0 || payload.total !== 0) {
    throw new Error("Temporary smoke user still exists after cleanup.");
  }
}

async function findTemporaryUserId(
  baseUrl: URL,
  cookie: string,
  email: string,
  request: RequestFunction,
): Promise<string> {
  const payload = await listTemporaryUsers(baseUrl, cookie, email, request);
  if (payload.total === 0 && payload.users.length === 0) {
    return "";
  }
  if (
    payload.total !== 1 ||
    payload.users.length !== 1 ||
    typeof payload.users[0]?.id !== "string" ||
    payload.users[0].email !== email
  ) {
    throw new Error("Could not identify exactly one temporary smoke user.");
  }
  return payload.users[0].id;
}

async function listTemporaryUsers(
  baseUrl: URL,
  cookie: string,
  email: string,
  request: RequestFunction,
): Promise<{ users: Array<{ id?: unknown; email?: unknown }>; total: number }> {
  const query = new URLSearchParams({
    filterField: "email",
    filterOperator: "eq",
    filterValue: email,
    limit: "1",
  });
  const response = await fetchWithTimeout(
    baseUrl,
    `/api/auth/admin/list-users?${query.toString()}`,
    request,
    cookieRequest(baseUrl, cookie),
  );
  const payload = (await response.json().catch(() => null)) as {
    users?: Array<{ id?: unknown; email?: unknown }>;
    total?: unknown;
  } | null;
  if (
    !response.ok ||
    !Array.isArray(payload?.users) ||
    typeof payload.total !== "number"
  ) {
    throw new Error("Temporary smoke user lookup returned an invalid response.");
  }
  return { users: payload.users, total: payload.total };
}

async function fetchWithTimeout(
  baseUrl: URL,
  path: string,
  request: RequestFunction,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const headers = new Headers(init.headers);
  headers.set("user-agent", "zoom-gov-demo-deployment-smoke/1.0");
  try {
    const response = await request(new URL(path, baseUrl), {
      ...init,
      headers,
      redirect: init.redirect ?? "manual",
      signal: controller.signal,
    });
    if (!response.url) {
      throw new Error(`Smoke response for ${path} did not expose its final URL.`);
    }
    const responseUrl = new URL(response.url);
    if (responseUrl.origin !== baseUrl.origin) {
      throw new Error(
        `Smoke response for ${path} escaped the target deployment origin.`,
      );
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
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

function cookieRequest(baseUrl: URL, cookie: string): RequestInit {
  return { headers: { cookie, origin: baseUrl.origin } };
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
