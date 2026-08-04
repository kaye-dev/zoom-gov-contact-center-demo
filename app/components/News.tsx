'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { newsArticles } from '../content/site-content';
import { useI18n } from '../i18n/LanguageProvider';

/** 1 行あたりの件数。初期表示・「もっと見る」での追加件数に使う */
const STEP = 4;
/** 記事画像が未指定のときに使う既定画像 */
const DEFAULT_IMAGE = '/news/news-default-item.png';

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
      <div className="mb-12 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-2xl font-bold tracking-wide md:text-3xl">{t.news.title}</h2>
        <span className="text-sm text-fg-muted">
          {t.news.subtitle}
        </span>
      </div>

      {/* 記事カードグリッド（デスクトップ 4 列） */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {newsArticles.slice(0, visibleCount).map((article, index) => {
          const title = t.news.articles[article.id];
          const categoryLabel =
            article.category === 'new'
              ? t.news.category.new
              : t.news.category.featured;
          const formattedDate = dateFormatter.format(new Date(article.date));

          return (
            <Link key={article.id} href={`/news/${article.slug}`} className="group block">
              <Image
                src={article.image ?? DEFAULT_IMAGE}
                alt={title}
                width={400}
                height={240}
                loading={index < STEP || !article.image ? 'eager' : 'lazy'}
                className="aspect-[5/3] w-full object-cover"
              />
              {/* テキスト列: 上の区切り線 → カテゴリ → タイトル → 日付 */}
              <div className="border-t border-line pt-2">
                <p className="text-xs text-fg-muted">
                  {categoryLabel}
                </p>
                <h3 className="mt-1 text-base font-bold leading-snug text-fg transition-colors group-hover:text-accent">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-fg-muted">
                  {formattedDate}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 全件表示前は「もっと見る」、表示し切ったら「閉じる」に切り替える */}
      <div className="mt-12 flex justify-center">
        {visibleCount < newsArticles.length ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + STEP)}
            className="cursor-pointer rounded-md border border-line px-10 py-3 text-sm transition-colors hover:bg-surface-hover"
          >
            {t.news.more}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setVisibleCount(STEP)}
            className="cursor-pointer rounded-md border border-line px-10 py-3 text-sm transition-colors hover:bg-surface-hover"
          >
            {t.news.close}
          </button>
        )}
      </div>
    </section>
  );
}
