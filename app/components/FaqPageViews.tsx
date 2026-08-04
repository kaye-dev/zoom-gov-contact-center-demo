'use client';

import Link from 'next/link';

import type {
  FaqDepartmentPageData,
  FaqDetailPageData,
  FaqIndexData,
} from '@/lib/faq-content';

import { useI18n } from '../i18n/LanguageProvider';
import styles from './InformationPageViews.module.css';
import {
  AnimatedLinkLabel,
  Breadcrumbs,
  PageFrame,
  PageTitleBand,
  SectionHeading,
} from './InformationPageViews';
import { ChevronDownIcon } from './svg/ChevronDownIcon';
import { ChevronLeftIcon } from './svg/ChevronLeftIcon';
import { ChevronRightIcon } from './svg/ChevronRightIcon';

const FAQ_INDEX_PATH = '/life/frequently-asked-questions';
const FAQ_ICON_PATH = '/life-information/life-faq.png';

function interpolate(
  message: string,
  values: Readonly<Record<string, string | number>>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`${styles.animatedLink} mt-10 inline-flex items-center gap-2 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      <ChevronLeftIcon className="shrink-0" />
      <AnimatedLinkLabel>{label}</AnimatedLinkLabel>
    </Link>
  );
}

export function FaqIndexView({ data }: { data: FaqIndexData }) {
  const { locale, t } = useI18n();
  const faq = t.contentPages.faq;
  const pageTitle = t.findInfo.lifeInfo.items.faq;

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: t.contentPages.home, href: '/' },
          { label: t.contentPages.lifeIndexTitle, href: '/life' },
          { label: pageTitle },
        ]}
      />
      <PageTitleBand title={pageTitle} iconSrc={FAQ_ICON_PATH} />
      <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">
        {faq.indexLead}
      </p>

      <section aria-labelledby="faq-departments-heading" className="mt-12">
        <SectionHeading id="faq-departments-heading">
          {faq.departmentsHeading}
        </SectionHeading>
        <ul className="mt-8 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {data.departments.map((department) => (
            <li
              key={department.slug}
              className="border-b border-r border-line"
            >
              <Link
                href={`${FAQ_INDEX_PATH}/${department.slug}`}
                className="group flex min-h-28 items-center gap-4 px-5 py-5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              >
                <span className="flex-1">
                  <span className="block font-bold leading-7 text-fg group-hover:text-accent">
                    {department.labels[locale]}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-fg-muted">
                    {department.organizationLabels[locale]}
                  </span>
                </span>
                <ChevronRightIcon className="shrink-0 text-accent" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageFrame>
  );
}

export function FaqDepartmentView({
  data,
}: {
  data: FaqDepartmentPageData;
}) {
  const { locale, t } = useI18n();
  const faq = t.contentPages.faq;
  const pageTitle = t.findInfo.lifeInfo.items.faq;
  const departmentTitle = data.labels[locale];

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: t.contentPages.home, href: '/' },
          { label: t.contentPages.lifeIndexTitle, href: '/life' },
          { label: pageTitle, href: FAQ_INDEX_PATH },
          { label: departmentTitle },
        ]}
      />
      <PageTitleBand title={departmentTitle} iconSrc={FAQ_ICON_PATH} />
      <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">
        {interpolate(faq.departmentLead, { name: departmentTitle })}
      </p>
      <p className="mt-2 max-w-6xl text-sm leading-7 text-fg-muted">
        {data.organizationLabels[locale]}
      </p>

      <section aria-labelledby="faq-categories-heading" className="mt-12">
        <SectionHeading id="faq-categories-heading">
          {faq.categoriesHeading}
        </SectionHeading>
        <ul className="mt-8 grid border-l border-t border-line md:grid-cols-2">
          {data.categories.map((category) => {
            const categoryTitle = category.labels[locale];

            return (
              <li
                key={category.slug}
                className="border-b border-r border-line"
              >
                <Link
                  href={`${FAQ_INDEX_PATH}/${data.slug}/${category.slug}`}
                  className="group flex min-h-24 items-center gap-4 px-5 py-5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                >
                  <span className="flex-1 font-bold leading-7 text-fg group-hover:text-accent">
                    {categoryTitle}
                  </span>
                  <ChevronRightIcon className="shrink-0 text-accent" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <BackLink href={FAQ_INDEX_PATH} label={faq.backToIndex} />
    </PageFrame>
  );
}

export function FaqDetailView({
  data,
}: {
  data: FaqDetailPageData;
}) {
  const { locale, t } = useI18n();
  const faq = t.contentPages.faq;
  const pageTitle = t.findInfo.lifeInfo.items.faq;
  const { department, category } = data;
  const departmentTitle = department.labels[locale];
  const categoryTitle = category.labels[locale];
  const items = category.items[locale];

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: t.contentPages.home, href: '/' },
          { label: t.contentPages.lifeIndexTitle, href: '/life' },
          { label: pageTitle, href: FAQ_INDEX_PATH },
          {
            label: departmentTitle,
            href: `${FAQ_INDEX_PATH}/${department.slug}`,
          },
          { label: categoryTitle },
        ]}
      />

      <article>
        <PageTitleBand title={categoryTitle} iconSrc={FAQ_ICON_PATH} />
        <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">
          {interpolate(faq.categoryLead, { name: categoryTitle })}
        </p>

        <section aria-labelledby="faq-questions-heading" className="mt-12 max-w-6xl">
          <SectionHeading id="faq-questions-heading">
            {faq.questionsHeading}
          </SectionHeading>
          <p className="mt-5 px-1 text-sm leading-6 text-fg-muted">
            {interpolate(faq.questionCount, { count: items.length })}
          </p>
          <ul className="mt-5 border-x border-b border-line">
            {items.map((item) => (
              <li key={item.no} className="border-t border-line">
                <details className="group">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 bg-surface-raised px-5 py-4 font-bold leading-7 text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 flex-1 items-start gap-2">
                      <span className="shrink-0">Q{item.no}.</span>
                      <span>{item.question}</span>
                    </span>
                    <ChevronDownIcon className="shrink-0 text-accent transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <div className="border-t border-line-subtle bg-surface px-5 py-5 md:px-6 md:py-6">
                    <p className="flex items-start gap-2 leading-8 text-fg">
                      <span className="shrink-0 font-bold">A{item.no}.</span>
                      <span className="min-w-0 whitespace-pre-line">
                        {item.answer}
                      </span>
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <BackLink
          href={`${FAQ_INDEX_PATH}/${department.slug}`}
          label={faq.backToDepartment}
        />
      </article>
    </PageFrame>
  );
}
