'use client';

import { useSyncExternalStore } from 'react';

const THEME_CHANGE_EVENT = 'mirai-city-theme-change';

function getThemeSnapshot() {
  return document.documentElement.classList.contains('dark');
}

function getServerThemeSnapshot() {
  return false;
}

function syncThemeFromStorage() {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.classList.toggle('dark', stored === 'dark');
    }
  } catch {
    /* localStorage が使えない環境では現在の DOM 状態を維持 */
  }
}

function subscribeThemeChange(onStoreChange: () => void) {
  const notify = () => onStoreChange();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === 'theme') syncThemeFromStorage();
    onStoreChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, notify);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, notify);
    window.removeEventListener('storage', handleStorage);
  };
}

export function useIsDarkTheme() {
  return useSyncExternalStore(
    subscribeThemeChange,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
}

export function setStoredTheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
  try {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  } catch {
    /* localStorage が使えない環境では DOM の切替だけ行う */
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
