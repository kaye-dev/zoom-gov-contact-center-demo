'use client';

import { useSyncExternalStore } from 'react';

const THEME_STORAGE_KEY = 'theme';
const THEME_CHANGE_EVENT = 'mirai-city-theme-change';

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* localStorage が使えない環境では OS 設定を使う */
  }
  return null;
}

function getSystemThemeSnapshot() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getPreferredThemeSnapshot() {
  const stored = getStoredTheme();
  if (stored) return stored === 'dark';
  return getSystemThemeSnapshot();
}

function applyThemeClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
}

function getThemeSnapshot() {
  return getPreferredThemeSnapshot();
}

function getServerThemeSnapshot() {
  return false;
}

function syncThemeFromStorage() {
  applyThemeClass(getPreferredThemeSnapshot());
}

function subscribeThemeChange(onStoreChange: () => void) {
  const notify = () => {
    syncThemeFromStorage();
    onStoreChange();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) notify();
  };
  const handleSystemThemeChange = () => {
    if (!getStoredTheme()) notify();
  };
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  syncThemeFromStorage();
  window.addEventListener(THEME_CHANGE_EVENT, notify);
  window.addEventListener('storage', handleStorage);
  mediaQuery.addEventListener('change', handleSystemThemeChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, notify);
    window.removeEventListener('storage', handleStorage);
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
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
  applyThemeClass(isDark);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {
    /* localStorage が使えない環境では DOM の切替だけ行う */
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
