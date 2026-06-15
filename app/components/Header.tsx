'use client';

import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { LanguageMenu } from './LanguageMenu';
import { VoiceChatIcon } from './svg/VoiceChatIcon';
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
        <p className="text-[10px] font-semibold tracking-[0.2em] text-fg-muted">
          {t.cityNameRoman}
        </p>
      </div>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-t-4 border-b border-t-accent border-b-line bg-surface-raised text-fg transition-all">
      {/* 本文（情報を探す）と幅・左右余白を揃えるコンテナ */}
      <div className="mx-auto flex h-20 max-w-7xl items-center px-6">
        {/* ロゴ */}
        {logo}

        {scrolled ? (
          /* コンパクト表示：右側に「知りたい情報が見つからないとき」＋ AI 相談ボタン */
          <div className="ml-auto flex items-center gap-5">
            <span className="hidden text-sm font-medium text-fg sm:inline">
              {t.headerCompact.notFound}
            </span>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2 rounded-full bg-blue-800 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-900"
            >
              <VoiceChatIcon className="h-5 w-5" />
              <span className="whitespace-nowrap">{t.headerCompact.consultAi}</span>
            </button>
          </div>
        ) : (
          /* 通常表示 */
          <nav className="ml-auto flex items-center gap-7">
            <a
              href="#"
              className="flex items-center gap-2 text-sm text-fg transition-colors hover:text-accent"
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
