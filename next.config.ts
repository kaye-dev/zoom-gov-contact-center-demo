import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const allowedDevOrigin = process.env.NEXT_ALLOWED_DEV_ORIGIN?.trim();

export const FAQ_LEGACY_REDIRECTS = [
  {
    source: '/life/frequently-asked-questions/procedure-faq',
    destination: '/life/frequently-asked-questions',
    permanent: false,
  },
  {
    source: '/life/frequently-asked-questions/online-service-faq',
    destination: '/life/frequently-asked-questions',
    permanent: false,
  },
  {
    source:
      '/life/frequently-asked-questions/nanao-branch-office/branch-office-services',
    destination:
      '/life/frequently-asked-questions/administrative-service-center/service-counter-guide',
    permanent: false,
  },
  {
    source:
      '/life/frequently-asked-questions/nanao-branch-office/branch-office-access',
    destination:
      '/life/frequently-asked-questions/administrative-service-center/location-and-access',
    permanent: false,
  },
  {
    source: '/life/frequently-asked-questions/nanao-branch-office/:faq*',
    destination:
      '/life/frequently-asked-questions/administrative-service-center/:faq*',
    permanent: false,
  },
  {
    source: '/life/frequently-asked-questions/safety-net-call-center/:faq*',
    destination:
      '/life/frequently-asked-questions/welfare-consultation-desk/:faq*',
    permanent: false,
  },
  {
    source:
      '/life/frequently-asked-questions/developmental-education-support/:faq*',
    destination: '/life/frequently-asked-questions/education-support/:faq*',
    permanent: false,
  },
];

const nextConfig: NextConfig = {
  ...(allowedDevOrigin ? { allowedDevOrigins: [allowedDevOrigin] } : {}),
  // content/docs 配下の .mdx をダイナミックインポートしてレンダリングする。
  // .mdx をルーティング対象（page.mdx）として使う予定はないが、@next/mdx の
  // 標準構成に合わせて拡張子を許可しておく（content/ は app/ 外なのでルートにはならない）。
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  images: {
    // 開発時は画像最適化キャッシュ（.next/cache/images）を通さず
    // public/ から直接配信し、画像を上書きしたら即反映されるようにする。
    // 本番（next build / start）では従来どおり最適化を有効にする。
    unoptimized: process.env.NODE_ENV === "development",
  },
  experimental: {
    // dev セッション間の Turbopack 永続キャッシュを無効化し、
    // 毎回クリーンな状態でホットリロードさせる
    turbopackFileSystemCacheForDev: false,
  },
  outputFileTracingIncludes: {
    '/life/frequently-asked-questions': [
      './docs/knowledge-base/自治体-基礎自治体-未来市/**/*.md',
      './docs/knowledge-base/自治体-基礎自治体-未来市/_translations/**/*.json',
    ],
    '/life/frequently-asked-questions/**': [
      './docs/knowledge-base/自治体-基礎自治体-未来市/**/*.md',
      './docs/knowledge-base/自治体-基礎自治体-未来市/_translations/**/*.json',
    ],
  },
  async redirects() {
    return FAQ_LEGACY_REDIRECTS;
  },
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
