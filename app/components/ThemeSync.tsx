'use client';

import { useLayoutEffect } from 'react';
import { syncThemeFromStorage, useIsDarkTheme } from './theme-store';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export type ReviewTheme = 'light' | 'dark';

export function resolveReviewTheme(
  input: { hostname: string; search: string },
  environment: string | undefined = process.env.NODE_ENV,
): ReviewTheme | null {
  if (environment === 'production' || !LOOPBACK_HOSTNAMES.has(input.hostname)) {
    return null;
  }
  const candidates = new URLSearchParams(input.search).getAll('theme');
  if (candidates.length !== 1) return null;
  return candidates[0] === 'light' || candidates[0] === 'dark' ? candidates[0] : null;
}

export function applyReviewTheme() {
  const reviewTheme = resolveReviewTheme({
    hostname: window.location.hostname,
    search: window.location.search,
  });
  if (!reviewTheme) return null;
  const isDark = reviewTheme === 'dark';
  const root = document.documentElement;
  if (
    root.classList.contains('dark') !== isDark ||
    root.classList.contains('light') === isDark
  ) {
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
  }
  return isDark;
}

function StoredThemeSync() {
  const isDark = useIsDarkTheme();
  useLayoutEffect(() => {
    document.documentElement.classList.remove('review-theme');
    const synchronizedIsDark = syncThemeFromStorage();
    if (isDark === synchronizedIsDark) {
      document.documentElement.classList.remove('theme-loading');
    }
  }, [isDark]);

  return null;
}

function ReviewThemeSync() {
  useLayoutEffect(() => {
    const reviewIsDark = applyReviewTheme();
    if (reviewIsDark !== null) {
      document.documentElement.classList.remove('theme-loading');
    }
    const observer = new MutationObserver(() => {
      applyReviewTheme();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}

export function ThemeSync() {
  const reviewTheme = typeof window === 'undefined'
    ? null
    : resolveReviewTheme({
        hostname: window.location.hostname,
        search: window.location.search,
      });

  return reviewTheme ? <ReviewThemeSync /> : <StoredThemeSync />;
}
