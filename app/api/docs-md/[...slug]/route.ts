import { readDocSource } from "@/app/docs/_lib/docs";

type RouteContext = {
  params: Promise<{ slug: string[] }>;
};

// /docs/:slug*.md は next.config の beforeFiles rewrite でここへ流れてくる。
// 同じソースファイル（content/docs 配下）の raw Markdown をそのまま返す。
// レイアウト等の HTML は一切含めない。
export async function GET(_request: Request, { params }: RouteContext) {
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
      // 静的な docs を想定。CDN で長期キャッシュしつつ再検証可能にする。
      "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate",
    },
  });
}
