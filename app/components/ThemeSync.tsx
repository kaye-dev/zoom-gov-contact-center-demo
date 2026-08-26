'use client';

import { useLayoutEffect } from 'react';
import { syncThemeFromStorage, useIsDarkTheme } from './theme-store';

export function ThemeSync() {
  const isDark = useIsDarkTheme();
  useLayoutEffect(() => {
    const synchronizedIsDark = syncThemeFromStorage();
    if (isDark === synchronizedIsDark) {
      document.documentElement.classList.remove('theme-loading');
    }
  }, [isDark]);

  return null;
}
