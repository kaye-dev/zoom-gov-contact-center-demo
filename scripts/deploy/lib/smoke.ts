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
  adminAccessExpectation?: AdminAccessSmokeExpectation;
  canonicalOrigin?: URL;
  cleanupRetryDelayMs?: number;
  publicSiteExpectation?: MaintenancePublicExpectation;
  searchIndexingExpectation?: SearchIndexingExpectation;
};

export type SearchIndexingExpectation = "required" | "legacy-compatible";
export type AdminAccessSmokeExpectation = "required" | "legacy-compatible";

export async function runSmokeChecks(
  baseUrl: URL,
  credentials: SmokeCredentials,
  request: RequestFunction = globalThis.fetch,
  options: SmokeOptions = {},
): Promise<SmokeResult> {
  const checks: string[] = [];
  const searchIndexingExpectation =
    options.searchIndexingExpectation ?? "required";
  const protectedRequest = createSearchProtectionRequest(
    request,
    searchIndexingExpectation,
  );
  await assertHealth(baseUrl, protectedRequest);
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
      {
        canonicalOrigin: options.canonicalOrigin,
        searchIndexingExpectation,
      },
    )),
  );

  const anonymousSession = await fetchWithTimeout(
    baseUrl,
    "/api/auth/get-session",
    protectedRequest,
  );
  const anonymousPayload = await anonymousSession.json().catch(() => undefined);
  if (!anonymousSession.ok || anonymousPayload !== null) {
    throw new Error("Anonymous session smoke check did not return null.");
  }
  checks.push("anonymous GET /api/auth/get-session");

  const anonymousAdmin = await fetchWithTimeout(
    baseUrl,
    "/api/admin/password-reset-requests",
    protectedRequest,
  );
  if (![401, 403].includes(anonymousAdmin.status)) {
    throw new Error(
      `Anonymous admin API returned HTTP ${anonymousAdmin.status}; expected 401 or 403.`,
    );
  }
  await anonymousAdmin.arrayBuffer();
  checks.push("anonymous admin API denied");

  await verifyAdminCrud(baseUrl, credentials, protectedRequest, options);
  checks.push("administrator sign-in/session/API/page");
  checks.push("temporary user create/delete cleanup");
  return { checks, authenticatedAdminCrud: true };
}

export async function verifyPublicSiteSmoke(
  baseUrl: URL,
  publicSiteExpectation: MaintenancePublicExpectation,
  request: RequestFunction = globalThis.fetch,
  options: Pick<
    SmokeOptions,
    "canonicalOrigin" | "searchIndexingExpectation"
  > = {},
): Promise<string[]> {
  const checks: string[] = [];
  const searchIndexingExpectation =
    options.searchIndexingExpectation ?? "required";
  const protectedRequest = createSearchProtectionRequest(
    request,
    searchIndexingExpectation,
  );
  for (const path of PUBLIC_HTML_SMOKE_PATHS) {
    await verifyPublicHtmlResponse(
      path,
      await fetchWithTimeout(baseUrl, path, protectedRequest),
      publicSiteExpectation,
      searchIndexingExpectation,
    );
    checks.push(`GET ${path}`);
  }

  await assertPublicExclusions(
    baseUrl,
    protectedRequest,
    options.canonicalOrigin ?? baseUrl,
    searchIndexingExpectation,
  );
  checks.push(
    searchIndexingExpectation === "required"
      ? "search protection: login/robots/sitemap/static/raw Markdown"
      : "legacy-compatible search endpoints/exclusions",
  );
  return checks;
}

/**
 * Captures the public behavior of an already-serving canonical deployment.
 * A previous release may use a different maintenance-settings provider and
 * may predate the repository-wide noindex, robots, and sitemap behavior.
 */
