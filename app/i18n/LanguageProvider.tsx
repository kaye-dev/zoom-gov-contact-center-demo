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
  type Dictionary,
  type Locale,
} from './dictionaries';
import { buildDictionary } from './build-dictionary';
import type { TenantKey } from '@/lib/tenants';
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
  /** Hostが決めた業種テナント。client componentのコンテンツ選択に使う。 */
  tenantKey: TenantKey;
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
  tenantKey,
  children,
}: {
  availableLocales: readonly Locale[];
  /**
   * Hostから解決した業種テナント。サーバーで決まるためpropで受け取る。
   * クライアントでlocation.hostnameを読むとhydrationが一致しなくなる。
   */
  tenantKey: TenantKey;
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
        tenantKey,
        availableLocales,
        isLocaleReady,
        setLocale,
        t: buildDictionary(tenantKey, locale),
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
