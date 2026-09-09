"use client";

import { PublicAdminLink } from "@/app/components/PublicAdminLink";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { localeNames } from "@/app/i18n/dictionaries";
import { setStoredTheme, useIsDarkTheme } from "@/app/components/theme-store";
import { UniversityIcon as Icon } from "./icons/UniversityIcon";
import {
  universitySectionIcons,
  universityGuidanceKeys,
  universityGuidanceIcons,
} from "./icons/universityIconMap";
import { ConsultationAvailability } from "./ConsultationAvailability";
import {
  univContent,
  type UniversityContent,
  type UniversitySectionKey,
} from "./content";

type Page = "home" | "registration" | UniversitySectionKey | "faq" | "news" | "consultation";

const paths: Record<UniversitySectionKey, string> = {
  admissions: "/admissions",
  academics: "/academics",
  "campus-life": "/campus-life",
  scholarships: "/scholarships",
  careers: "/careers",
};

function UniversityMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`${compact ? "h-10 w-10" : "h-11 w-11"} shrink-0 overflow-hidden rounded-md`}
    >
      <svg viewBox="0 0 48 48" className="h-full w-full">
        <rect width="48" height="48" rx="6" fill="#00118f" />
        <path d="M9 16.5 24 9l15 7.5L24 24 9 16.5Z" fill="#fff" />
        <path d="M14 21v9.5c4.5 4 15.5 4 20 0V21l-10 5-10-5Z" fill="#9db7f9" />
        <path
          d="M39 17v12"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function UniversityPortal({ page, children }: { page: Page; children?: ReactNode }) {
  const { locale } = useI18n();
  const c = univContent[locale];
  const state = useSearchParams().get("state") ?? "default";
  const [menuOpen, setMenuOpen] = useState(state === "mobile-nav-open");

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-surface text-fg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-white"
      >
        本文へ移動
      </a>
      <UniversityHeader
        content={c}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <main id="main-content" className="flex-1">
        {children}
        {page === "home" && <Home content={c} />}
        {page === "consultation" && <Consultation content={c} state={state} />}
        {page === "faq" && <Faq content={c} openFirst={state === "faq-open"} />}
        {page === "news" && <News content={c} />}
        {(
          [
            "admissions",
            "academics",
            "campus-life",
            "scholarships",
            "careers",
          ] as const
        ).includes(page as UniversitySectionKey) && (
          <Information content={c} section={page as UniversitySectionKey} />
        )}
      </main>
      <UniversityFooter content={c} />
    </div>
  );
}