export async function capturePublicSiteBaseline(
  baseUrl: URL,
  request: RequestFunction = globalThis.fetch,
): Promise<MaintenancePublicExpectation> {
  const baselineRequest = createSearchProtectionRequest(
    request,
    "legacy-compatible",
  );
  const rootResponse = await fetchWithTimeout(baseUrl, "/", baselineRequest);
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
  await verifyPublicHtmlResponse(
    "/",
    rootResponse,
    expectation,
    "legacy-compatible",
  );

  for (const path of PUBLIC_HTML_SMOKE_PATHS.slice(1)) {
    await verifyPublicHtmlResponse(
      path,
      await fetchWithTimeout(baseUrl, path, baselineRequest),
      expectation,
      "legacy-compatible",
    );
  }
  await assertPublicExclusions(
    baseUrl,
    baselineRequest,
    baseUrl,
    "legacy-compatible",
  );
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
  searchIndexingExpectation: SearchIndexingExpectation,
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
  if (
    searchIndexingExpectation === "required" &&
    !hasRobotsNoindexNofollowMeta(html)
  ) {
    throw new Error(
      `${path} did not contain a robots noindex, nofollow meta tag.`,
    );
  }
  if (publicSiteExpectation.status === 503) {
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cacheControl)) {
      throw new Error(`${path} maintenance response was not marked no-store.`);
    }
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter !== (publicSiteExpectation.retryAfter ?? null)) {
      throw new Error(`${path} returned an unexpected Retry-After header.`);
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
  canonicalOrigin: URL,
  searchIndexingExpectation: SearchIndexingExpectation,
): Promise<void> {
  const login = await fetchWithTimeout(baseUrl, "/login", request);
  if (
    login.status !== 200 ||
    !(login.headers.get("content-type") ?? "").toLowerCase().includes("text/html")
  ) {
    throw new Error(`Maintenance-exempt /login returned HTTP ${login.status}.`);
  }
  const loginHtml = await login.text();
  if (
    searchIndexingExpectation === "required" &&
    !hasRobotsNoindexNofollowMeta(loginHtml)
  ) {
    throw new Error(
      "/login did not contain a robots noindex, nofollow meta tag.",
    );
  }

  const robots = await fetchWithTimeout(baseUrl, "/robots.txt", request);
  if (
    searchIndexingExpectation === "legacy-compatible" &&
    robots.status === 404
  ) {
    await robots.arrayBuffer();
  } else {
    await assertRobotsResponse(robots, canonicalOrigin);
  }

  const sitemap = await fetchWithTimeout(baseUrl, "/sitemap.xml", request);
  if (
    searchIndexingExpectation === "legacy-compatible" &&
    sitemap.status === 404
  ) {
    await sitemap.arrayBuffer();
  } else {
    await assertSitemapResponse(sitemap, canonicalOrigin);
  }

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

const SITEMAP_REPRESENTATIVE_PATHS = [
  "/",
  "/life",
  "/life/trash-recycling",
  "/life/trash-recycling/sorting-and-collection",
  "/news/assembly-session-june-2026",
  "/life/frequently-asked-questions/administrative-service-center/location-and-access",
  "/docs/privacy-policy",
] as const;
const EXPECTED_SITEMAP_URL_COUNT = 275;

async function assertRobotsResponse(
  response: Response,
  canonicalOrigin: URL,
): Promise<void> {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (response.status !== 200 || !contentType.includes("text/plain")) {
    throw new Error(
      `Maintenance-exempt /robots.txt returned HTTP ${response.status}; expected 200 text/plain.`,
    );
  }
  const directives = (await response.text())
    .split(/\r?\n/u)
    .map((line) => line.replace(/#.*$/u, "").trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      return separator === -1
        ? { name: line.toLowerCase(), value: "" }
        : {
            name: line.slice(0, separator).trim().toLowerCase(),
            value: line.slice(separator + 1).trim(),
          };
    });
  const expectedSitemap = new URL("/sitemap.xml", canonicalOrigin).href;
  if (
    !directives.some(
      ({ name, value }) => name === "user-agent" && value === "*",
    ) ||
    !directives.some(({ name, value }) => name === "allow" && value === "/") ||
    !directives.some(
      ({ name, value }) => name === "sitemap" && value === expectedSitemap,
    ) ||
    directives.some(({ name, value }) => name === "disallow" && value !== "")
  ) {
    throw new Error(
      `/robots.txt did not allow crawling and advertise ${expectedSitemap}.`,
    );
  }
}

async function assertSitemapResponse(
  response: Response,
  canonicalOrigin: URL,
): Promise<void> {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (
    response.status !== 200 ||
    (!contentType.includes("application/xml") &&
      !contentType.includes("text/xml"))
  ) {
    throw new Error(
      `Maintenance-exempt /sitemap.xml returned HTTP ${response.status}; expected 200 XML.`,
    );
  }

  const locations = readSitemapLocations(await response.text());
  if (
    locations.length !== EXPECTED_SITEMAP_URL_COUNT ||
    new Set(locations).size !== locations.length
  ) {
    throw new Error(
      `/sitemap.xml did not contain exactly ${EXPECTED_SITEMAP_URL_COUNT} unique canonical locations.`,
    );
  }

  const canonicalLocations = new Set<string>();
  for (const location of locations) {
    let url: URL;
    try {
      url = new URL(location);
    } catch {
      throw new Error(`/sitemap.xml contained an invalid URL: ${location}`);
    }
    if (
      url.origin !== canonicalOrigin.origin ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error(
        `/sitemap.xml contained a non-canonical location: ${location}`,
      );
    }
    if (isExcludedSitemapPath(url.pathname)) {
      throw new Error(`/sitemap.xml contained an excluded path: ${url.pathname}`);
    }
    canonicalLocations.add(url.href);
  }

  for (const path of SITEMAP_REPRESENTATIVE_PATHS) {
    const expected = new URL(path, canonicalOrigin).href;
    if (!canonicalLocations.has(expected)) {
      throw new Error(`/sitemap.xml did not contain representative URL ${expected}.`);
    }
  }
}

function readSitemapLocations(xml: string): string[] {
  const documentMatch = xml.trim().match(
    /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">([\s\S]*)<\/urlset>$/u,
  );
  if (documentMatch === null) {
    throw new Error("/sitemap.xml was not a complete sitemap XML document.");
  }

  const body = documentMatch[1]!;
  const locations: string[] = [];
  const urlPattern = /<url\b([^>]*)>([\s\S]*?)<\/url>/giu;
  let previousEnd = 0;
  for (const match of body.matchAll(urlPattern)) {
    if (body.slice(previousEnd, match.index).trim() || match[1]!.trim()) {
      throw new Error("/sitemap.xml contained invalid urlset content.");
    }
    const locationMatch = match[2]!.match(/^\s*<loc>([^<]*)<\/loc>\s*$/iu);
    if (locationMatch === null) {
      throw new Error("/sitemap.xml contained an invalid url element.");
    }
    const encodedLocation = locationMatch[1]!.trim();
    if (
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(encodedLocation) ||
      /&(?!(?:amp|lt|gt|quot|apos);)/u.test(encodedLocation)
    ) {
      throw new Error("/sitemap.xml contained invalid XML text.");
    }
    locations.push(decodeXmlText(encodedLocation));
    previousEnd = match.index + match[0].length;
  }
  if (body.slice(previousEnd).trim()) {
    throw new Error("/sitemap.xml contained invalid urlset content.");
  }
  return locations;
}

function isExcludedSitemapPath(pathname: string): boolean {
  return (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/maintenance-unavailable" ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/forgot-password/") ||
    pathname === "/change-password" ||
    pathname.startsWith("/change-password/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/_next" ||
    pathname.startsWith("/_next/") ||
    pathname === "/_vercel" ||
    pathname.startsWith("/_vercel/") ||
    pathname.toLowerCase().endsWith(".md") ||
    pathname.toLowerCase().endsWith(".html") ||
    /\.[a-z0-9]+$/iu.test(pathname)
  );
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function createSearchProtectionRequest(
  request: RequestFunction,
  expectation: SearchIndexingExpectation,
): RequestFunction {
  if (expectation === "legacy-compatible") return request;
  return async (input, init) => {
    const response = await request(input, init);
    assertNoindexHeader(new URL(String(input)).pathname, response);
    return response;
  };
}

function assertNoindexHeader(path: string, response: Response): void {
  const value = response.headers.get("x-robots-tag");
  if (
    value === null ||
    !hasRobotsDirective(value, "noindex") ||
    !hasRobotsDirective(value, "nofollow")
  ) {
    throw new Error(
      `${path} did not return X-Robots-Tag: noindex, nofollow.`,
    );
  }
}

function hasRobotsNoindexNofollowMeta(html: string): boolean {
  const tags = html.match(/<meta\b[^>]*>/giu) ?? [];
  return tags.some((tag) => {
    const name = readHtmlAttribute(tag, "name");
    const content = readHtmlAttribute(tag, "content");
    return (
      name?.toLowerCase() === "robots" &&
      content !== undefined &&
      hasRobotsDirective(content, "noindex") &&
      hasRobotsDirective(content, "nofollow")
    );
  });
}

function readHtmlAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "iu"),
  );
  return match?.[2];
}

