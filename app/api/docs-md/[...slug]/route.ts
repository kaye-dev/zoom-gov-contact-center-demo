import { X_ROBOTS_TAG_VALUE } from "@/lib/search-indexing";
import { readDocSource } from "@/app/docs/_lib/docs";
import { requirePublicAccess } from "@/lib/server/public-access-gate";
import { SITE_ACCESS_CACHE_CONTROL } from "@/lib/site-access";

type RouteContext = {
  params: Promise<{ slug: string[] }>;
};

// /docs/:slug*.md は next.config の beforeFiles rewrite でここへ流れてくる。
// 同じソースファイル（content/docs 配下）の raw Markdown をそのまま返す。
// レイアウト等の HTML は一切含めない。
export async function GET(_request: Request, { params }: RouteContext) {
  const access = await requirePublicAccess(_request);
  if (access.response) return access.response;
  const { slug } = await params;

  const source = await readDocSource(slug);
  if (source === null) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(source, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": X_ROBOTS_TAG_VALUE,
      // 静的な docs を想定。CDN で長期キャッシュしつつ再検証可能にする。
      "Cache-Control": access.restricted ? SITE_ACCESS_CACHE_CONTROL : "public, max-age=0, s-maxage=3600, must-revalidate",
    },
  });
}
