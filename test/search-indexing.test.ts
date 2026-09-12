import { Pool } from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

import {
  getLifeCategories,
  getNewsArticles,
} from "../app/content/site-content";
import { proxy } from "../proxy";
import { DEFAULT_TENANT_KEY, TENANTS } from "../lib/tenants";
import {
  getFaqCategoryStaticParams,
  getFaqDepartmentStaticParams,
} from "../lib/faq-content";
import {
  GLOBAL_SEARCH_INDEXING_HEADERS,
  LOCAL_CANONICAL_ORIGIN,
  NOINDEX_ROBOTS_METADATA,
  X_ROBOTS_TAG_VALUE,
  buildPublicSitemap,
  buildRobotsForHost,
  buildSitemapPath,
  listPublicSitemapPaths,
  resolveCanonicalOrigin,
} from "../lib/search-indexing";

const lifeCategories = getLifeCategories(DEFAULT_TENANT_KEY);
const newsArticles = getNewsArticles(DEFAULT_TENANT_KEY);

test("root metadata and every response opt out of indexing", () => {
  assert.deepEqual(NOINDEX_ROBOTS_METADATA, {
    index: false,
    follow: false,
  });
  assert.deepEqual(GLOBAL_SEARCH_INDEXING_HEADERS, [
    {
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
  ]);
  assert.equal(X_ROBOTS_TAG_VALUE, "noindex, nofollow");

  const layoutSource = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layoutSource, /robots:\s*NOINDEX_ROBOTS_METADATA/);

  const nextConfigSource = readFileSync(
    new URL("../next.config.ts", import.meta.url),
    "utf8",
  );
  assert.match(nextConfigSource, /async headers\(\)/);
  assert.match(nextConfigSource, /GLOBAL_SEARCH_INDEXING_HEADERS/);
});

test("canonical origin falls back only outside Vercel and normalizes configured origins", () => {
  assert.equal(resolveCanonicalOrigin({}), LOCAL_CANONICAL_ORIGIN);
  assert.equal(
    resolveCanonicalOrigin({
      APP_CANONICAL_ORIGIN: " https://city.example.jp/ ",
    }),
    "https://city.example.jp",
  );
  assert.equal(
    resolveCanonicalOrigin({
      APP_CANONICAL_ORIGIN: "http://127.0.0.1:3001",
    }),
    "http://127.0.0.1:3001",
  );
  assert.throws(
    () => resolveCanonicalOrigin({ VERCEL: "1" }),
    /APP_CANONICAL_ORIGIN is required on Vercel/,
  );
});

test("canonical origin rejects non-origin and unsafe values", () => {
  for (const APP_CANONICAL_ORIGIN of [
    "",
    "city.example.jp",
    "ftp://city.example.jp",
    "https://user:password@city.example.jp",
    "https://city.example.jp/path",
    "https://city.example.jp?preview=1",
    "https://city.example.jp#fragment",
    "https://.example",
    "https://example..com",
    "https://-bad.example",
    "https://bad-.example",
    "https://%65xample.com",
    "https://city.example.jp invalid",
  ]) {
    assert.throws(
      () => resolveCanonicalOrigin({ APP_CANONICAL_ORIGIN }),
      /APP_CANONICAL_ORIGIN/,
      APP_CANONICAL_ORIGIN,
    );
  }

  assert.throws(
    () =>
      resolveCanonicalOrigin({
        APP_CANONICAL_ORIGIN: "http://city.example.jp",
        VERCEL: "1",
      }),
    /Vercel requires HTTPS/,
  );
});

test("sitemap path segments are encoded before URL resolution", () => {
  assert.equal(buildSitemapPath("docs", "a#b"), "/docs/a%23b");
  assert.equal(buildSitemapPath("docs", "a?b"), "/docs/a%3Fb");
  assert.equal(buildSitemapPath("docs", "%2e%2e"), "/docs/%252e%252e");
  for (const invalidSegments of [
    [] as string[],
    ["docs", ""],
    ["docs", "."],
    ["docs", ".."],
    ["docs", "nested/slug"],
    ["docs", "nested\\slug"],
  ]) {
    assert.throws(() => buildSitemapPath(...invalidSegments), /sitemap path/iu);
  }
});

test("Proxy-owned redirects retain noindex and nofollow", async (t) => {
  t.mock.method(Pool.prototype, "query", async (_query: string, values: unknown[]) => ({ rows: ["global", "lg", "univ"].map(scope => ({scope,environment:values[0],enabled:false,codeHash:null,sessionDays:1,revision:1,updatedAt:new Date()})),rowCount:3 }));
  t.mock.method(Pool.prototype, "connect", async () => ({query:async ({values}:{values:unknown[]})=>({rows:[{environment:values[1],version:1,mode:"DISABLED",scheduledStartAt:null,scheduledEndAt:null,revision:1,updatedAt:new Date()}]}),release(){}}));
  const entryLower = await proxy(new NextRequest("http://localhost:3002/news?source=test"));
  assert.equal(entryLower.status, 307);
  assert.equal(entryLower.headers.get("location"), "http://localhost:3002/");
  const entryRoot = await proxy(new NextRequest("http://localhost:3002/", {headers:{"x-public-request-path":"/admin", "x-public-request-method":"GET", "x-mirai-maintenance-rewrite":"1"}}));
  assert.equal(entryRoot.headers.get("x-middleware-request-x-public-request-path"), "/");
  assert.equal(entryRoot.headers.has("x-middleware-request-x-mirai-maintenance-rewrite"), false);
  const legacy = await proxy(
    new NextRequest(
      "https://city.example.jp/life/frequently-asked-questions/nanao-branch-office/branch-office-access?from=legacy",
    ),
  );
  assert.equal(legacy.status, 307);
  assert.equal(
    legacy.headers.get("location"),
    "https://city.example.jp/life/frequently-asked-questions/administrative-service-center/location-and-access?from=legacy",
  );
  assert.equal(legacy.headers.get("x-robots-tag"), X_ROBOTS_TAG_VALUE);

  const trailingSlash = await proxy(
    new NextRequest("https://city.example.jp/news/?from=trailing"),
  );
  assert.equal(trailingSlash.status, 308);
  assert.equal(
    trailingSlash.headers.get("location"),
    "https://city.example.jp/news?from=trailing",
  );
  assert.equal(trailingSlash.headers.get("x-robots-tag"), X_ROBOTS_TAG_VALUE);

  const nextConfigSource = readFileSync(
    new URL("../next.config.ts", import.meta.url),
    "utf8",
  );
  assert.match(nextConfigSource, /skipTrailingSlashRedirect:\s*true/);
  assert.doesNotMatch(nextConfigSource, /async redirects\(\)/);
});

