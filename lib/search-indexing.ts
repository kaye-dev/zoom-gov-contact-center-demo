export const NOINDEX_ROBOTS_METADATA = {
  index: false,
  follow: false,
} as const;

export const X_ROBOTS_TAG_VALUE = "noindex, nofollow" as const;

export const GLOBAL_SEARCH_INDEXING_HEADERS = [
  {
    source: "/:path*",
    headers: [
      {
        key: "X-Robots-Tag",
        value: X_ROBOTS_TAG_VALUE,
      },
    ],
  },
] satisfies Array<{
  source: string;
  headers: Array<{ key: string; value: string }>;
}>;

export const LOCAL_CANONICAL_ORIGIN = "http://localhost:3000" as const;

type CanonicalOriginEnvironment = {
  [key: string]: string | undefined;
  APP_CANONICAL_ORIGIN?: string;
  VERCEL?: string;
};

const UNSAFE_ORIGIN_INPUT_PATTERN = /[%\s\u0000-\u001f\u007f]/u;
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function hasValidHostname(hostname: string): boolean {
  // URL validates IPv6 syntax and retains the brackets in hostname.
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  if (
    hostname.length === 0 ||
    hostname.length > 253 ||
    hostname.startsWith(".") ||
    hostname.endsWith(".") ||
    hostname.includes("..")
  ) {
    return false;
  }
  return hostname.split(".").every((label) => DNS_LABEL_PATTERN.test(label));
}

/**
 * Resolves the single canonical origin used by robots.txt and sitemap.xml.
 * Vercel deployments must configure it explicitly; local execution has a
 * deterministic fallback so local tests and production builds remain usable.
 */
export function resolveCanonicalOrigin(
  env: CanonicalOriginEnvironment = process.env,
): string {
  const rawValue = env.APP_CANONICAL_ORIGIN;
  if (rawValue === undefined) {
    if (env.VERCEL === "1") {
      throw new Error("APP_CANONICAL_ORIGIN is required on Vercel.");
    }
    return LOCAL_CANONICAL_ORIGIN;
  }

  const value = rawValue.trim();
  if (!value || UNSAFE_ORIGIN_INPUT_PATTERN.test(value)) {
    throw new Error("APP_CANONICAL_ORIGIN must be a valid HTTP(S) origin.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_CANONICAL_ORIGIN must be a valid HTTP(S) origin.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !hasValidHostname(url.hostname) ||
    (env.VERCEL === "1" && url.protocol !== "https:")
  ) {
    throw new Error(
      "APP_CANONICAL_ORIGIN must be an exact HTTP(S) origin without credentials, path, query, or fragment; Vercel requires HTTPS.",
    );
  }

  return url.origin;
}

const FIXED_PUBLIC_PATHS = [
  "/",
  "/life",
  "/life/frequently-asked-questions",
  "/news",
] as const;

/** Encodes content slugs as literal URL path segments without URL reinterpretation. */
export function buildSitemapPath(...segments: string[]): string {
  if (segments.length === 0) {
    throw new Error("A sitemap path requires at least one segment.");
  }
  return `/${segments
    .map((segment) => {
      if (
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\") ||
        segment.includes("\0")
      ) {
        throw new Error(
          `Invalid sitemap path segment: ${JSON.stringify(segment)}`,
        );
      }
      return encodeURIComponent(segment);
    })
    .join("/")}`;
}

/** Lists every canonical public HTML path from the same data used by pages. */
export async function listPublicSitemapPaths(): Promise<string[]> {
  const [siteContent, faqContent, docs] = await Promise.all([
    import("../app/content/site-content"),
    import("./faq-content"),
    import("../app/docs/_lib/docs"),
  ]);

  const lifeCategoryPaths = siteContent.lifeCategories
    .filter((category) => category.id !== "faq")
    .map((category) => buildSitemapPath("life", category.slug));
  const lifeTopicPaths = siteContent.lifeCategories.flatMap((category) =>
    category.topics.map(
      (topic) => buildSitemapPath("life", category.slug, topic.slug),
    ),
  );
  const newsPaths = siteContent.newsArticles.map(
    (article) => buildSitemapPath("news", article.slug),
  );
  const faqDepartmentPaths = faqContent.getFaqDepartmentStaticParams().map(
    ({ department }) =>
      buildSitemapPath("life", "frequently-asked-questions", department),
  );
  const faqDetailPaths = faqContent.getFaqCategoryStaticParams().map(
    ({ department, faq }) =>
      buildSitemapPath(
        "life",
        "frequently-asked-questions",
        department,
        faq,
      ),
  );
  const docsPaths = (await docs.listDocSlugs()).map(
    (slug) => buildSitemapPath("docs", ...slug),
  );

  return [
    ...new Set([
      ...FIXED_PUBLIC_PATHS,
      ...lifeCategoryPaths,
      ...lifeTopicPaths,
      ...newsPaths,
      ...faqDepartmentPaths,
      ...faqDetailPaths,
      ...docsPaths,
    ]),
  ].sort((left, right) => left.localeCompare(right, "en"));
}

export async function buildPublicSitemap(
  env: CanonicalOriginEnvironment = process.env,
): Promise<Array<{ url: string }>> {
  const canonicalOrigin = resolveCanonicalOrigin(env);
  const paths = await listPublicSitemapPaths();
  const entries = paths.map((path) => ({
    url: new URL(path, canonicalOrigin).href,
  }));
  if (new Set(entries.map(({ url }) => url)).size !== entries.length) {
    throw new Error("Public sitemap URLs must remain unique after normalization.");
  }
  return entries;
}
