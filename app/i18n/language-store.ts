'use client';

import { useSyncExternalStore } from 'react';

import {
  DEFAULT_SITE_LOCALE,
  resolveAvailableLocale,
  toHtmlLanguageTag,
  type SiteLocale,
} from '@/lib/site-settings';

export const LANGUAGE_STORAGE_KEY = 'locale';
export const LANGUAGE_CHANGE_EVENT = 'mirai-city-locale-change';
const LANGUAGE_READY_EVENT = 'mirai-city-locale-ready';

export function readStoredLocale(
  availableLocales: readonly SiteLocale[],
): SiteLocale {
  try {
    return resolveAvailableLocale(
      localStorage.getItem(LANGUAGE_STORAGE_KEY),
      availableLocales,
    );
  } catch {
    return DEFAULT_SITE_LOCALE;
  }
}

export function syncLanguageFromStorage(
  availableLocales: readonly SiteLocale[],
): SiteLocale {
  const resolved = readStoredLocale(availableLocales);

  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored !== resolved) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, resolved);
    }
  } catch {
    /* localStorage が使えない環境では既定言語を使う */
  }

  document.documentElement.lang = toHtmlLanguageTag(resolved);
  return resolved;
}

export function storeLocale(locale: SiteLocale): boolean {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

export function revealLanguageContent() {
  document.documentElement.classList.remove('language-loading');
  window.dispatchEvent(new Event(LANGUAGE_READY_EVENT));
}

function subscribeLanguageReady(onStoreChange: () => void) {
  window.addEventListener(LANGUAGE_READY_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(LANGUAGE_READY_EVENT, onStoreChange);
  };
}

function getLanguageReadySnapshot() {
  return !document.documentElement.classList.contains('language-loading');
}

function getServerLanguageReadySnapshot() {
  return false;
}

export function useIsLanguageReady() {
  return useSyncExternalStore(
    subscribeLanguageReady,
    getLanguageReadySnapshot,
    getServerLanguageReadySnapshot,
  );
}
