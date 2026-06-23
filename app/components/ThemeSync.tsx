'use client';

import { useIsDarkTheme } from './theme-store';

export function ThemeSync() {
  useIsDarkTheme();

  return null;
}
