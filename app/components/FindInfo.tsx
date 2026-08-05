'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { PhoneSettings } from '@/lib/phone-settings';
import { lifeCategories } from '../content/site-content';
import { useI18n } from '../i18n/LanguageProvider';
import { LabeledBox } from './LabeledBox';
import { useIsDarkTheme } from './theme-store';

// ライトパスからダークパスを派生（命名規則: <ライト名>-dark.png）
function darkIconPath(light: string): string {
  return light.replace(/\.png$/, '-dark.png');
}

// テーマ状態を購読し、AI 相談カード用の多色アイコン画像を src レベルで出し分ける。
function ThemedIcon({
  light,
  dark,
  alt,
  size = 56,
  className,
}: {
  light: string;
  dark: string;
  alt: string;
  size?: number;
  /** 表示サイズをレスポンシブに上書きする場合に指定（width/height 属性は固有比のため size を維持） */
  className?: string;
}) {
  const isDark = useIsDarkTheme();
  const base = className ? ` ${className}` : '';

  return (
    <Image
      src={isDark ? dark : light}
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0${base}`}
    />
  );
}

function MaskedIcon({ src, className }: { src: string; className?: string }) {
  const style: CSSProperties = {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  };

  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 bg-icon-muted transition-colors group-hover:bg-icon-strong${className ? ` ${className}` : ''}`}
      style={style}
    />
  );
}

export function FindInfo({
  aiPhoneNumbers,
}: {
  aiPhoneNumbers: PhoneSettings['aiPhoneNumbers'];
}) {
  const { locale, t } = useI18n();

  const cards = [
    {
      title: t.findInfo.call.title,
      description: t.findInfo.call.description,
      icon: '/ai-call-assistant.png',
      href: aiPhoneNumbers[locale]
        ? `tel:${aiPhoneNumbers[locale]}`
        : null,
      unavailableAlert: t.findInfo.call.unavailableAlert,
    },
  ];

  const lifeItems = lifeCategories.map((category) => ({
    ...category,
    label: t.findInfo.lifeInfo.items[category.id],
  }));

  return (
    <section className="mx-auto max-w-7xl px-2.5 pt-13">
      {/* 見出し */}
      <div className="mb-12 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-2xl font-bold tracking-wide md:text-3xl">{t.findInfo.title}</h2>
        <span className="text-sm text-fg-muted">
          {t.findInfo.subtitle}
        </span>
      </div>

      {/* 枠付きボックス（上辺の枠線に見出しが重なる。角は直角） */}
      {/* contentClassName の余白を全て外し、各カードが枠端まで広がる（ホバー背景が上辺まで届く） */}
      <LabeledBox label={t.findInfo.sectionLabel} contentClassName="p-0">
        <div className="grid grid-cols-1 divide-y divide-line-subtle">
          {cards.map((card) => {
            const content = (
              <>
              <ThemedIcon
                light={card.icon}
                dark={darkIconPath(card.icon)}
                alt={card.title}
                size={84}
                className="h-[72px] w-[72px] lg:h-[84px] lg:w-[84px]"
              />
              <div>
                <h4 className="mb-2 text-lg font-bold lg:text-2xl">{card.title}</h4>
                <p className="text-sm leading-relaxed text-fg-muted lg:text-base lg:leading-7">
                  {card.description}
                </p>
              </div>
              </>
            );

            return card.href ? (
              <a
                key={card.title}
                href={card.href}
                className="flex items-center gap-5 px-1 py-4 text-fg transition-colors hover:bg-surface-hover md:px-8 md:py-6 lg:gap-6 lg:py-8"
              >
                {content}
              </a>
            ) : (
              <ConsultationUnavailableButton
                key={card.title}
                message={card.unavailableAlert}
              >
                {content}
              </ConsultationUnavailableButton>
            );
          })}
        </div>
      </LabeledBox>

      {/* 生活情報（アイコングリッド、デスクトップ 1 行 6 列） */}
      <LabeledBox
        label={t.findInfo.lifeInfo.sectionLabel}
        className="mt-12"
        contentClassName="px-4 pb-6 pt-6"
      >
        {/* 縦線（before）・横線（after）とも各セルから上下左右 10px インセットした「浮いた線」。 */}
        {/* 交点に隙間ができ、世田谷区サイトと同じ区切り表現になる。 */}
        {/* 列数（3 / 6）に依らず、最終列の縦線・最終行の横線は overflow-hidden + 内側 -mr-px -mb-px でクリップ */}
        <div className="overflow-hidden">
          <div className="-mr-px -mb-px grid grid-cols-3 md:grid-cols-6">
            {lifeItems.map((item) => (
              <Link
                key={item.label}
                href={`/life/${item.slug}`}
                className="group relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden px-2 text-center text-fg transition-colors before:pointer-events-none before:absolute before:inset-y-2.5 before:right-0 before:w-px before:bg-line-subtle before:content-[''] after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-px after:bg-line-subtle after:content-[''] hover:bg-surface-hover lg:gap-3"
              >
                <MaskedIcon src={item.icon} className="h-12 w-12 lg:h-20 lg:w-20" />
                <span className="text-xs font-semibold leading-snug md:text-sm lg:text-base">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </LabeledBox>
    </section>
  );
}

function ConsultationUnavailableButton({
  message,
  children,
}: {
  message: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => window.alert(message)}
      className="flex w-full cursor-pointer items-center gap-5 px-1 py-4 text-left text-fg transition-colors hover:bg-surface-hover md:px-8 md:py-6 lg:gap-6 lg:py-8"
    >
      {children}
    </button>
  );
}
