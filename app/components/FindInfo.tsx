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
      <div className="mb-12 flex items-baseline gap-4">
        <h2 className="text-3xl font-bold tracking-wide">{t.findInfo.title}</h2>
        <span className="text-sm text-fg-muted">
          {t.findInfo.subtitle}
        </span>
      </div>

      {/* 枠付きボックス（上辺の枠線に見出しが重なる。角は直角） */}
      {/* contentClassName で左右・下の余白を外し、ホバー背景を枠端まで広げる */}
      <LabeledBox label={t.findInfo.sectionLabel} contentClassName="pt-10">
        {/* カードグリッド（仕切り線で 2 分割。各カードがホバー領域＝枠の半分） */}
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-line-subtle">
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
        <div className="grid grid-cols-3 md:grid-cols-6">
          {lifeItems.map((item, index) => {
            // 内側だけに区切り線を引く（最終列は右線なし、最終行は下線なし）
            const isLastCol = index % 6 === 5;
            const isLastRow = index >= lifeItems.length - (lifeItems.length % 6 || 6);
            const dividers = [
              isLastCol ? '' : 'md:border-r',
              isLastRow ? '' : 'border-b',
            ]
              .filter(Boolean)
              .join(' ');
            return (
            <a
              key={item.label}
              href="#"
              className={`flex flex-col items-center gap-3 border-line-subtle px-2 py-5 text-center text-fg transition-colors hover:bg-surface-hover ${dividers}`}
            >
              <ThemedIcon
                light={item.icon}
                dark={darkIconPath(item.icon)}
                alt={item.label}
              />
              <span className="text-xs font-medium leading-snug md:text-sm">
                {item.label}
              </span>
            </a>
            );
          })}
        </div>
      </LabeledBox>
    </section>
  );
}
