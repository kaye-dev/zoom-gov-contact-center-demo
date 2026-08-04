'use client';

import { usePathname } from 'next/navigation';

import { useI18n } from '../i18n/LanguageProvider';
import { StarEmblem } from './svg/StarEmblemIcon';

type FooterClientProps = {
  isSignedIn: boolean;
  representativePhone: {
    display: string;
    e164: string;
  };
};

export function FooterClient({
  isSignedIn,
  representativePhone,
}: FooterClientProps) {
  const { t } = useI18n();
  const pathname = usePathname();

  // 各フッターリンクは対応するドキュメントページへ接続する。
  const policyLinks = [
    { label: t.footer.terms, href: '/docs/terms-of-service' },
    { label: t.footer.privacy, href: '/docs/privacy-policy' },
    { label: t.footer.buildingGuide, href: '/docs/building-guide' },
  ];

  const serviceLinks = [
    { label: t.footer.feedback, href: '/docs/feedback' },
    { label: t.footer.sitemap, href: '#' },
    {
      label: isSignedIn ? t.footer.goToAdmin : t.footer.login,
      href: isSignedIn ? '/admin' : '/login',
    },
  ];

  // ドキュメントページ（/docs/*）のときのみ、現在のページの Markdown 版 URL を作る。
  // .md 自体や docs 以外のページでは表示しない。
  const mdHref =
    pathname.startsWith('/docs/') && !pathname.endsWith('.md')
      ? `${pathname}.md`
      : null;

  return (
    <footer className="bg-primary-50 text-fg dark:bg-surface-raised">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:gap-12">
          {/* ロゴ */}
          <div className="flex shrink-0 items-center gap-3">
            <StarEmblem className="h-10 w-10 shrink-0" />
            <div className="leading-tight">
              <p className="text-xl font-bold tracking-wide">{t.cityName}</p>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-fg-muted">
                {t.cityNameRoman}
              </p>
            </div>
          </div>

          {/* 住所・連絡先 */}
          <address className="not-italic text-sm leading-7 text-fg-muted">
            <p>{t.footer.postalCode}</p>
            <p>{t.footer.address}</p>
            <p>{t.footer.tower}</p>
            <p className="mt-4">
              {t.footer.phoneLabel}
              <a
                href={`tel:${representativePhone.e164}`}
                className="underline-offset-4 transition-colors hover:text-accent hover:underline"
              >
                {representativePhone.display}
              </a>
              {t.footer.phoneNote}
            </p>
          </address>

          {/* リンク */}
          <nav className="flex gap-8 text-sm sm:gap-12 md:ml-auto">
            <ul className="space-y-3">
              {policyLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-fg-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <ul className="space-y-3">
              {serviceLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-fg-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* コピーライト */}
          <div className="text-sm leading-6 text-fg-muted md:self-end md:text-right">
            <p>{t.footer.copyright}</p>
          </div>
        </div>

        {/* フッター下部: ドキュメントページでは Markdown 版を別タブで開くリンクを出す */}
        {mdHref && (
          <div className="mt-8 border-t border-fg-muted/20 pt-4 text-sm">
            <a
              href={mdHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              {t.docs.viewAsMarkdown}
            </a>
          </div>
        )}
      </div>
    </footer>
  );
}