test("robots allows crawling so crawlers can read noindex and names the canonical sitemap", () => {
  const env = { APP_CANONICAL_ORIGIN: "https://city.example.jp" };

  // An unregistered host keeps the configured canonical origin.
  assert.deepEqual(buildRobotsForHost("preview.vercel.app", env), {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://city.example.jp/sitemap.xml",
  });

  // Each registered tenant domain advertises its own sitemap.
  for (const tenant of TENANTS) {
    assert.deepEqual(buildRobotsForHost(tenant.productionHost, env), {
      rules: {
        userAgent: "*",
        allow: "/",
      },
      sitemap: `https://${tenant.productionHost}/sitemap.xml`,
    });
  }
});

test("the robots route resolves the canonical origin from the request host", () => {
  const robotsSource = readFileSync(
    new URL("../app/robots.ts", import.meta.url),
    "utf8",
  );
  assert.match(robotsSource, /const host = \(await headers\(\)\)\.get\("host"\)/);
  assert.match(robotsSource, /buildRobotsForHost\(host\)/);
});

test("sitemap contains the complete stable set of 276 canonical public HTML URLs", async () => {
  const paths = await listPublicSitemapPaths();
  const expectedPaths = [
    "/",
    "/life",
    "/life/emergency-safety-disaster/disaster-prevention-radio",
    "/life/frequently-asked-questions",
    "/news",
    ...lifeCategories
      .filter((category) => category.id !== "faq")
      .map((category) => `/life/${category.slug}`),
    ...lifeCategories.flatMap((category) =>
      category.topics.map(
        (topic) => `/life/${category.slug}/${topic.slug}`,
      ),
    ),
    ...newsArticles.map((article) => `/news/${article.slug}`),
    ...getFaqDepartmentStaticParams().map(
      ({ department }) => `/life/frequently-asked-questions/${department}`,
    ),
    ...getFaqCategoryStaticParams().map(
      ({ department, faq }) =>
        `/life/frequently-asked-questions/${department}/${faq}`,
    ),
    "/docs/building-guide",
    "/docs/feedback",
    "/docs/privacy-policy",
    "/docs/terms-of-service",
  ].sort((left, right) => left.localeCompare(right, "en"));

  assert.equal(paths.length, 276);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(paths, expectedPaths);
  assert.deepEqual(paths, [...paths].sort((left, right) => left.localeCompare(right, "en")));

  for (const path of paths) {
    assert.match(path, /^\//);
    assert.doesNotMatch(path, /(?:\.html|\.md)$/);
    assert.doesNotMatch(
      path,
      /^\/(?:admin|api|login|forgot-password|change-password|maintenance-unavailable)(?:\/|$)/,
    );
  }

  const entries = await buildPublicSitemap({
    APP_CANONICAL_ORIGIN: "https://city.example.jp",
  });
  assert.equal(entries.length, 276);
  assert.deepEqual(
    entries.map(({ url }) => url),
    paths.map((path) => new URL(path, "https://city.example.jp").href),
  );
  assert.ok(entries.every((entry) => Object.keys(entry).length === 1));
  assert.ok(entries.every(({ url }) => new URL(url).origin === "https://city.example.jp"));
});

test("the sitemap uses APP_CANONICAL_ORIGIN for unregistered hosts and the tenant origin otherwise", async () => {
  const env = { APP_CANONICAL_ORIGIN: "https://city.example.jp" };

  const fallbackEntries = await buildPublicSitemap(env, "preview.vercel.app");
  assert.equal(fallbackEntries.length, 276);
  assert.ok(
    fallbackEntries.every(({ url }) =>
      url.startsWith("https://city.example.jp/"),
    ),
  );

  for (const tenant of TENANTS) {
    const entries = await buildPublicSitemap(env, tenant.productionHost);
    const expectedPaths = await listPublicSitemapPaths(tenant.key);
    assert.equal(entries.length, expectedPaths.length);
    assert.ok(
      entries.every(({ url }) =>
        url.startsWith(`https://${tenant.productionHost}/`),
      ),
    );
  }
});

test("the university sitemap exposes university routes without civic life routes", async () => {
  const paths = await listPublicSitemapPaths("univ");
  for (const path of [
    "/admissions",
    "/academics",
    "/campus-life",
    "/scholarships",
    "/careers",
    "/faq",
    "/news",
    "/consultation",
  ]) {
    assert.ok(paths.includes(path), path);
  }
  assert.ok(paths.every((path) => !path.startsWith("/life")));
});

test("the sitemap route resolves the canonical origin from the request host", () => {
  const sitemapSource = readFileSync(
    new URL("../app/sitemap.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    sitemapSource,
    /buildPublicSitemap\(process\.env, \(await headers\(\)\)\.get\("host"\)\)/,
  );
});
