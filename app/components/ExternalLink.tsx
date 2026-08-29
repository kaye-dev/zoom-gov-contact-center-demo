'use client';

import type { ComponentPropsWithoutRef } from 'react';

import { useI18n } from '../i18n/LanguageProvider';
import { OpenInNewIcon } from './svg/OpenInNewIcon';

type ExternalLinkProps = Omit<
  ComponentPropsWithoutRef<'a'>,
  'href' | 'rel' | 'target'
> & {
  href: string;
};

/**
 * 外部サイトを新しいタブで開くテキストリンク。
 * Open In New アイコンは装飾扱いにし、遷移方法は不可視テキストで読み上げる。
 */
export function ExternalLink({
  children,
  className,
  href,
  ...props
}: ExternalLinkProps) {
  const { t } = useI18n();

  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent${className ? ` ${className}` : ''}`}
    >
      {children}
      {'\u2060'}
      <OpenInNewIcon
        height={16}
        width={16}
        className="ml-1 inline-block align-[-0.125em]"
      />
      <span className="sr-only">（{t.links.opensInNewTab}）</span>
    </a>
  );
}
