'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  defaultLocale,
  dictionaries,
  isLocale,
  type Dictionary,
  type Locale,
} from './dictionaries';

const STORAGE_KEY = 'locale';
const LOCALE_CHANGE_EVENT = 'mirai-city-locale-change';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isLocale(stored)) return stored;
  } catch {
    /* localStorage が使えない環境では既定ロケールを使う */
  }
  return defaultLocale;
}

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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeLocaleChange,
    getStoredLocale,
    getServerLocaleSnapshot,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage が使えない環境では無視 */
    }
    document.documentElement.lang = next;
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  };

  return (
    <LanguageContext.Provider
      value={{ locale, setLocale, t: dictionaries[locale] }}
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
