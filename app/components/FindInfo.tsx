'use client';

import Image from 'next/image';
import { useI18n } from '../i18n/LanguageProvider';
import { LabeledBox } from './LabeledBox';

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

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      {/* 見出し */}
      <div className="mb-12 flex items-baseline gap-4">
        <h2 className="text-3xl font-bold tracking-wide">{t.findInfo.title}</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t.findInfo.subtitle}
        </span>
      </div>

      {/* 枠付きボックス（上辺の枠線に見出しが重なる。角は直角） */}
      {/* contentClassName で左右・下の余白を外し、ホバー背景を枠端まで広げる */}
      <LabeledBox label={t.findInfo.sectionLabel} contentClassName="pt-10">
        {/* カードグリッド（仕切り線で 2 分割。各カードがホバー領域＝枠の半分） */}
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-gray-200 dark:md:divide-gray-700">
          {cards.map((card) => (
            <a
              key={card.title}
              href="#"
              className="flex items-start gap-5 px-8 pb-8 pt-2 text-gray-800 transition-colors hover:bg-primary-50 dark:text-gray-100 dark:hover:bg-primary-900/20"
            >
              <Image
                src={card.icon}
                alt={card.title}
                width={72}
                height={72}
                className="shrink-0"
              />
              <div>
                <h4 className="mb-2 text-lg font-bold">{card.title}</h4>
                <p className="text-sm leading-7 text-gray-700 dark:text-gray-300">
                  {card.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </LabeledBox>
    </section>
  );
}
