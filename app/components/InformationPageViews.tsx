'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import {
  lifeCategories,
  newsArticles,
  type LifeCategory,
  type LifeTopic,
  type NewsArticle,
} from '../content/site-content';
import { useI18n } from '../i18n/LanguageProvider';
import styles from './InformationPageViews.module.css';
import { ChevronDownIcon } from './svg/ChevronDownIcon';
import { ChevronLeftIcon } from './svg/ChevronLeftIcon';
import { ChevronRightIcon } from './svg/ChevronRightIcon';

function interpolate(message: string, name: string) {
  return message.replace('{name}', name);
}

export function AnimatedLinkLabel({ children }: { children: ReactNode }) {
  return <span className={styles.animatedLinkLabel}>{children}</span>;
}

function CategoryIcon({ src, className = 'h-14 w-14' }: { src: string; className?: string }) {
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

  return <span aria-hidden="true" className={`block shrink-0 bg-accent ${className}`} style={style} />;
}

type Breadcrumb = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: readonly Breadcrumb[] }) {
  const { t } = useI18n();

  return (
    <nav aria-label={t.contentPages.breadcrumbLabel} className="mb-8 text-sm text-fg-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && <ChevronRightIcon className="shrink-0" />}
            {item.href ? (
              <Link href={item.href} className={`${styles.animatedLink} text-accent`}>
                <AnimatedLinkLabel>{item.label}</AnimatedLinkLabel>
              </Link>
            ) : (
              <span aria-current="page" className="text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-5 py-10 md:px-8 md:py-14">{children}</div>;
}

export function PageTitleBand({ title, iconSrc }: { title: string; iconSrc?: string }) {
  return (
    <header className="border-l-[6px] border-primary-1000 bg-primary-50 px-5 py-3 dark:border-primary-400 dark:bg-surface-raised md:px-7 md:py-6">
      <div className="relative flex items-center">
        {iconSrc && <CategoryIcon src={iconSrc} className="absolute h-11 w-11 opacity-60 md:h-13 md:w-13" />}
        <h1
          className={`relative break-words text-2xl font-bold leading-[1.5] text-fg md:text-4xl md:leading-snug ${
            iconSrc ? 'pl-12 md:pl-15' : ''
          }`}
        >
          {title}
        </h1>
      </div>
    </header>
  );
}

export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 border-l-4 border-accent bg-surface-hover px-5 py-4 text-xl font-bold leading-8 text-fg md:px-6 md:text-2xl"
    >
      {children}
    </h2>
  );
}

function ContentSectionStack({ children }: { children: ReactNode }) {
  return <div className="mt-12 flex max-w-6xl flex-col gap-12">{children}</div>;
}

function SectionBody({ children }: { children: ReactNode }) {
  return <div className="mt-8 px-5 md:px-6">{children}</div>;
}

type ContentsItem = {
  href: string;
  label: string;
};

export function ContentsNavigation({ items }: { items: readonly ContentsItem[] }) {
  const { t } = useI18n();

  return (
    <nav aria-labelledby="page-contents-heading" className="mt-10 max-w-6xl border-y border-line py-6">
      <h2 id="page-contents-heading" className="text-xl font-bold text-fg md:text-2xl">
        {t.contentPages.tableOfContents}
      </h2>
      <ul className="mt-4 grid gap-x-10 md:grid-cols-2">
        {items.map((item, index) => (
          <li
            key={item.href}
            className={`border-t border-line-subtle first:border-t-0 md:[&:nth-child(2)]:border-t-0 ${
              items.length % 2 === 1 && index === items.length - 1 ? 'md:col-span-2' : ''
            }`}
          >
            <a
              href={item.href}
              className={`${styles.animatedLink} flex min-h-11 items-center gap-2 py-3 font-semibold leading-7 text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
            >
              <ChevronDownIcon className="shrink-0" />
              <AnimatedLinkLabel>{item.label}</AnimatedLinkLabel>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ContactSection() {
  const { t } = useI18n();

  return (
    <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-24 border border-line">
      <h2
        id="contact-heading"
        className="scroll-mt-24 bg-surface-hover px-5 py-4 text-xl font-bold leading-8 text-fg md:px-6 md:text-2xl"
      >
        {t.contentPages.contactHeading}
      </h2>
      <div className="px-5 py-6 md:px-6">
        <p className="leading-8 text-fg">{t.contentPages.contactNote}</p>
        <dl className="mt-5 border border-line">
          <div className="grid md:grid-cols-[12rem_1fr]">
            <dt className="bg-surface-hover px-4 py-3 font-bold text-fg">{t.contentPages.contactPhoneLabel}</dt>
            <dd className="px-4 py-3">
              <a
                href="tel:+81312345678"
                className={`${styles.animatedLink} font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
              >
                <AnimatedLinkLabel>(03)1234-5678</AnimatedLinkLabel>
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function DetailsTable({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="mt-12 border-x border-b border-line">
      {rows.map(([title, description]) => (
        <div key={title} className="grid border-t border-line md:grid-cols-[14rem_1fr]">
          <dt className="bg-surface-hover px-5 py-4 font-bold leading-7 text-fg md:px-6">{title}</dt>
          <dd className="px-5 py-4 leading-8 text-fg md:px-6">{description}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LifeIndexView() {
  const { t } = useI18n();

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: t.contentPages.home, href: '/' }, { label: t.contentPages.lifeIndexTitle }]} />
      <PageTitleBand title={t.contentPages.lifeIndexTitle} />
      <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">{t.contentPages.lifeIndexLead}</p>

      <section aria-labelledby="life-categories" className="mt-12">
        <SectionHeading id="life-categories">{t.contentPages.allCategories}</SectionHeading>
        <ul className="mt-8 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {lifeCategories.map((category) => {
            const label = t.findInfo.lifeInfo.items[category.id];
            return (
              <li key={category.id} className="border-b border-r border-line">
                <Link
                  href={`/life/${category.slug}`}
                  className="group flex min-h-24 items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                >
                  <CategoryIcon src={category.icon} className="h-10 w-10" />
                  <span className="flex-1 font-bold leading-6 text-fg group-hover:text-accent">{label}</span>
                  <ChevronRightIcon className="shrink-0 text-accent" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </PageFrame>
  );
}

export function LifeCategoryView({ category }: { category: LifeCategory }) {
  const { t } = useI18n();
  const categoryTitle = t.findInfo.lifeInfo.items[category.id];
  const contentsItems = category.topics.map((topic) => ({
    href: `#topic-${topic.slug}`,
    label: t.contentPages.lifeTopics[topic.id],
  }));

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: t.contentPages.home, href: '/' },
          { label: t.contentPages.lifeIndexTitle, href: '/life' },
          { label: categoryTitle },
        ]}
      />

      <PageTitleBand title={categoryTitle} iconSrc={category.icon} />
      <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">
        {interpolate(t.contentPages.categoryLead, categoryTitle)}
      </p>

      <ContentsNavigation items={contentsItems} />

      <ContentSectionStack>
        {category.topics.map((topic) => {
          const topicTitle = t.contentPages.lifeTopics[topic.id];
          return (
            <section
              key={topic.id}
              id={`topic-${topic.slug}`}
              aria-labelledby={`topic-${topic.slug}-heading`}
              className="scroll-mt-24"
            >
              <SectionHeading id={`topic-${topic.slug}-heading`}>{topicTitle}</SectionHeading>
              <SectionBody>
                <p className="leading-8 text-fg">{t.contentPages.lifeTopicSummaries[topic.id]}</p>
                <Link
                  href={`/life/${category.slug}/${topic.slug}`}
                  className={`${styles.animatedLink} mt-5 inline-flex items-center gap-2 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
                >
                  <ChevronRightIcon className="shrink-0" />
                  <AnimatedLinkLabel>{t.contentPages.readMore}</AnimatedLinkLabel>
                </Link>
              </SectionBody>
            </section>
          );
        })}
        <ContactSection />
      </ContentSectionStack>
    </PageFrame>
  );
}

export function LifeTopicView({ category, topic }: { category: LifeCategory; topic: LifeTopic }) {
  const { t } = useI18n();
  const categoryTitle = t.findInfo.lifeInfo.items[category.id];
  const topicTitle = t.contentPages.lifeTopics[topic.id];
  const details = [
    [t.contentPages.checkEligibility, t.contentPages.checkEligibilityDescription],
    [t.contentPages.checkDocuments, t.contentPages.checkDocumentsDescription],
    [t.contentPages.checkHowToUse, t.contentPages.checkHowToUseDescription],
  ] as const;

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: t.contentPages.home, href: '/' },
          { label: t.contentPages.lifeIndexTitle, href: '/life' },
          { label: categoryTitle, href: `/life/${category.slug}` },
          { label: topicTitle },
        ]}
      />

      <article>
        <PageTitleBand title={topicTitle} iconSrc={category.icon} />
        <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">
          {interpolate(t.contentPages.topicLead, topicTitle)}
        </p>

        <ContentsNavigation
          items={[
            { href: '#overview', label: t.contentPages.overviewHeading },
            { href: '#check-points', label: t.contentPages.checkHeading },
            { href: '#contact', label: t.contentPages.contactHeading },
          ]}
        />

        <ContentSectionStack>
          <section id="overview" aria-labelledby="overview-heading" className="scroll-mt-24">
            <SectionHeading id="overview-heading">{t.contentPages.overviewHeading}</SectionHeading>
            <SectionBody>
              <p className="leading-8 text-fg">{t.contentPages.lifeTopicSummaries[topic.id]}</p>
            </SectionBody>
          </section>

          <section id="check-points" aria-labelledby="check-points-heading" className="scroll-mt-24">
            <SectionHeading id="check-points-heading">{t.contentPages.checkHeading}</SectionHeading>
            <DetailsTable rows={details} />
          </section>

          <ContactSection />
        </ContentSectionStack>

        <Link
          href={`/life/${category.slug}`}
          className={`${styles.animatedLink} mt-10 inline-flex items-center gap-2 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
        >
          <ChevronLeftIcon className="shrink-0" />
          <AnimatedLinkLabel>{t.contentPages.backToCategory}</AnimatedLinkLabel>
        </Link>
      </article>
    </PageFrame>
  );
}

export function NewsIndexView() {
  const { t, locale } = useI18n();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: t.contentPages.home, href: '/' }, { label: t.contentPages.newsIndexTitle }]} />
      <PageTitleBand title={t.contentPages.newsIndexTitle} />
      <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">{t.contentPages.newsIndexLead}</p>

      <section aria-labelledby="all-news" className="mt-12">
        <SectionHeading id="all-news">{t.contentPages.allNews}</SectionHeading>
        <ul className="mt-8">
          {newsArticles.map((article) => {
            const title = t.news.articles[article.id];
            const categoryLabel = article.category === 'new' ? t.news.category.new : t.news.category.featured;
            return (
              <li key={article.id} className="border-b border-line">
                <Link
                  href={`/news/${article.slug}`}
                  className="group grid min-h-14 gap-2 px-5 py-5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent md:grid-cols-[10rem_8rem_1fr_auto] md:items-start md:gap-5 md:px-6"
                >
                  <time dateTime={article.date} className="text-sm text-fg-muted">
                    {dateFormatter.format(new Date(article.date))}
                  </time>
                  <span className="text-sm font-semibold text-accent">{categoryLabel}</span>
                  <span className="font-bold leading-7 text-fg group-hover:text-accent">{title}</span>
                  <ChevronRightIcon className="hidden shrink-0 text-accent md:block" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </PageFrame>
  );
}

export function NewsArticleView({ article }: { article: NewsArticle }) {
  const { t, locale } = useI18n();
  const title = t.news.articles[article.id];
  const categoryLabel = article.category === 'new' ? t.news.category.new : t.news.category.featured;
  const date = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(article.date));
  const details = [
    [t.contentPages.newsScopeHeading, t.contentPages.newsScopeDescription],
    [t.contentPages.newsConfirmationHeading, t.contentPages.newsConfirmationDescription],
    [t.contentPages.newsActionHeading, t.contentPages.newsActionDescription],
  ] as const;

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: t.contentPages.home, href: '/' },
          { label: t.contentPages.newsIndexTitle, href: '/news' },
          { label: title },
        ]}
      />

      <article>
        <div className="mb-5 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm text-fg-muted">
          <span className="font-semibold text-accent">{categoryLabel}</span>
          <span>
            {t.contentPages.publishedLabel}: {date}
          </span>
        </div>
        <PageTitleBand title={title} />

        <ContentsNavigation
          items={[
            { href: '#news-overview', label: t.contentPages.overviewHeading },
            { href: '#news-check', label: t.contentPages.checkHeading },
            { href: '#contact', label: t.contentPages.contactHeading },
          ]}
        />

        <ContentSectionStack>
          <section id="news-overview" aria-labelledby="news-overview-heading" className="scroll-mt-24">
            <SectionHeading id="news-overview-heading">{t.contentPages.overviewHeading}</SectionHeading>
            <SectionBody>
              <p className="leading-8 text-fg">{t.contentPages.newsSummaries[article.id]}</p>
            </SectionBody>
          </section>

          <section id="news-check" aria-labelledby="news-check-heading" className="scroll-mt-24">
            <SectionHeading id="news-check-heading">{t.contentPages.checkHeading}</SectionHeading>
            <DetailsTable rows={details} />
          </section>

          <ContactSection />
        </ContentSectionStack>

        <Link
          href="/news"
          className={`${styles.animatedLink} mt-10 inline-flex items-center gap-2 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
        >
          <ChevronLeftIcon className="shrink-0" />
          <AnimatedLinkLabel>{t.contentPages.allNews}</AnimatedLinkLabel>
        </Link>
      </article>
    </PageFrame>
  );
}
