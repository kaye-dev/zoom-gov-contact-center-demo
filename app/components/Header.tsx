'use client';

import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { LanguageMenu } from './LanguageMenu';
import { SearchMenuIcon } from './svg/SearchMenuIcon';
import { StarEmblem } from './svg/StarEmblemIcon';
import { PinIcon } from './svg/PinIcon';
import { useI18n } from '../i18n/LanguageProvider';

export function Header() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ロゴ（通常・コンパクト両状態で共通）
  const logo = (
    <div className="flex items-center gap-3 pr-4">
      <StarEmblem className="h-11 w-11 shrink-0" />
      <div className="leading-tight">
        <p className="text-2xl font-bold tracking-wide">{t.cityName}</p>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 dark:text-gray-400">
          {t.cityNameRoman}
        </p>
      </div>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-t-4 border-b border-t-primary border-b-gray-200 bg-white text-gray-800 transition-all dark:border-b-gray-700 dark:bg-gray-900 dark:text-gray-100">
      {/* 本文（情報を探す）と幅・左右余白を揃えるコンテナ */}
      <div className="mx-auto flex h-20 max-w-7xl items-center px-6">
        {/* ロゴ */}
        {logo}

        {scrolled ? (
          /* コンパクト表示：右側に「知りたい情報が見つからないとき」＋ AI 相談ボタン */
          <div className="ml-auto flex items-center gap-5">
            <span className="hidden text-sm font-medium text-gray-700 sm:inline dark:text-gray-200">
              {t.headerCompact.notFound}
            </span>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2 rounded-full bg-blue-800 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-900"
            >
              <SearchMenuIcon className="h-5 w-5" />
              <span className="whitespace-nowrap">{t.headerCompact.consultAi}</span>
            </button>
          </div>
        ) : (
          /* 通常表示 */
          <nav className="ml-auto flex items-center gap-7">
            <a
              href="#"
              className="flex items-center gap-2 text-sm text-gray-700 transition-colors hover:text-blue-700 dark:text-gray-200 dark:hover:text-blue-300"
            >
              <PinIcon className="h-5 w-5 shrink-0" />
              <span className="whitespace-nowrap">{t.nav.access}</span>
            </a>

            {/* 言語切り替えメニュー */}
            <LanguageMenu />

            {/* ライト/ダークモード切り替えスイッチ */}
            <ThemeToggle />
          </nav>
        )}
      </div>
    </header>
  );
}
