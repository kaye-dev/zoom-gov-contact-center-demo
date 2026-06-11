'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useI18n } from '../i18n/LanguageProvider';
import type { Dictionary } from '../i18n/dictionaries';

/** 1 行あたりの件数。初期表示・「もっと見る」での追加件数に使う */
const STEP = 4;
/** 記事画像が未指定のときに使う既定画像 */
const DEFAULT_IMAGE = '/news/news-default-item.png';

type Article = {
  id: keyof Dictionary['news']['articles'];
  date: string; // ISO 形式。表示はロケールに合わせて整形する
  category: 'new' | 'featured';
  image?: string;
};

// ロケール非依存のメタ情報（タイトルは辞書 t.news.articles 側で管理）
const articles: Article[] = [
  { id: 'assembly', date: '2026-06-02', category: 'new' },
  { id: 'construction', date: '2026-06-09', category: 'new' },
  { id: 'floodBoard', date: '2026-04-02', category: 'new' },
  { id: 'aircon', date: '2026-05-13', category: 'new' },
  { id: 'floodDamage', date: '2026-06-03', category: 'featured' },
  { id: 'myNumberExpress', date: '2026-05-23', category: 'featured' },
  { id: 'minpaku', date: '2026-06-09', category: 'new' },
  { id: 'measles', date: '2026-04-30', category: 'new' },
  { id: 'furigana', date: '2026-05-26', category: 'new' },
  { id: 'setayell', date: '2026-05-25', category: 'new' },
  { id: 'childcare', date: '2026-05-27', category: 'new' },
  { id: 'solar', date: '2026-05-27', category: 'new' },
];

export function News() {
  const { t, locale } = useI18n();
  const [visibleCount, setVisibleCount] = useState(STEP);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      {/* 見出し（FindInfo と同じスタイル） */}
      <div className="mb-12 flex items-baseline gap-4">
        <h2 className="text-3xl font-bold tracking-wide">{t.news.title}</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t.news.subtitle}
        </span>
      </div>

      {/* 記事カードグリッド（デスクトップ 4 列） */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {articles.slice(0, visibleCount).map((article) => {
          const title = t.news.articles[article.id];
          const categoryLabel =
            article.category === 'new'
              ? t.news.category.new
              : t.news.category.featured;
          const formattedDate = dateFormatter.format(new Date(article.date));

          return (
            <a key={article.id} href="#" className="group block">
              <Image
                src={article.image ?? DEFAULT_IMAGE}
                alt={title}
                width={400}
                height={240}
                className="aspect-[5/3] w-full object-cover"
              />
              {/* テキスト列: 上の区切り線 → カテゴリ → タイトル → 日付 */}
              <div className="border-t border-gray-300 pt-2 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {categoryLabel}
                </p>
                <h3 className="mt-1 text-base font-bold leading-snug text-gray-800 transition-colors group-hover:text-primary dark:text-gray-100">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {formattedDate}
                </p>
              </div>
            </a>
          );
        })}
      </div>

      {/* 全件表示前は「もっと見る」、表示し切ったら「閉じる」に切り替える */}
      <div className="mt-12 flex justify-center">
        {visibleCount < articles.length ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + STEP)}
            className="cursor-pointer rounded-md border border-gray-300 px-10 py-3 text-sm transition-colors hover:bg-primary-50 dark:border-gray-700 dark:hover:bg-primary-900/20"
          >
            {t.news.more}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setVisibleCount(STEP)}
            className="cursor-pointer rounded-md border border-gray-300 px-10 py-3 text-sm transition-colors hover:bg-primary-50 dark:border-gray-700 dark:hover:bg-primary-900/20"
          >
            {t.news.close}
          </button>
        )}
      </div>
    </section>
  );
}
