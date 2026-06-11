'use client';

import { StarEmblem } from './svg/StarEmblemIcon';
import { useI18n } from '../i18n/LanguageProvider';

export function Footer() {
  const { t } = useI18n();

  const policyLinks = [
    t.footer.sitePolicy,
    t.footer.privacy,
    t.footer.buildingGuide,
  ];

  const serviceLinks = [t.footer.feedback, t.footer.sitemap];

  return (
    <footer className="bg-primary-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:gap-12">
          {/* ロゴ */}
          <div className="flex shrink-0 items-center gap-3">
            <StarEmblem className="h-10 w-10 shrink-0" />
            <div className="leading-tight">
              <p className="text-xl font-bold tracking-wide">{t.cityName}</p>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 dark:text-gray-400">
                {t.cityNameRoman}
              </p>
            </div>
          </div>

          {/* 住所・連絡先 */}
          <address className="not-italic text-sm leading-7 text-gray-700 dark:text-gray-300">
            <p>{t.footer.postalCode}</p>
            <p>{t.footer.address}</p>
            <p>{t.footer.tower}</p>
            <p className="mt-4">
              {t.footer.phoneLabel}
              <a
                href="tel:+810312345678"
                className="underline-offset-4 transition-colors hover:text-blue-700 hover:underline dark:hover:text-blue-300"
              >
                (03)1234-5678
              </a>
              {t.footer.phoneNote}
            </p>
          </address>

          {/* リンク */}
          <nav className="flex gap-12 text-sm md:ml-auto">
            <ul className="space-y-3">
              {policyLinks.map((label) => (
                <li key={label}>
                  <a
                    href="#"
                    className="text-gray-700 underline-offset-4 transition-colors hover:text-blue-700 hover:underline dark:text-gray-300 dark:hover:text-blue-300"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <ul className="space-y-3">
              {serviceLinks.map((label) => (
                <li key={label}>
                  <a
                    href="#"
                    className="text-gray-700 underline-offset-4 transition-colors hover:text-blue-700 hover:underline dark:text-gray-300 dark:hover:text-blue-300"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* コピーライト */}
          <div className="text-sm leading-6 text-gray-700 md:self-end md:text-right dark:text-gray-300">
            <p>{t.footer.copyright}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