function hasRobotsDirective(value: string, directive: string): boolean {
  return value
    .toLowerCase()
    .split(/[\s,]+/u)
    .includes(directive);
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
  await assertHealth(
    baseUrl,
    createSearchProtectionRequest(request, "required"),
  );
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
  const adminAccessExpectation =
    options.adminAccessExpectation ?? "required";
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
    if (adminAccessExpectation === "required") {
      await assertLegacyAdminAuthEndpointsRemoved(baseUrl, cookie, request);
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
      if (path === "/admin/users") {
        if (
          !(response.headers.get("content-type") ?? "")
            .toLowerCase()
            .includes("text/html")
        ) {
          throw new Error("Authenticated /admin/users did not return HTML.");
        }
        const html = await response.text();
        if (
          (options.searchIndexingExpectation ?? "required") === "required" &&
          !hasRobotsNoindexNofollowMeta(html)
        ) {
          throw new Error(
            "Authenticated /admin/users did not contain a robots noindex, nofollow meta tag.",
          );
        }
      } else {
        await response.arrayBuffer();
      }
    }

    await assertTemporaryUserAbsent(
      baseUrl,
      cookie,
      temporaryEmail,
      request,
      adminAccessExpectation,
    );

    creationAttempted = true;
    const createdResponse = await fetchWithTimeout(
      baseUrl,
      "/api/admin/users",
      request,
      jsonRequest(
        baseUrl,
        cookie,
        adminAccessExpectation === "required"
          ? {
              email: temporaryEmail,
              name: "Deployment verification",
              role: "user",
              accessRoleIds: [],
            }
          : {
              email: temporaryEmail,
              name: "Deployment verification",
              role: "user",
            },
      ),
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
    if (adminAccessExpectation === "required") {
      await assertTemporaryUserHasNoAccess(
        baseUrl,
        cookie,
        temporaryEmail,
        temporaryUserId,
        request,
      );
    }
    await removeTemporaryUser(
      baseUrl,
      cookie,
      temporaryUserId,
      request,
      adminAccessExpectation,
    );
    await assertTemporaryUserAbsent(
      baseUrl,
      cookie,
      temporaryEmail,
      request,
      adminAccessExpectation,
    );
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
          adminAccessExpectation,
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

async function assertLegacyAdminAuthEndpointsRemoved(
  baseUrl: URL,
  cookie: string,
  request: RequestFunction,
): Promise<void> {
  const legacyRequests: Array<[string, RequestInit]> = [
    ["/api/auth/admin/list-users", cookieRequest(baseUrl, cookie)],
    [
      "/api/auth/admin/remove-user",
      jsonRequest(baseUrl, cookie, { userId: "deployment-smoke-nonexistent" }),
    ],
  ];
  for (const [path, init] of legacyRequests) {
    const response = await fetchWithTimeout(baseUrl, path, request, init);
    if (response.status !== 404) {
      throw new Error(
        `Removed Better Auth admin endpoint ${path} returned HTTP ${response.status}; expected 404.`,
      );
    }
    await response.arrayBuffer();
  }
}

async function removeTemporaryUser(
  baseUrl: URL,
  cookie: string,
  userId: string,
  request: RequestFunction,
  adminAccessExpectation: AdminAccessSmokeExpectation,
): Promise<void> {
  const legacyCompatible = adminAccessExpectation === "legacy-compatible";
  const response = await fetchWithTimeout(
    baseUrl,
    legacyCompatible
      ? "/api/auth/admin/remove-user"
      : `/api/admin/users/${encodeURIComponent(userId)}`,
    request,
    legacyCompatible
      ? jsonRequest(baseUrl, cookie, { userId })
      : { ...cookieRequest(baseUrl, cookie), method: "DELETE" },
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
  adminAccessExpectation: AdminAccessSmokeExpectation,
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
        adminAccessExpectation,
      );
      if (candidateId) {
        await removeTemporaryUser(
          baseUrl,
          cookie,
          candidateId,
          request,
          adminAccessExpectation,
        );
        candidateId = "";
      }
      await assertTemporaryUserAbsent(
        baseUrl,
        cookie,
        email,
        request,
        adminAccessExpectation,
      );
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
  adminAccessExpectation: AdminAccessSmokeExpectation,
): Promise<void> {
  const payload = await listTemporaryUsers(
    baseUrl,
    cookie,
    email,
    request,
    adminAccessExpectation,
  );
  if (payload.users.length !== 0 || payload.total !== 0) {
    throw new Error("Temporary smoke user still exists after cleanup.");
  }
}

async function assertTemporaryUserHasNoAccess(
  baseUrl: URL,
  cookie: string,
  email: string,
  expectedUserId: string,
  request: RequestFunction,
): Promise<void> {
  const payload = await listTemporaryUsers(
    baseUrl,
    cookie,
    email,
    request,
    "required",
  );
  const user = payload.users[0];
  if (
    payload.total !== 1 ||
    payload.users.length !== 1 ||
    user?.id !== expectedUserId ||
    user.email !== email ||
    !Array.isArray(user.assignedRoleIds) ||
    user.assignedRoleIds.length !== 1 ||
    user.assignedRoleIds[0] !== "system-no-access"
  ) {
    throw new Error(
      "Temporary smoke user did not receive exactly the NO_ACCESS system role.",
    );
  }
}

async function findTemporaryUserId(
  baseUrl: URL,
  cookie: string,
  email: string,
  request: RequestFunction,
  adminAccessExpectation: AdminAccessSmokeExpectation,
): Promise<string> {
  const payload = await listTemporaryUsers(
    baseUrl,
    cookie,
    email,
    request,
    adminAccessExpectation,
  );
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
  adminAccessExpectation: AdminAccessSmokeExpectation,
): Promise<{
  users: Array<{
    id?: unknown;
    email?: unknown;
    assignedRoleIds?: unknown;
  }>;
  total: number;
}> {
  const legacyCompatible = adminAccessExpectation === "legacy-compatible";
  const query = legacyCompatible
    ? new URLSearchParams({
        filterField: "email",
        filterOperator: "eq",
        filterValue: email,
        limit: "1",
      })
    : new URLSearchParams({ query: email });
  const response = await fetchWithTimeout(
    baseUrl,
    `${legacyCompatible ? "/api/auth/admin/list-users" : "/api/admin/users"}?${query.toString()}`,
    request,
    cookieRequest(baseUrl, cookie),
  );
  const payload = (await response.json().catch(() => null)) as {
    users?: Array<{
      id?: unknown;
      email?: unknown;
      assignedRoleIds?: unknown;
    }>;
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
