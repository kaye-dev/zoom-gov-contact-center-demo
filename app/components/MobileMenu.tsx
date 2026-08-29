'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/LanguageProvider';
import { StarEmblem } from './svg/StarEmblemIcon';
import { PinIcon } from './svg/PinIcon';
import { CloseIcon } from './svg/CloseIcon';
import { LanguageMenu } from './LanguageMenu';
import { ThemeToggle } from './ThemeToggle';

type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * 右からスライドインするモバイル/タブレット用ドロワー。
 * lg 未満でヘッダー右側に隠れるナビ項目（アクセス / 言語 / テーマ）をまとめて表示する。
 */
export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const { t } = useI18n();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Esc で閉じる + 開いている間は本文スクロールをロック
  useEffect(() => {
    if (!open) return;

    const focusFrame = requestAnimationFrame(() => {
      const closeButton = closeButtonRef.current;
      if (closeButton?.isConnected) closeButton.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      {/* 背景オーバーレイ（クリックで閉じる） */}
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* 右パネル */}
      <div
        role="dialog"
        aria-modal="true"
        className="absolute right-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-surface-raised text-fg shadow-xl"
      >
        {/* ヘッダー: ロゴ + 閉じるボタン */}
        <div className="flex h-20 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-2">
            <StarEmblem className="h-9 w-9 shrink-0" />
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-wide">{t.cityName}</p>
              <p className="text-[9px] font-semibold tracking-[0.2em] text-fg-muted">
                {t.cityNameRoman}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t.nav.closeMenu}
            className="flex cursor-pointer items-center justify-center rounded-md p-1 text-fg transition-colors hover:bg-surface-hover"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>

        {/* 本文（縦並び） */}
        <nav className="flex flex-col gap-2 p-5">
          <a
            href="#"
            onClick={onClose}
            className="flex items-center gap-2 py-2 text-sm text-fg transition-colors hover:text-accent"
          >
            <PinIcon className="h-5 w-5 shrink-0" />
            <span>{t.nav.access}</span>
          </a>

          <div className="border-t border-line-subtle pt-3">
            <LanguageMenu />
          </div>

          <div className="border-t border-line-subtle pt-3">
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </div>
  );
}
