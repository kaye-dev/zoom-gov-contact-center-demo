'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { LanguageMenu } from './LanguageMenu';
import { MobileMenu } from './MobileMenu';
import { VoiceChatIcon } from './svg/VoiceChatIcon';
import { StarEmblem } from './svg/StarEmblemIcon';
import { PinIcon } from './svg/PinIcon';
import { MenuIcon } from './svg/MenuIcon';
import { useI18n } from '../i18n/LanguageProvider';

export function Header() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ロゴ（通常・コンパクト両状態で共通）
  const logo = (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-3 pr-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <StarEmblem className="h-11 w-11 shrink-0" />
      <div className="leading-tight">
        <p className="text-2xl font-bold tracking-wide">{t.cityName}</p>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-fg-muted">
          {t.cityNameRoman}
        </p>
      </div>
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 border-t-4 border-b border-t-accent border-b-line bg-surface-raised text-fg transition-all">
      {/* 本文（情報を探す）と幅・左右余白を揃えるコンテナ */}
      <div className="mx-auto flex h-20 max-w-7xl items-center px-4 md:px-6">
        {/* ロゴ */}
        {logo}

        {/* デスクトップ（lg 以上）の右側ナビ */}
        <div className="ml-auto hidden items-center lg:flex">
          {scrolled ? (
            /* コンパクト表示：右側に「知りたい情報が見つからないとき」＋ AI 相談ボタン */
            <div className="flex items-center gap-5">
              <span className="text-sm font-medium text-fg">
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
            <nav className="flex items-center gap-7">
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

        {/* モバイル/タブレット（lg 未満）のハンバーガーボタン */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t.nav.openMenu}
          aria-expanded={menuOpen}
          className="ml-auto flex cursor-pointer items-center justify-center rounded-md p-2 text-fg transition-colors hover:bg-surface-hover lg:hidden"
        >
          <MenuIcon className="h-7 w-7" />
        </button>
      </div>

      {/* ドロワーメニュー（lg 未満） */}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
