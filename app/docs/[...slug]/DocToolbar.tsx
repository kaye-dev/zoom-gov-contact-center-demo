"use client";

import { useI18n } from "@/app/i18n/LanguageProvider";

// ドキュメント上部のツールバー。AWS Docs のように「Markdown 版を表示」する
// リンクを提供する。文言はロケール追従（i18n 規約）。
export function DocToolbar({ mdHref }: { mdHref: string }) {
  const { t } = useI18n();

  return (
    <div className="mb-6 flex items-center justify-end border-b border-gray-200 pb-3 dark:border-gray-700">
      {/* href を持つアンカーなので cursor-pointer は付与しない（ui 規約） */}
      <a
        href={mdHref}
        className="text-sm text-blue-700 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      >
        {t.docs.viewAsMarkdown}
      </a>
    </div>
  );
}
