import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

import { lifeCategories, newsArticles } from "../app/content/site-content";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { proxy } from "../proxy";
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
  buildSitemapPath,
  listPublicSitemapPaths,
  resolveCanonicalOrigin,
} from "../lib/search-indexing";

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

test("Proxy-owned redirects retain noindex and nofollow", async () => {
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
  const previousOrigin = process.env.APP_CANONICAL_ORIGIN;
  const previousVercel = process.env.VERCEL;
  process.env.APP_CANONICAL_ORIGIN = "https://city.example.jp";
  delete process.env.VERCEL;
  try {
    assert.deepEqual(robots(), {
      rules: {
        userAgent: "*",
        allow: "/",
      },
      sitemap: "https://city.example.jp/sitemap.xml",
    });
  } finally {
    if (previousOrigin === undefined) {
      delete process.env.APP_CANONICAL_ORIGIN;
    } else {
      process.env.APP_CANONICAL_ORIGIN = previousOrigin;
    }
    if (previousVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previousVercel;
    }
  }
});

test("sitemap contains the complete stable set of 275 canonical public HTML URLs", async () => {
  const paths = await listPublicSitemapPaths();
  const expectedPaths = [
    "/",
    "/life",
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

  assert.equal(paths.length, 275);
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
  assert.equal(entries.length, 275);
  assert.deepEqual(
    entries.map(({ url }) => url),
    paths.map((path) => new URL(path, "https://city.example.jp").href),
  );
  assert.ok(entries.every((entry) => Object.keys(entry).length === 1));
  assert.ok(entries.every(({ url }) => new URL(url).origin === "https://city.example.jp"));
});

test("the sitemap metadata route uses APP_CANONICAL_ORIGIN", async () => {
  const previousOrigin = process.env.APP_CANONICAL_ORIGIN;
  const previousVercel = process.env.VERCEL;
  process.env.APP_CANONICAL_ORIGIN = "https://city.example.jp";
  delete process.env.VERCEL;
  try {
    const entries = await sitemap();
    assert.equal(entries.length, 275);
    assert.ok(
      entries.every(({ url }) =>
        url.startsWith("https://city.example.jp/"),
      ),
    );
  } finally {
    if (previousOrigin === undefined) {
      delete process.env.APP_CANONICAL_ORIGIN;
    } else {
      process.env.APP_CANONICAL_ORIGIN = previousOrigin;
    }
    if (previousVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previousVercel;
    }
  }
});
