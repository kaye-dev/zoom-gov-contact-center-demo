import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";

// ドキュメントのソース（single source of truth）を置くディレクトリ。
// 通常ページ(/docs/[...slug]) と raw Markdown(/api/docs-md/[...slug]) の
// 双方がここを参照する。
export const DOCS_DIR = path.join(process.cwd(), "content", "docs");

// 受け付けるソース拡張子。優先順位順（.mdx を優先）。
const SOURCE_EXTENSIONS = [".mdx", ".md"] as const;

/**
 * slug 配列を安全なドキュメント相対パスに正規化する。
 * パストラバーサル（`..`）や絶対パス、空セグメント、区切り文字混入を排除する。
 * 不正な場合は null を返す。
 */
export function normalizeDocSlug(slug: string[] | undefined): string | null {
  if (!slug || slug.length === 0) return null;

  for (const segment of slug) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("\0")
    ) {
      return null;
    }
  }

  const relative = slug.join("/");

  // 念のため解決後パスが DOCS_DIR 配下に収まることを検証する。
  const resolved = path.resolve(DOCS_DIR, relative);
  if (resolved !== DOCS_DIR && !resolved.startsWith(DOCS_DIR + path.sep)) {
    return null;
  }

  return relative;
}

/**
 * slug に対応する実在ソースファイルの絶対パスを返す（.mdx → .md の順に探索）。
 * 見つからなければ null。
 */
export async function findDocFile(
  slug: string[] | undefined,
): Promise<string | null> {
  const relative = normalizeDocSlug(slug);
  if (relative === null) return null;

  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = path.join(DOCS_DIR, relative + ext);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // 次の拡張子を試す
    }
  }
  return null;
}

/**
 * slug に対応するソースの raw Markdown テキストを返す。見つからなければ null。
 */
export async function readDocSource(
  slug: string[] | undefined,
): Promise<string | null> {
  const file = await findDocFile(slug);
  if (!file) return null;
  return fs.readFile(file, "utf8");
}

/**
 * content/docs 配下の全ドキュメント slug を列挙する（generateStaticParams 用）。
 * 例: ["example"], ["contact-center", "enable-contactlens-integration"]
 */
export async function listDocSlugs(): Promise<string[][]> {
  const slugs: string[][] = [];

  async function walk(dir: string, prefix: string[]): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, [...prefix, entry.name]);
        continue;
      }
      const ext = path.extname(entry.name);
      if ((SOURCE_EXTENSIONS as readonly string[]).includes(ext)) {
        const base = entry.name.slice(0, -ext.length);
        slugs.push([...prefix, base]);
      }
    }
  }

  await walk(DOCS_DIR, []);
  return slugs;
}
