'use client';

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  defaultLocale,
  dictionaries,
  type Dictionary,
  type Locale,
} from './dictionaries';
import { resolveAvailableLocale } from '@/lib/site-settings';

const STORAGE_KEY = 'locale';
const LOCALE_CHANGE_EVENT = 'mirai-city-locale-change';

type LanguageContextValue = {
  locale: Locale;
  availableLocales: readonly Locale[];
  setLocale: (locale: Locale) => void;
  t: Dictionary;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getServerLocaleSnapshot(): Locale {
  return defaultLocale;
}

function subscribeLocaleChange(onStoreChange: () => void) {
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);

  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function LanguageProvider({
  availableLocales,
  children,
}: {
  availableLocales: readonly Locale[];
  children: ReactNode;
}) {
  const getStoredLocale = useCallback((): Locale => {
    try {
      return resolveAvailableLocale(
        localStorage.getItem(STORAGE_KEY),
        availableLocales,
      );
    } catch {
      return defaultLocale;
    }
  }, [availableLocales]);

  const locale = useSyncExternalStore(
    subscribeLocaleChange,
    getStoredLocale,
    getServerLocaleSnapshot,
  );

  useEffect(() => {
    let resolved = locale;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      resolved = resolveAvailableLocale(stored, availableLocales);
      if (stored !== resolved) {
        localStorage.setItem(STORAGE_KEY, resolved);
      }
    } catch {
      /* localStorage が使えない環境では無視 */
    }

    document.documentElement.lang = resolved;
    if (resolved !== locale) {
      window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
    }
  }, [availableLocales, locale]);

  const setLocale = (next: Locale) => {
    const resolved = resolveAvailableLocale(next, availableLocales);
    try {
      localStorage.setItem(STORAGE_KEY, resolved);
    } catch {
      /* localStorage が使えない環境では無視 */
    }
    document.documentElement.lang = resolved;
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  };

  return (
    <LanguageContext.Provider
      value={{
        locale,
        availableLocales,
        setLocale,
        t: dictionaries[locale],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useI18n は LanguageProvider の内側で使用してください');
  }
  return ctx;
}
