import { notFound } from "next/navigation";
import { PublicInformationLayout } from "@/app/components/PublicInformationLayout";
import { findDocFile, listDocSlugs, normalizeDocSlug } from "../_lib/docs";

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

// content/docs 配下のドキュメントをビルド時に静的生成する。
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const slugs = await listDocSlugs();
  return slugs.map((slug) => ({ slug }));
}

// generateStaticParams に無いパスでもリクエスト時に解決を試み、
// 実在しなければ notFound() で 404 にする。
export const dynamicParams = true;

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;

  const relative = normalizeDocSlug(slug);
  if (relative === null) notFound();

  const file = await findDocFile(slug);
  if (!file) notFound();

  // 解決したソース（.mdx 優先、.md フォールバック）を動的インポートして描画する。
  // ソースが single source of truth で、.md エンドポイントは同じファイルを raw 返却する。
  let MdxContent: React.ComponentType;
  try {
    const mod = file.endsWith(".md")
      ? await import(
          /* turbopackOptional: true */ `@/content/docs/${relative}.md`
        )
      : await import(`@/content/docs/${relative}.mdx`);
    MdxContent = mod.default;
  } catch {
    notFound();
  }

  return (
    <PublicInformationLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <article>
          <MdxContent />
        </article>
      </div>
    </PublicInformationLayout>
  );
}
