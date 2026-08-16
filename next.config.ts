import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { GLOBAL_SEARCH_INDEXING_HEADERS } from "./lib/search-indexing";

const allowedDevOrigin = process.env.NEXT_ALLOWED_DEV_ORIGIN?.trim();

const nextConfig: NextConfig = {
  ...(allowedDevOrigin ? { allowedDevOrigins: [allowedDevOrigin] } : {}),
  // content/docs 配下の .mdx をダイナミックインポートしてレンダリングする。
  // .mdx をルーティング対象（page.mdx）として使う予定はないが、@next/mdx の
  // 標準構成に合わせて拡張子を許可しておく（content/ は app/ 外なのでルートにはならない）。
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  experimental: {
    // dev セッション間の Turbopack 永続キャッシュを無効化し、
    // 毎回クリーンな状態でホットリロードさせる
    turbopackFileSystemCacheForDev: false,
  },
  outputFileTracingIncludes: {
    '/docs/**': ['./content/docs/**/*'],
    '/api/docs-md/**': ['./content/docs/**/*'],
    '/sitemap.xml': [
      './content/docs/**/*',
      './docs/knowledge-base/自治体-基礎自治体-未来市/**/*.md',
      './docs/knowledge-base/自治体-基礎自治体-未来市/_translations/**/*.json',
    ],
    '/life/frequently-asked-questions': [
      './docs/knowledge-base/自治体-基礎自治体-未来市/**/*.md',
      './docs/knowledge-base/自治体-基礎自治体-未来市/_translations/**/*.json',
    ],
    '/life/frequently-asked-questions/**': [
      './docs/knowledge-base/自治体-基礎自治体-未来市/**/*.md',
      './docs/knowledge-base/自治体-基礎自治体-未来市/_translations/**/*.json',
    ],
  },
  async headers() {
    return [...GLOBAL_SEARCH_INDEXING_HEADERS];
  },
  // Framework-generated trailing-slash redirects can drop custom headers.
  // Proxy owns normalization so redirect responses retain X-Robots-Tag.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return {
      // beforeFiles: ファイルシステム/ページ照合より前に書き換える。
      // catch-all ルート /docs/[...slug] が "foo/bar.md" を先に飲み込むのを防ぐため、
      // .md / .html の拡張子付き URL はここで内部ルートへ振り分ける。
      beforeFiles: [
        {
          // /docs/foo/bar.md → Route Handler で raw Markdown を返す
          source: "/docs/:slug*\\.md",
          destination: "/api/docs-md/:slug*",
        },
        {
          // /docs/foo/bar.html → 通常の HTML ページ（拡張子なし）と同一扱い
          source: "/docs/:slug*\\.html",
          destination: "/docs/:slug*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

const withMDX = createMDX({
  // .md / .mdx の双方を MDX としてコンパイルする（既定は .mdx のみ）。
  extension: /\.(md|mdx)$/,
  options: {
    // Turbopack ではプラグインを文字列名で指定する（関数は Rust へ渡せないため）。
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
