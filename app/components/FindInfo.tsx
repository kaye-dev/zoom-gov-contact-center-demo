'use client';

import Image from 'next/image';
import { useI18n } from '../i18n/LanguageProvider';
import { LabeledBox } from './LabeledBox';

// ライトパスからダークパスを派生（命名規則: <ライト名>-dark.png）
function darkIconPath(light: string): string {
  return light.replace(/\.png$/, '-dark.png');
}

// テーマに追従してアイコンを出し分ける（クラスベースのダークモード用に CSS で切替）。
// display:none の要素は支援技術に読まれないため、両方に同一 alt で問題なし。
function ThemedIcon({
  light,
  dark,
  alt,
  size = 56,
}: {
  light: string;
  dark: string;
  alt: string;
  size?: number;
}) {
  return (
    <>
      <Image src={light} alt={alt} width={size} height={size} className="shrink-0 dark:hidden" />
      <Image src={dark} alt={alt} width={size} height={size} className="hidden shrink-0 dark:block" />
    </>
  );
}

export function FindInfo() {
  const { t } = useI18n();

  const cards = [
    {
      title: t.findInfo.call.title,
      description: t.findInfo.call.description,
      icon: '/ai-call-assistant.png',
    },
    {
      title: t.findInfo.chat.title,
      description: t.findInfo.chat.description,
      icon: '/ai-chat-assistant.png',
    },
  ];

  const lifeItems = [
    { label: t.findInfo.lifeInfo.items.trash, icon: '/life-information/life-trash.png' },
    { label: t.findInfo.lifeInfo.items.childEducation, icon: '/life-information/life-child-education.png' },
    { label: t.findInfo.lifeInfo.items.safety, icon: '/life-information/life-safety.png' },
    { label: t.findInfo.lifeInfo.items.residence, icon: '/life-information/life-residence.png' },
    { label: t.findInfo.lifeInfo.items.facilities, icon: '/life-information/life-facilities.png' },
    { label: t.findInfo.lifeInfo.items.event, icon: '/life-information/life-event.png' },
    { label: t.findInfo.lifeInfo.items.faq, icon: '/life-information/life-faq.png' },
    { label: t.findInfo.lifeInfo.items.feedback, icon: '/life-information/life-feedback.png' },
    { label: t.findInfo.lifeInfo.items.welfare, icon: '/life-information/life-welfare.png' },
    { label: t.findInfo.lifeInfo.items.educationBoard, icon: '/life-information/life-education-board.png' },
    { label: t.findInfo.lifeInfo.items.myNumber, icon: '/life-information/life-my-number.png' },
    { label: t.findInfo.lifeInfo.items.consultation, icon: '/life-information/life-consultation.png' },
    { label: t.findInfo.lifeInfo.items.tax, icon: '/life-information/life-tax.png' },
    { label: t.findInfo.lifeInfo.items.library, icon: '/life-information/life-library.png' },
    { label: t.findInfo.lifeInfo.items.openData, icon: '/life-information/life-open-data.png' },
    { label: t.findInfo.lifeInfo.items.organization, icon: '/life-information/life-organization.png' },
    { label: t.findInfo.lifeInfo.items.counter, icon: '/life-information/life-counter.png' },
    { label: t.findInfo.lifeInfo.items.housing, icon: '/life-information/life-housing.png' },
  ];

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      {/* 見出し */}
      <div className="mb-12 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-2xl font-bold tracking-wide md:text-3xl">{t.findInfo.title}</h2>
        <span className="text-sm text-fg-muted">
          {t.findInfo.subtitle}
        </span>
      </div>

      {/* 枠付きボックス（上辺の枠線に見出しが重なる。角は直角） */}
      {/* contentClassName で左右・下の余白を外し、ホバー背景を枠端まで広げる */}
      <LabeledBox label={t.findInfo.sectionLabel} contentClassName="pt-10">
        {/* カードグリッド（仕切り線で 2 分割。各カードがホバー領域＝枠の半分） */}
        {/* 縦積み時は水平線、md 以上では垂直線で区切る */}
        <div className="grid grid-cols-1 divide-y divide-line-subtle md:grid-cols-2 md:divide-x md:divide-y-0 md:divide-line-subtle">
          {cards.map((card) => (
            <a
              key={card.title}
              href="#"
              className="flex items-start gap-5 px-8 pb-8 pt-2 text-fg transition-colors hover:bg-surface-hover"
            >
              <ThemedIcon
                light={card.icon}
                dark={darkIconPath(card.icon)}
                alt={card.title}
                size={72}
              />
              <div>
                <h4 className="mb-2 text-lg font-bold">{card.title}</h4>
                <p className="text-sm leading-7 text-fg-muted">
                  {card.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </LabeledBox>

      {/* 生活情報（アイコングリッド、デスクトップ 1 行 6 列） */}
      <LabeledBox
        label={t.findInfo.lifeInfo.sectionLabel}
        className="mt-12"
        contentClassName="px-4 pb-6 pt-10"
      >
        {/* 縦線は列境界を貫く全高（各セルの border-r）、横線はセル内に収まるインセット線（after 疑似要素）。 */}
        {/* 列数（3 / 6）に依らず、最終列の縦線・最終行の横線は overflow-hidden + 内側 -mr-px -mb-px でクリップ */}
        <div className="overflow-hidden">
          <div className="-mr-px -mb-px grid grid-cols-3 md:grid-cols-6">
            {lifeItems.map((item) => (
              <a
                key={item.label}
                href="#"
                className="relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden border-r border-line-subtle px-2 text-center text-fg transition-colors after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:border-b after:border-line-subtle after:content-[''] hover:bg-surface-hover"
              >
                <ThemedIcon
                  light={item.icon}
                  dark={darkIconPath(item.icon)}
                  alt={item.label}
                  size={48}
                />
                <span className="text-xs font-medium leading-snug md:text-sm">
                  {item.label}
                </span>
              </a>
            ))}
          </div>
        </div>
      </LabeledBox>
    </section>
  );
}
