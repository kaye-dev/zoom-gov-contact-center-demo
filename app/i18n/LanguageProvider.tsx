'use client';

import {
  useCallback,
  createContext,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  defaultLocale,
  dictionaries,
  type Dictionary,
  type Locale,
} from './dictionaries';
import {
  resolveAvailableLocale,
  toHtmlLanguageTag,
} from '@/lib/site-settings';
import {
  LANGUAGE_CHANGE_EVENT,
  LANGUAGE_STORAGE_KEY,
  readStoredLocale,
  revealLanguageContent,
  storeLocale,
  syncLanguageFromStorage,
  useIsLanguageReady,
} from './language-store';

type LanguageContextValue = {
  locale: Locale;
  availableLocales: readonly Locale[];
  isLocaleReady: boolean;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getServerLocaleSnapshot(): Locale {
  return defaultLocale;
}

export function LanguageProvider({
  availableLocales,
  children,
}: {
  availableLocales: readonly Locale[];
  children: ReactNode;
}) {
  const getStoredLocale = useCallback((): Locale => {
    return readStoredLocale(availableLocales);
  }, [availableLocales]);

  const subscribeLocaleChange = useCallback(
    (onStoreChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (
          event.key !== null &&
          event.key !== LANGUAGE_STORAGE_KEY
        ) {
          return;
        }

        const next = readStoredLocale(availableLocales);
        if (document.documentElement.lang !== toHtmlLanguageTag(next)) {
          window.location.reload();
          return;
        }
        onStoreChange();
      };

      window.addEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange);
      window.addEventListener('storage', onStorage);

      return () => {
        window.removeEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange);
        window.removeEventListener('storage', onStorage);
      };
    },
    [availableLocales],
  );

  const locale = useSyncExternalStore(
    subscribeLocaleChange,
    getStoredLocale,
    getServerLocaleSnapshot,
  );
  const isLocaleReady = useIsLanguageReady();

  useLayoutEffect(() => {
    const resolved = syncLanguageFromStorage(availableLocales);
    if (resolved !== locale) {
      window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
      return;
    }

    revealLanguageContent();
  }, [availableLocales, locale]);

  const setLocale = (next: Locale) => {
    const resolved = resolveAvailableLocale(next, availableLocales);
    if (resolved === locale || !storeLocale(resolved)) return;
    window.location.reload();
  };

  return (
    <LanguageContext.Provider
      value={{
        locale,
        availableLocales,
        isLocaleReady,
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
