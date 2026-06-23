'use client';

import { useI18n } from '../i18n/LanguageProvider';
import { setStoredTheme, useIsDarkTheme } from './theme-store';

export function ThemeToggle() {
  const { t } = useI18n();
  const isDark = useIsDarkTheme();

  const toggle = () => {
    const next = !isDark;
    setStoredTheme(next);
  };

  return (
    <div className="flex items-center gap-2">
      {/* スイッチ左右のラベル（何の切替か一目で分かるように補助表示） */}
      <span className="text-sm text-fg-muted">{t.theme.light}</span>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="ライト/ダークモードの切り替え"
        onClick={toggle}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-gray-300 bg-gradient-to-r from-gray-200 to-gray-400 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:from-gray-600 dark:to-gray-800`}
      >
        {/* 丸いつまみ：ライト時は左、ダーク時は右へスライド */}
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
            isDark ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
      <span className="text-sm text-fg-muted">{t.theme.dark}</span>
    </div>
  );
}