function UniversityHeader({
  content,
  menuOpen,
  setMenuOpen,
}: {
  content: UniversityContent;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const entries = Object.entries(content.nav).filter(
    ([key]) => key !== "consultation",
  );
  const { availableLocales, locale, setLocale, t } = useI18n();
  const isDark = useIsDarkTheme();
  const nextLocale =
    availableLocales[
      (availableLocales.indexOf(locale) + 1) % availableLocales.length
    ];
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-t-4 border-line border-t-primary-700 bg-surface-raised">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center px-4 md:px-6">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 pr-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <UniversityMark />
            <span className="min-w-0 leading-tight">
              <span className="block text-xl font-bold tracking-wide md:text-2xl">
                {content.siteName}
              </span>
              <span className="block text-[10px] font-semibold tracking-[.18em] text-fg-muted">
                {content.siteNameRoman}
              </span>
            </span>
          </Link>
          <nav
            aria-label="主要ナビゲーション"
            className="ml-auto hidden items-center gap-5 xl:flex"
          >
            {entries.map(([key, label]) => (
              <Link
                key={key}
                href={
                  key in paths ? paths[key as UniversitySectionKey] : `/${key}`
                }
                className="text-sm font-semibold text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                {label}
              </Link>
            ))}
            <Link
              href="/consultation"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {content.nav.consultation}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1 xl:ml-5">
            <button
              type="button"
              aria-label="テーマを切り替える"
              onClick={() => setStoredTheme(!isDark)}
              className="hidden h-11 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex"
            >
              {isDark ? t.theme.light : t.theme.dark}
            </button>
            <button
              type="button"
              aria-label="言語を選択"
              onClick={() => setLocale(nextLocale)}
              className="hidden h-11 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex"
            >
              {localeNames[locale]}
            </button>
            <button
              type="button"
              aria-controls="university-mobile-menu"
              aria-expanded={menuOpen}
              aria-label="メニューを開く"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:hidden"
            >
              <Icon name="menu" className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>
      {menuOpen && (
        <div
          id="university-mobile-menu"
          className="fixed inset-0 z-[70] xl:hidden"
        >
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 cursor-default bg-black/45"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="主要ナビゲーション"
            className="absolute inset-y-0 right-0 flex h-dvh w-80 max-w-[86vw] flex-col border-l border-line bg-surface-raised shadow-2xl"
          >
            <div className="flex h-20 items-center justify-between border-b border-line px-5">
              <span className="font-bold">{content.siteName}メニュー</span>
              <button
                type="button"
                aria-label="メニューを閉じる"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Icon name="close" className="h-6 w-6" />
              </button>
            </div>
            <nav className="overflow-y-auto p-5">
              <ul className="divide-y divide-line-subtle">
                {entries.map(([key, label]) => (
                  <li key={key}>
                    <Link
                      onClick={() => setMenuOpen(false)}
                      href={
                        key in paths
                          ? paths[key as UniversitySectionKey]
                          : `/${key}`
                      }
                      className="flex min-h-12 items-center justify-between py-3 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {label}
                      <Icon name="chevron" />
                    </Link>
                  </li>
                ))}
                <li><NotificationRegistrationLink onNavigate={() => setMenuOpen(false)} /></li>
              </ul>
              <Link
                onClick={() => setMenuOpen(false)}
                href="/consultation"
                className="mt-6 flex min-h-12 items-center justify-center rounded-md bg-primary px-4 py-3 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {content.nav.consultation}
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function UniversityFooter({ content }: { content: UniversityContent }) {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-line bg-primary-50 text-fg dark:bg-surface-raised">
      <div className="mx-auto max-w-7xl px-5 py-10 md:px-8">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr_1fr]">
          <div className="flex items-start gap-3">
            <UniversityMark compact />
            <div>
              <p className="font-bold">{content.siteName}</p>
              <p className="mt-2 text-sm leading-6 text-fg-muted">
                {content.footer.description}
                <br />
                {content.portalLabel}
              </p>
            </div>
          </div>
          <nav aria-label={content.footer.universityInfo}>
            <p className="font-bold">{content.footer.universityInfo}</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>
                <Link
                  href="/campus-life"
                  className="hover:text-accent hover:underline"
                >
                  {content.footer.campusAccess}
                </Link>
              </li>
              <li>
                <Link
                  href="/news"
                  className="hover:text-accent hover:underline"
                >
                  {content.footer.universityNews}
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-accent hover:underline">
                  {content.faq.title}
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label={content.footer.support}>
            <p className="font-bold">{content.footer.support}</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>
                <Link
                  href="/consultation"
                  className="font-bold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  {content.nav.consultation}
                </Link>
              </li>
              <li><Link href="/notifications/register" className="font-bold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">{t.universityOutreach.registerLink}</Link></li>
              <li>
                <PublicAdminLink
                  tenant="univ"
                  className="hover:text-accent hover:underline"
                >
                  {content.footer.admin}
                </PublicAdminLink>
              </li>
              <li>
                <span>
                  {content.consultation.hours.replace("受付時間：", "")}
                </span>
              </li>
            </ul>
          </nav>
        </div>
        <p className="mt-8 border-t border-primary-200 pt-5 text-xs text-fg-muted dark:border-line">
          © {content.siteNameRoman}
        </p>
      </div>
    </footer>
  );
}

function Home({ content }: { content: UniversityContent }) {
  const sections = Object.keys(content.sections) as UniversitySectionKey[];
  const supportKeys = [...sections, "faq"] as Array<
    UniversitySectionKey | "faq"
  >;
  return (
    <>
      <section className="border-b border-primary-200 bg-primary-50 dark:border-line dark:bg-surface-raised">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:px-8 md:py-16 lg:grid-cols-[1.3fr_.7fr] lg:items-center">
          <div>
            <p className="text-sm font-bold tracking-[.12em] text-primary-700 dark:text-primary-300">
              {content.home.portalKicker}
            </p>
            <h1 className="mt-3 max-w-3xl whitespace-pre-line text-3xl font-bold leading-tight md:text-5xl">
              {content.home.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-fg-muted md:text-lg">
              {content.home.lead}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/consultation"
                className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {content.home.chooseConsultation}
                <Icon name="arrow" />
              </Link>
              <a
                href="#support"
                className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 py-3 font-bold transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {content.home.exploreSupport}
                <Icon name="search" />
              </a>
            </div>
          </div>
          <div className="border-l-4 border-primary-500 bg-surface px-6 py-6 dark:bg-surface">
            <p className="text-sm font-bold text-accent">
              {content.home.todaySupport}
            </p>
            <p className="mt-2 text-2xl font-bold">
              {content.consultation.hours.replace("受付時間：", "")}
            </p>
            <p className="mt-3 text-sm leading-6 text-fg-muted">
              {content.home.todaySupportLead}
            </p>
            <Link
              href="/consultation?state=now-open"
              className="mt-5 inline-flex items-center gap-2 font-bold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {content.home.instantHomeAction}
              <Icon name="chevron" />
            </Link>
          </div>
        </div>
      </section>
      <Journey items={content.home.journey} leads={content.home.journeyLead} />
      <section
        id="support"
        className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-accent">
              {content.home.supportKicker}
            </p>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">
              {content.home.supportHeading}
            </h2>
          </div>
          <Link
            href="/faq"
            className="font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {content.home.supportFaqAction}
          </Link>
        </div>
        <ul className="mt-8 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {supportKeys.map((key) => (
            <li key={key} className="border-b border-r border-line">
              <Link
                href={key === "faq" ? "/faq" : paths[key]}
                className="group flex min-h-40 flex-col px-5 py-5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              >
                <span className="text-accent">
                  <Icon
                    name={universitySectionIcons[key]}
                    className="h-7 w-7"
                  />
                </span>
                <span className="mt-4 text-lg font-bold group-hover:text-accent">
                  {key === "faq"
                    ? content.faq.title
                    : content.sections[key].title}
                </span>
                <span className="mt-2 text-sm leading-6 text-fg-muted">
                  {content.home.supportDescriptions[key]}
                </span>
                <span className="mt-auto flex justify-end pt-4 text-accent">
                  <Icon name="arrow" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <NotificationEntry />
      </section>
      <section className="border-t border-line bg-surface-raised">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-bold md:text-3xl">
              {content.home.newsHeading}
            </h2>
            <Link
              href="/news"
              className="font-semibold text-accent hover:underline"
            >
              {content.home.newsAction}
            </Link>
          </div>
          <HomeNewsRows content={content} />
        </div>
      </section>
    </>
  );
}

function Journey({
  items,
  leads,
}: {
  items: readonly string[];
  leads: readonly string[];
}) {
  return (
    <section
      aria-labelledby="journey-title"
      className="mx-auto max-w-7xl px-5 py-10 md:px-8"
    >
      <h2 id="journey-title" className="sr-only">
        学生支援の流れ
      </h2>
      <ol className="grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line">
        {items.map((item, index) => (
          <li
            key={item}
            className="flex gap-4 border-t border-line px-3 py-5 first:border-t-0 md:border-t-0 md:px-6"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              {index + 1}
            </span>
            <div>
              <p className="font-bold">{item}</p>
              <p className="mt-1 text-sm leading-6 text-fg-muted">
                {leads[index]}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Consultation({
  content,
  state,
}: {
  content: UniversityContent;
  state: string;
}) {
  if (state === "reserve" || state === "chat-triggered")
    return <ReservationConsultation content={content} state={state} />;
  if (
    [
      "now-open",
      "now-mixed",
      "now-stale",
      "now-closed",
      "now-unconfigured",
    ].includes(state)
  )
    return <ImmediateConsultation content={content} state={state} />;
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <Breadcrumb current={content.consultation.title} />
      <PageTitle
        title={content.consultation.title}
        lead={content.consultation.lead}
      />
      <section aria-labelledby="choose-title" className="mt-12">
        <h2 id="choose-title" className="text-2xl font-bold">
          {content.home.chooseConsultation}
        </h2>
        <div className="mt-6 grid border-l border-t border-line md:grid-cols-2">
          <article className="flex flex-col border-b border-r border-line px-6 py-7">
            <span className="text-accent">
              <Icon name="calendar" className="h-10 w-10" />
            </span>
            <h3 className="mt-4 text-xl font-bold">
              {content.consultation.reserveTitle}
            </h3>
            <p className="mt-3 leading-7 text-fg-muted">
              {content.consultation.reserveLead}
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex gap-2">
                <Icon name="check" className="h-5 w-5 shrink-0 text-accent" />
                {content.consultation.chatChannel}
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="h-5 w-5 shrink-0 text-accent" />
                5言語に対応
              </li>
            </ul>
            <div className="mt-auto pt-7">
              <Link
                href="/consultation?state=reserve"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 font-bold text-white hover:bg-primary-900"
              >
                {content.consultation.reserveAction}
                <Icon name="arrow" />
              </Link>
            </div>
          </article>
          <article className="flex flex-col border-b border-r border-line px-6 py-7">
            <span className="text-accent">
              <Icon name="video" className="h-10 w-10" />
            </span>
            <h3 className="mt-4 text-xl font-bold">
              {content.consultation.instantTitle}
            </h3>
            <p className="mt-3 leading-7 text-fg-muted">
              {content.consultation.instantLead}
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex gap-2 font-semibold">
                <Icon name="clock" className="h-5 w-5 shrink-0 text-accent" />
                {content.consultation.hours.replace("受付時間：", "")}
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="h-5 w-5 shrink-0 text-accent" />
                {content.consultation.instantExtra}
              </li>
            </ul>
            <div className="mt-auto pt-7">
              <Link
                href="/consultation?state=now-open"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 font-bold hover:bg-surface-hover"
              >
                {content.consultation.instantAction}
                <Icon name="arrow" />
              </Link>
            </div>
          </article>
        </div>
      </section>
      <ConsultationSupportingContent content={content} />
    </div>
  );
}

function ConsultationSupportingContent({
  content,
}: {
  content: UniversityContent;
}) {
  return (
    <>
      <section aria-labelledby="consultation-flow-title" className="mt-14">
        <p className="text-sm font-bold text-accent">HOW IT WORKS</p>
        <h2 id="consultation-flow-title" className="mt-2 text-2xl font-bold">
          {content.consultation.flowTitle}
        </h2>
        <ol className="mt-6 grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line">
          {content.consultation.flow.map(([item, lead], index) => (
            <li
              key={item}
              className="flex gap-4 border-t border-line px-4 py-6 first:border-t-0 md:border-t-0 md:px-6"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="font-bold">{item}</h3>
                <p className="mt-2 text-sm leading-6 text-fg-muted">{lead}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="before-consultation-title" className="mt-14">
        <h2 id="before-consultation-title" className="text-2xl font-bold">
          {content.consultation.beforeTitle}
        </h2>
        <div className="mt-6 grid border-l border-t border-line md:grid-cols-3">
          {universityGuidanceKeys.map((key, index) => {
            const [title, description] = content.consultation.before[index];
            return (
              <article
                className="border-b border-r border-line bg-primary-50 px-5 py-6 dark:bg-surface-raised md:px-6"
                key={key}
              >
                <span className="text-accent">
                  <Icon
                    name={universityGuidanceIcons[key]}
                    className="h-8 w-8"
                  />
                </span>
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-fg-muted">
                  {description}
                </p>
              </article>
            );
          })}
        </div>
      </section>
      <section
        aria-labelledby="consultation-faq-title"
        className="mt-14 w-full"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="consultation-faq-title" className="text-2xl font-bold">
            {content.consultation.faqTitle}
          </h2>
          <Link
            href="/faq"
            className="font-semibold text-accent hover:underline"
          >
            {content.consultation.allFaqs}
          </Link>
        </div>
        <FaqList
          questions={content.consultation.faqs}
          className="mt-6"
        />
      </section>
      <aside className="mt-10 border-l-4 border-primary-500 bg-primary-50 px-5 py-4 text-sm leading-6 dark:bg-surface-raised">
        <p className="font-bold">{content.consultation.privacyTitle}</p>
        <p className="mt-1 text-fg-muted">{content.consultation.privacyLead}</p>
      </aside>
    </>
  );
}

function ReservationConsultation({
  content,
  state,
}: {
  content: UniversityContent;
  state: string;
}) {
  const [chatStarted, setChatStarted] = useState(state === "chat-triggered");
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <Breadcrumb current={content.consultation.reserveTitle} />
      <PageTitle
        title={content.consultation.reserveTitle}
        lead={content.consultation.reservePageLead}
      />
      <ol className="mt-10 grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line">
        {content.consultation.reserveSteps.map((item, index) => (
          <li
            key={item}
            className="border-t border-line px-5 py-5 first:border-t-0 md:border-t-0"
          >
            <p className="text-sm font-bold text-accent">STEP {index + 1}</p>
            <p className="mt-2 font-bold">{item}</p>
          </li>
        ))}
      </ol>
      <section aria-labelledby="channel-title" className="mt-12">
        <h2 id="channel-title" className="text-2xl font-bold">
          {content.consultation.reserveChannelTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          {content.consultation.reservePreparation}
        </p>
        <div className="mt-6 grid border-l border-t border-line md:grid-cols-2">
          <article className="border-b border-r border-line px-6 py-6">
            <span className="text-accent">
              <Icon name="chat" className="h-9 w-9" />
            </span>
            <h3 className="mt-4 text-xl font-bold">
              {content.consultation.chatTitle}
            </h3>
            <p className="mt-3 text-sm leading-6 text-fg-muted">
              {content.consultation.chatLead}
            </p>
            <button
              type="button"
              onClick={() => setChatStarted(true)}
              className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 font-bold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {content.consultation.chatAction}
              <Icon name="chat" />
            </button>
          </article>
          <article className="border-b border-r border-line px-6 py-6">
            <span className="text-accent">
              <Icon name="phone" className="h-9 w-9" />
            </span>
            <h3 className="mt-4 text-xl font-bold">
              {content.consultation.phoneTitle}
            </h3>
            <p className="mt-3 text-sm leading-6 text-fg-muted">
              {content.consultation.phoneLead}
            </p>
            <button
              type="button"
              className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 py-3 font-bold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {content.consultation.phoneAction}
              <Icon name="phone" />
            </button>
          </article>
        </div>
        <div
          className="mt-6 flex flex-wrap gap-2"
          aria-label={content.consultation.languagesLabel}
        >
          {content.consultation.languages.map((language) => (
            <span
              className="border border-line px-3 py-1 text-sm"
              key={language}
            >
              {language}
            </span>
          ))}
        </div>
        {chatStarted ? (
          <p
            role="status"
            className="mt-6 border-l-4 border-primary-500 bg-primary-50 px-5 py-4 font-semibold dark:bg-surface-raised"
          >
            {content.consultation.chatStarted}
          </p>
        ) : (
          <p role="status" className="sr-only" />
        )}
      </section>
    </div>
  );
}

function ImmediateConsultation({
  content,
  state,
}: {
  content: UniversityContent;
  state: string;
}) {
  const labels = {
    admissions: content.consultation.services[0][0],
    "student-support": content.consultation.services[1][0],
    careers: content.consultation.services[2][0],
  };
  const descriptions = {
    admissions: content.consultation.services[0][1],
    "student-support": content.consultation.services[1][1],
    careers: content.consultation.services[2][1],
  };
  const closed = state === "now-closed";
  const unconfigured = state === "now-unconfigured";
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <Breadcrumb current={content.consultation.instantTitle} />
      <PageTitle
        title={content.consultation.instantTitle}
        lead={content.consultation.instantPageLead}
      />
      <div className="mt-6 inline-flex items-center gap-2 border border-line bg-surface-raised px-4 py-2 text-sm font-bold">
        <Icon name="clock" className="h-5 w-5 text-accent" />
        {content.consultation.hours}
      </div>
      {closed || unconfigured ? (
        <section className="mt-12 max-w-4xl border border-line bg-surface-raised px-6 py-8">
          <span className="text-accent">
            <Icon
              name={unconfigured ? "warning" : "clock"}
              className="h-10 w-10"
            />
          </span>
          <h2 className="mt-4 text-2xl font-bold">
            {unconfigured
              ? content.consultation.unconfiguredTitle
              : content.consultation.closedTitle}
          </h2>
          <p className="mt-3 leading-7 text-fg-muted">
            {unconfigured
              ? content.consultation.unconfigured
              : content.consultation.closedLead}
          </p>
        </section>
      ) : (
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-accent">
                LIVE VIDEO SUPPORT
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {content.consultation.instantSectionTitle}
              </h2>
            </div>
            <div className="text-right">
              <p className="max-w-xl text-sm leading-6 text-fg-muted">
                {content.consultation.instantSectionLead}
              </p>
              <p
                aria-live="polite"
                className="mt-1 text-xs font-semibold text-fg-muted"
              >
                {state === "now-stale"
                  ? content.consultation.refreshingStatus
                  : content.consultation.refreshStatus}
              </p>
            </div>
          </div>
          <ConsultationAvailability
            labels={labels}
            descriptions={descriptions}
            previewState={state}
            copy={{
              ready: content.consultation.ready,
              busy: content.consultation.busy,
              busyAction: content.consultation.busyAction,
              unavailable: content.consultation.unavailable,
              unavailableAction: content.consultation.unavailableAction,
              unknown: content.consultation.unknown,
              unknownAction: content.consultation.unknownAction,
              launch: content.consultation.launch,
            }}
          />
        </section>
      )}
    </div>
  );
}

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="パンくず" className="mb-8 text-sm text-fg-muted">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href="/" className="text-accent hover:underline">
            ホーム
          </Link>
        </li>
        <li aria-hidden="true">
          <Icon name="chevron" className="h-4 w-4" />
        </li>
        <li aria-current="page" className="text-fg">
          {current}
        </li>
      </ol>
    </nav>
  );
}

function PageTitle({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <header className="border-l-[6px] border-primary-700 bg-primary-50 px-5 py-5 dark:border-primary-400 dark:bg-surface-raised md:px-7 md:py-6">
        <h1 className="text-2xl font-bold leading-snug md:text-4xl">{title}</h1>
      </header>
      <p className="mt-6 max-w-4xl text-base leading-8 text-fg-muted">{lead}</p>
    </>
  );
}
function Information({
  content,
  section,
}: {
  content: UniversityContent;
  section: UniversitySectionKey;
}) {
  const data = content.sections[section];
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <Breadcrumb current={data.title} />
      <PageTitle title={data.title} lead={data.lead} />
      <nav
        aria-label={content.information.contentsLabel}
        className="mt-10 border-y border-line py-5"
      >
        <p className="font-bold">{content.information.contentsLabel}</p>
        <ul className="mt-3 grid gap-x-8 md:grid-cols-3">
          {data.items.map(([title]) => (
            <li key={title}>
              <a
                href={`#${title}`}
                className="flex min-h-11 items-center gap-2 py-2 font-semibold text-accent hover:underline"
              >
                <Icon name="chevron" className="h-4 w-4 rotate-90" />
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-12 max-w-5xl space-y-12">
        {data.items.map(([title, description]) => (
          <section id={title} className="scroll-mt-24" key={title}>
            <h2 className="border-l-4 border-accent bg-surface-hover px-5 py-4 text-xl font-bold md:text-2xl">
              {title}
            </h2>
            <div className="px-5 py-6 md:px-6">
              <p className="leading-8">{description}</p>
              <Link
                href="/consultation?state=reserve"
                className="mt-5 inline-flex items-center gap-2 font-bold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {content.information.consultAction}
                <Icon name="arrow" />
              </Link>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
function Faq({
  content,
  openFirst,
}: {
  content: UniversityContent;
  openFirst: boolean;
}) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <Breadcrumb current={content.faq.title} />
      <PageTitle title={content.faq.title} lead={content.faq.lead} />
      <div className="mt-10 max-w-5xl">
        <div className="border border-line bg-surface-raised px-4 py-4">
          <label
            htmlFor="university-faq-search"
            className="block text-sm font-bold"
          >
            {content.faq.searchLabel}
          </label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted">
              <Icon name="search" />
            </span>
            <input
              id="university-faq-search"
              type="search"
              placeholder={content.faq.searchPlaceholder}
              className="h-12 w-full rounded-md border border-line bg-surface pl-10 pr-3 text-fg outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
            />
          </div>
        </div>
        <section className="mt-10">
          <h2 className="text-xl font-bold md:text-2xl">
            {content.faq.popularTitle}
          </h2>
          <FaqList
            questions={content.faq.questions}
            className="mt-5"
            openFirst={openFirst}
          />
        </section>
      </div>
    </div>
  );
}
function FaqList({
  questions,
  className = "mt-8",
  openFirst = false,
}: {
  questions: readonly [string, string][];
  className?: string;
  openFirst?: boolean;
}) {
  return (
    <div className={`${className} border-x border-b border-line`}>
      {questions.map(([question, answer], index) => (
        <details
          className="group border-t border-line"
          key={question}
          open={openFirst && index === 0}
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 bg-surface-raised px-5 py-4 font-bold leading-7 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
            <span className="flex-1">
              <span className="mr-2 text-accent">Q.</span>
              {question}
            </span>
            <span className="text-accent transition-transform group-open:rotate-90">
              <Icon name="chevron" />
            </span>
          </summary>
          <div className="border-t border-line-subtle bg-surface px-5 py-5 leading-8">
            <span className="mr-2 font-bold text-accent">A.</span>
            {answer}
          </div>
        </details>
      ))}
    </div>
  );
}
function News({ content }: { content: UniversityContent }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <Breadcrumb current={content.news.title} />
      <PageTitle title={content.news.title} lead={content.news.lead} />
      <section aria-labelledby="news-list-title" className="mt-12">
        <h2 id="news-list-title" className="sr-only">
          ニュース一覧
        </h2>
        <ul className="grid border-l border-t border-line md:grid-cols-2">
          {content.news.articles.map(([date, category, title, summary]) => (
            <li className="border-b border-r border-line" key={title}>
              <Link
                href="/academics"
                className="group flex h-full flex-col px-5 py-6 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <time className="text-sm text-fg-muted">{date}</time>
                  <span className="inline-flex whitespace-nowrap bg-primary-50 px-2 py-1 text-xs font-bold text-primary-800 dark:bg-surface-hover dark:text-primary-300">
                    {category}
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-bold leading-7 group-hover:text-accent">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-fg-muted">
                  {summary}
                </p>
                <span className="mt-auto flex justify-end pt-5 text-accent">
                  <Icon name="arrow" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
function HomeNewsRows({ content }: { content: UniversityContent }) {
  return (
    <ul className="mt-6 divide-y divide-line">
      {content.news.articles.slice(0, 3).map(([date, , title]) => (
        <li key={title}>
          <Link
            href="/news"
            className="grid gap-2 py-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:grid-cols-[10rem_1fr]"
          >
            <time className="text-sm text-fg-muted">{date}</time>
            <span className="font-semibold">{title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NotificationRegistrationLink({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return <Link onClick={onNavigate} href="/notifications/register" className="flex min-h-12 items-center py-3 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{t.universityOutreach.registerLink}</Link>;
}
function NotificationEntry() {
  const { t } = useI18n(), c = t.universityOutreach;
  return <div id="phone-notice-entry" className="mt-8 flex flex-col gap-4 border-y border-line py-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">{c.homeTitle}</h2><p className="mt-2 text-sm leading-7 text-fg-muted">{c.homeLead}</p></div><Link href="/notifications/register" className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{c.registerLink}<Icon name="arrow" /></Link></div>;
}
