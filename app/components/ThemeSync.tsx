'use client';

import { useLayoutEffect } from 'react';
import { syncThemeFromStorage, useIsDarkTheme } from './theme-store';

export function ThemeSync() {
  useIsDarkTheme();
  useLayoutEffect(() => {
    syncThemeFromStorage();
    document.documentElement.classList.remove('theme-loading');
  }, []);

  return null;
}
