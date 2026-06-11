'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
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

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  // マウント後に保存済みの言語設定を反映する（SSR とのハイドレーション不整合を避けるため初期値は既定ロケール）
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isLocale(stored) && stored !== defaultLocale) {
        setLocaleState(stored);
        document.documentElement.lang = stored;
      }
    } catch {
      /* localStorage が使えない環境では無視 */
    }
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage が使えない環境では無視 */
    }
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
